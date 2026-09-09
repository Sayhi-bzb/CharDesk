import { describe, expect, it } from "vitest";
import {
  CellUiRuntime,
  Root,
  Slider,
  auditSemanticSnapshot,
  createTestPilot,
} from "./index.js";
import { resolvePointerAppearance } from "./pointer.js";
import {
  normalizeCellSliderValue,
  resolveCellSliderRange,
  stepCellSliderValue,
} from "./slider.js";

const slider = (value = 50, disabled = false, focused = false) => (
  <Root id="root" style={{ direction: "row" }}>
    <Slider
      id="volume"
      label="Volume"
      value={value}
      valueText={`${value} percent`}
      disabled={disabled}
      focused={focused}
    />
  </Root>
);

describe("Slider", () => {
  it("normalizes finite stepped ranges with reachable endpoints", () => {
    expect(resolveCellSliderRange()).toEqual({ min: 0, max: 100, step: 1 });
    expect(resolveCellSliderRange(10, 5, 2)).toEqual({ min: 10, max: 12, step: 2 });
    const range = resolveCellSliderRange(0, 10, 3);
    expect(normalizeCellSliderValue(4.8, range)).toBe(6);
    expect(normalizeCellSliderValue(9.8, range)).toBe(10);
    expect(stepCellSliderValue(9, range, 1)).toBe(10);
    expect(stepCellSliderValue(10, range, -1)).toBe(9);
    expect(stepCellSliderValue(0, range, 1, 10)).toBe(10);
    expect(normalizeCellSliderValue(0.3, resolveCellSliderRange(0, 1, 0.1))).toBe(0.3);
    expect(normalizeCellSliderValue(3e-7, resolveCellSliderRange(0, 1e-6, 1e-7))).toBe(3e-7);
  });

  it("renders an owned one-row track and invalidates only value projections", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 1 } });
    const frame = runtime.render(slider());

    expect(frame.buffer.toText({ trimEnd: true })).toBe("━━━━━━━━━━┃─────────");
    expect(frame.layout.entries.get("volume")?.rect).toEqual({ x: 0, y: 0, width: 20, height: 1 });
    for (let x = 0; x < 20; x += 1) {
      expect(frame.buffer.get(x, 0)?.ownerId).toBe("volume");
    }

    const updated = runtime.render(slider(75));
    expect(updated.layout).toBe(frame.layout);
    expect(updated.scene).toBe(frame.scene);
    expect(updated.invalidation).toMatchObject({
      phases: ["paint", "semantics", "present"],
      work: { layout: "reused", geometry: "reused", paint: "computed", semantics: "computed" },
    });
    expect(updated.buffer.toText({ trimEnd: true })).toBe("━━━━━━━━━━━━━━┃─────");

    const themed = new CellUiRuntime({
      viewport: { width: 5, height: 1 },
      theme: { sliderFilledTrack: "=", sliderEmptyTrack: ".", sliderThumb: "#" },
    });
    expect(themed.render(
      <Root id="root" style={{ direction: "row" }}>
        <Slider id="custom" label="Custom" value={50} style={{ width: 5 }} />
      </Root>
    ).buffer.toText({ trimEnd: true })).toBe("==#..");
    themed.dispose();
    runtime.dispose();
  });

  it("uses the same thumb-only glyph for pointer, keyboard and manipulation", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 1 } });
    const normal = runtime.render(slider(35));
    const hovered = runtime.render(slider(35), { hoveredId: "volume" });
    const manipulating = runtime.render(slider(35), {
      manipulatingIds: new Set(["volume"]),
    });
    const focusedAndHovered = runtime.render(slider(35), {
      focusedId: "volume",
      focusVisible: true,
      hoveredId: "volume",
    });

    expect(normal.buffer.toText({ trimEnd: true })).toBe("━━━━━━━┃────────────");
    expect(hovered.buffer.toText({ trimEnd: true })).toBe("━━━━━━━█────────────");
    expect(manipulating.buffer.toText({ trimEnd: true })).toBe("━━━━━━━█────────────");
    expect(manipulating.tree.nodes.get("volume")?.manipulating).toBe(true);
    const disabledManipulating = runtime.render(slider(35, true), {
      manipulatingIds: new Set(["volume"]),
    });
    expect(disabledManipulating.buffer.toText({ trimEnd: true })).toBe("━━━━━━━┃────────────");
    expect(disabledManipulating.tree.nodes.get("volume")?.manipulating).toBe(false);
    expect([...Array(20).keys()].map((x) => hovered.buffer.get(x, 0)?.style.backgroundColor))
      .toEqual(Array(20).fill(undefined));
    expect(focusedAndHovered.buffer.toText({ trimEnd: true })).toBe("━━━━━━━█────────────");
    expect(focusedAndHovered.buffer.get(0, 0)?.style).toEqual({});

    const themed = new CellUiRuntime({
      viewport: { width: 5, height: 1 },
      theme: { sliderEmphasizedThumb: "@" },
    });
    expect(themed.render(
      <Root id="root">
        <Slider id="custom" label="Custom" value={50} style={{ width: 5 }} />
      </Root>,
      { manipulatingIds: new Set(["custom"]) },
    ).buffer.toText({ trimEnd: true })).toBe("━━@──");
    themed.dispose();
    runtime.dispose();
  });

  it("uses one controlled command path for keyboard, precise tap, and drag", async () => {
    let value = 50;
    const commands: unknown[] = [];
    const pilot = createTestPilot({
      viewport: { width: 20, height: 1 },
      render: () => slider(value, false, true),
      onCommand: (command) => {
        commands.push(command);
        if (command.type === "set-value") value = command.value;
      },
    });

    await pilot.press("ArrowRight");
    expect(value).toBe(51);
    await pilot.press("ArrowUp");
    expect(value).toBe(52);
    await pilot.press("ArrowLeft");
    expect(value).toBe(51);
    await pilot.press("PageUp");
    expect(value).toBe(61);
    await pilot.press("Home");
    expect(value).toBe(0);
    await pilot.press("End", "PageDown");
    expect(value).toBe(90);

    await pilot.pointerDown({ x: 9, y: 0 }, 1, { x: 9.1, y: 0.5 });
    await pilot.pointerUp({ x: 9, y: 0 }, 1, { x: 9.1, y: 0.5 });
    expect(value).toBe(45);
    const firstProjection = pilot.text();
    await pilot.pointerDown({ x: 9, y: 0 }, 1, { x: 9.9, y: 0.5 });
    await pilot.pointerUp({ x: 9, y: 0 }, 1, { x: 9.9, y: 0.5 });
    expect(value).toBe(49);
    expect(pilot.text()).toBe(firstProjection);

    await pilot.pointerDown({ x: 9, y: 0 }, 2, { x: 9.5, y: 0.5 });
    expect(pilot.frame.tree.nodes.get("volume")?.manipulating).toBe(true);
    expect(pilot.text()).toContain("█");
    await pilot.pointerMove({ x: 15, y: 0 }, 2, { x: 15.5, y: 0.5 });
    expect(pilot.frame.tree.nodes.get("volume")?.manipulating).toBe(true);
    expect(pilot.text()).toContain("█");
    await pilot.pointerUp({ x: 15, y: 0 }, 2, { x: 15.5, y: 0.5 });
    expect(pilot.frame.tree.nodes.get("volume")?.manipulating).toBe(false);
    expect(pilot.text()).toContain("█"); // release retains pointer hover
    await pilot.pointerMove({ x: 25, y: 0 }, 2);
    expect(pilot.text()).not.toContain("█");
    expect(pilot.frame.confirmation).toBeUndefined();
    expect(value).toBe(79);
    expect(commands).toContainEqual({ type: "set-value", targetId: "volume", value: 79 });
    pilot.dispose();
  });

  it("projects numeric semantics and shared interaction states", async () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 1 } });
    const frame = runtime.render(slider(35), { focusedId: "volume" });
    expect(frame.semantics.nodes.get("volume")).toMatchObject({
      role: "slider",
      label: "Volume",
      valueNow: 35,
      valueMin: 0,
      valueMax: 100,
      valueText: "35 percent",
      orientation: "horizontal",
      actions: ["focus"],
    });
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
    expect(resolvePointerAppearance(frame, { x: 19, y: 0 }))
      .toEqual({ hoveredId: "volume", cursor: "pointer" });
    const focused = runtime.render(slider(35), { focusedId: "volume" });
    expect(focused.buffer.get(19, 0)?.style).toEqual({});
    expect(focused.buffer.toText()).toContain("█");

    let disabledValue = 35;
    const disabled = createTestPilot({
      viewport: { width: 20, height: 1 },
      render: () => slider(disabledValue, true),
      onCommand: (command) => {
        if (command.type === "set-value") disabledValue = command.value;
      },
    });
    await disabled.press("ArrowRight");
    await disabled.click({ x: 19, y: 0 });
    expect(disabledValue).toBe(35);
    expect(disabled.getByRole("slider", { name: "Volume" })).toMatchObject({
      disabled: true,
      actions: [],
    });
    expect(resolvePointerAppearance(disabled.frame, { x: 19, y: 0 }))
      .toEqual({ hoveredId: null, cursor: "default" });
    disabled.dispose();
    runtime.dispose();
  });
});
