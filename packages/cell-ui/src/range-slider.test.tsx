import { describe, expect, it } from "vitest";
import {
  CellUiRuntime,
  RangeSlider,
  RangeSliderThumb,
  Root,
  auditSemanticSnapshot,
  createTestPilot,
  type WidgetCommand,
} from "./index.js";
import {
  cellRangeSliderThumbIndexAtCoordinate,
  normalizeCellRangeSliderValues,
  resolveCellSliderRange,
} from "./slider.js";

const rangeSlider = (
  values: readonly [number, number] = [30, 70],
  focusedId = "volume-start",
  disabled = false,
) => (
  <Root id="root">
    <RangeSlider
      id="volume-range"
      label="Volume"
      min={0}
      max={100}
      step={1}
      disabled={disabled}
      style={{ width: 20 }}
    >
      <RangeSliderThumb
        id="volume-start"
        label="Minimum volume"
        value={values[0]}
        valueText={`${values[0]} percent`}
        focused={focusedId === "volume-start"}
      />
      <RangeSliderThumb
        id="volume-end"
        label="Maximum volume"
        value={values[1]}
        valueText={`${values[1]} percent`}
        focused={focusedId === "volume-end"}
      />
    </RangeSlider>
  </Root>
);

describe("RangeSlider", () => {
  it("normalizes the controlled pair and resolves nearest-thumb ties", () => {
    const range = resolveCellSliderRange(0, 100, 1);
    expect(normalizeCellRangeSliderValues(80, 20, range)).toEqual([20, 80]);
    expect(cellRangeSliderThumbIndexAtCoordinate(10, 0, 20, [30, 70], range)).toBe(0);
    expect(cellRangeSliderThumbIndexAtCoordinate(10, 0, 20, [30, 70], range, 1)).toBe(1);
  });

  it("owns one track while projecting two independently positioned thumbs", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 1 } });
    const frame = runtime.render(rangeSlider());

    expect(frame.buffer.toText({ trimEnd: true })).toBe("──────┃━━━━━━┃──────");
    expect(frame.scene.entries.get("volume-range")?.layoutBounds)
      .toEqual({ x: 0, y: 0, width: 20, height: 1 });
    expect(frame.scene.entries.get("volume-start")?.layoutBounds)
      .toEqual({ x: 6, y: 0, width: 1, height: 1 });
    expect(frame.scene.entries.get("volume-end")?.layoutBounds)
      .toEqual({ x: 13, y: 0, width: 1, height: 1 });
    expect(frame.buffer.get(6, 0)?.ownerId).toBe("volume-start");
    expect(frame.buffer.get(13, 0)?.ownerId).toBe("volume-end");
    expect(frame.buffer.get(8, 0)?.ownerId).toBe("volume-range");

    const reversed = runtime.render(rangeSlider([80, 20]));
    expect(reversed.tree.nodes.get("volume-start")?.sliderValue).toBe(20);
    expect(reversed.tree.nodes.get("volume-end")?.sliderValue).toBe(80);

    const negative = runtime.render(
      <Root id="root">
        <RangeSlider id="negative" label="Negative" min={-100} max={-10} style={{ width: 20 }}>
          <RangeSliderThumb id="negative-start" label="Minimum" value={-80} />
          <RangeSliderThumb id="negative-end" label="Maximum" value={-20} />
        </RangeSlider>
      </Root>,
    );
    expect(negative.tree.nodes.get("negative-start")?.sliderValue).toBe(-80);
    expect(negative.tree.nodes.get("negative-end")?.sliderValue).toBe(-20);
    runtime.dispose();
  });

  it("emphasizes only the active thumb for hover and captured manipulation", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 1 } });
    const hovered = runtime.render(rangeSlider([30, 70], ""), { hoveredId: "volume-start" });
    expect(hovered.buffer.toText({ trimEnd: true })).toBe("──────█━━━━━━┃──────");
    expect(hovered.buffer.get(5, 0)?.style.backgroundColor).toBeUndefined();

    const manipulating = runtime.render(rangeSlider([30, 70], ""), {
      manipulatingIds: new Set(["volume-end"]),
    });
    expect(manipulating.buffer.toText({ trimEnd: true })).toBe("──────┃━━━━━━█──────");

    const focused = runtime.render(rangeSlider(), {
      focusedId: "volume-start",
      focusVisible: true,
    });
    expect(focused.buffer.get(6, 0)?.style).toMatchObject({
      backgroundColor: "#000000",
      bold: true,
    });
    expect(focused.buffer.get(7, 0)?.style.backgroundColor).toBeUndefined();
    runtime.dispose();
  });

  it("moves only the targeted thumb and clamps it at the other thumb", async () => {
    let values: readonly [number, number] = [30, 70];
    let focusedId = "volume-start";
    const commands: WidgetCommand[] = [];
    const pilot = createTestPilot({
      viewport: { width: 20, height: 1 },
      render: () => rangeSlider(values, focusedId),
      onCommand: (command) => {
        commands.push(command);
        if (command.type === "focus") focusedId = command.targetId;
        if (command.type === "set-value") {
          focusedId = command.targetId;
          values = command.targetId === "volume-start"
            ? [command.value, values[1]]
            : [values[0], command.value];
        }
      },
    });

    await pilot.press("Tab");
    expect(focusedId).toBe("volume-end");
    await pilot.pressKey("Tab", { modifiers: { shift: true } });
    expect(focusedId).toBe("volume-start");

    await pilot.pointerDown({ x: 18, y: 0 }, 1, { x: 18.5, y: 0.5 });
    await pilot.pointerUp({ x: 18, y: 0 }, 1, { x: 18.5, y: 0.5 });
    expect(focusedId).toBe("volume-end");
    expect(values[1]).toBe(95);

    await pilot.pointerDown({ x: 18, y: 0 }, 1, { x: 18.5, y: 0.5 });
    await pilot.pointerMove({ x: 2, y: 0 }, 1, { x: 2.5, y: 0.5 });
    await pilot.pointerUp({ x: 2, y: 0 }, 1, { x: 2.5, y: 0.5 });
    expect(values).toEqual([30, 30]);
    expect(commands).toContainEqual({ type: "set-value", targetId: "volume-end", value: 30 });

    await pilot.semanticAction("volume-start", "focus");
    await pilot.press("End", "ArrowRight");
    expect(values).toEqual([30, 30]);
    pilot.dispose();
  });

  it("projects a named group with two constrained slider semantics", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 1 } });
    const frame = runtime.render(rangeSlider([30, 70], "volume-start"), {
      focusedId: "volume-start",
    });

    expect(frame.semantics.nodes.get("volume-range")).toMatchObject({
      role: "group",
      label: "Volume",
      actions: [],
    });
    expect(frame.semantics.nodes.get("volume-start")).toMatchObject({
      semanticParentId: "volume-range",
      role: "slider",
      label: "Minimum volume",
      valueNow: 30,
      valueMin: 0,
      valueMax: 70,
      focused: true,
      actions: ["focus"],
    });
    expect(frame.semantics.nodes.get("volume-end")).toMatchObject({
      semanticParentId: "volume-range",
      role: "slider",
      label: "Maximum volume",
      valueNow: 70,
      valueMin: 30,
      valueMax: 100,
      actions: ["focus"],
    });
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
    runtime.dispose();
  });

  it("requires exactly two direct thumbs and inherits disabled state", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 1 } });
    expect(() => runtime.render(
      <Root id="root">
        <RangeSlider id="invalid" label="Invalid">
          <RangeSliderThumb id="only" label="Only" value={50} />
        </RangeSlider>
      </Root>,
    )).toThrow("RangeSlider must contain exactly two RangeSliderThumb children.");

    const disabled = runtime.render(rangeSlider([30, 70], "volume-start", true), {
      manipulatingIds: new Set(["volume-start"]),
    });
    expect(disabled.tree.nodes.get("volume-start")?.disabled).toBe(true);
    expect(disabled.tree.nodes.get("volume-end")?.disabled).toBe(true);
    expect(disabled.tree.nodes.get("volume-start")?.manipulating).toBe(false);
    runtime.dispose();
  });
});
