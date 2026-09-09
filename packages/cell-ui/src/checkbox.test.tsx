import { describe, expect, it } from "vitest";
import {
  Checkbox,
  CellUiRuntime,
  FocusManager,
  Root,
  Text,
  auditSemanticSnapshot,
  commandForInput,
  createKeyInput,
  nextCellCheckboxState,
} from "./index.js";
import { resolvePointerAppearance } from "./pointer.js";

const checkboxes = (autosave = false) => (
  <Root id="root">
    <Checkbox id="autosave" checked={autosave}><Text>Autosave</Text></Checkbox>
    <Checkbox id="word-wrap" checked><Text>Word wrap</Text></Checkbox>
    <Checkbox id="select-all" checked="indeterminate"><Text>Select all</Text></Checkbox>
    <Checkbox id="disabled" disabled><Text>Disabled</Text></Checkbox>
  </Root>
);

describe("Checkbox", () => {
  it("renders copy-stable three-state chrome with protected Cell geometry", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 4 } });
    const frame = runtime.render(checkboxes());

    expect(frame.buffer.toText({ trimEnd: true })).toBe([
      "[ ] Autosave",
      "[x] Word wrap",
      "[-] Select all",
      "[ ] Disabled",
    ].join("\n"));
    expect(frame.layout.entries.get("autosave")).toMatchObject({
      rect: { width: 20, height: 1 },
      paddingInsets: { top: 0, right: 0, bottom: 0, left: 4 },
    });
    expect(frame.buffer.get(0, 0)).toMatchObject({ text: "[", ownerId: "autosave" });
    expect(frame.buffer.get(1, 0)).toMatchObject({ text: " ", ownerId: "autosave" });
    expect(frame.buffer.get(4, 0)).toMatchObject({ text: "A", ownerId: "autosave/text[0]" });
    const updated = runtime.render(checkboxes(true));
    expect(updated.layout).toBe(frame.layout);
    expect(updated.scene).toBe(frame.scene);
    expect(updated.invalidation).toMatchObject({
      phases: ["paint", "semantics", "present"],
      work: { layout: "reused", geometry: "reused", paint: "computed", semantics: "computed" },
    });
    expect(updated.buffer.toText({ trimEnd: true }).split("\n")[0]).toBe("[x] Autosave");

    const intrinsicRuntime = new CellUiRuntime({ viewport: { width: 20, height: 1 } });
    const intrinsic = intrinsicRuntime.render(
      <Root id="root" style={{ direction: "row" }}>
        <Checkbox id="intrinsic"><Text>Autosave</Text></Checkbox>
      </Root>
    );
    expect(intrinsic.layout.entries.get("intrinsic")?.rect.width).toBe(12);

    const padded = runtime.render(
      <Root id="root">
        <Checkbox id="padded" checked style={{ paddingLeft: 2 }}><Text>Label</Text></Checkbox>
      </Root>
    );
    expect(padded.layout.entries.get("padded")?.paddingInsets.left).toBe(6);
    expect(padded.buffer.toText({ trimEnd: true }).split("\n")[0]).toBe("[x]   Label");

    const themed = new CellUiRuntime({
      viewport: { width: 20, height: 1 },
      theme: { checkboxCheckedIndicator: "#" },
    });
    expect(themed.render(
      <Root id="root"><Checkbox id="custom" checked><Text>Custom</Text></Checkbox></Root>
    ).buffer.toText({ trimEnd: true })).toBe("[#] Custom");
    themed.dispose();
    intrinsicRuntime.dispose();
    runtime.dispose();
  });

  it("uses symmetric one-Cell spacing for an indicator-only checkbox", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 8, height: 1 } });
    const checkbox = (
      <Root id="root" style={{ direction: "row" }}>
        <Checkbox id="indicator" label="Disabled" />
      </Root>
    );
    const frame = runtime.render(checkbox);

    expect(frame.layout.entries.get("indicator")).toMatchObject({
      rect: { width: 5, height: 1 },
      paddingInsets: { top: 0, right: 1, bottom: 0, left: 4 },
    });
    expect(frame.buffer.toText({ trimEnd: true })).toBe(" [ ]");
    expect(frame.buffer.get(1, 0)).toMatchObject({ text: "[", ownerId: "indicator" });
    expect(frame.buffer.get(3, 0)).toMatchObject({ text: "]", ownerId: "indicator" });
    expect(frame.semantics.nodes.get("indicator")?.label).toBe("Disabled");

    const focus = new FocusManager();
    focus.sync(frame.tree, "indicator");
    for (const x of [0, 4]) {
      expect(commandForInput(
        { type: "pointer", phase: "up", point: { x, y: 0 }, button: 0 },
        frame,
        focus,
      )).toEqual({ type: "activate", targetId: "indicator" });
    }

    const hovered = runtime.render(checkbox, { hoveredId: "indicator" });
    expect([0, 1, 2, 3, 4].map((x) => hovered.buffer.get(x, 0)?.style.backgroundColor))
      .toEqual(["#25292e", "#25292e", "#25292e", "#25292e", "#25292e"]);
    expect(hovered.buffer.get(5, 0)?.style.backgroundColor).toBeUndefined();

    runtime.dispose();
  });

  it("shares focus, hover, disabled, keyboard, pointer, and semantic activation", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 4 } });
    const frame = runtime.render(checkboxes());
    const autosave = frame.layout.entries.get("autosave")!.rect;
    const disabled = frame.layout.entries.get("disabled")!.rect;
    const focus = new FocusManager();
    focus.sync(frame.tree, "autosave");

    expect(commandForInput(createKeyInput({ key: "Enter" }), frame, focus))
      .toEqual({ type: "activate", targetId: "autosave" });
    expect(commandForInput(createKeyInput({ key: " " }), frame, focus))
      .toEqual({ type: "activate", targetId: "autosave" });
    expect(commandForInput(
      { type: "semantic", targetId: "autosave", action: "activate" },
      frame,
      focus
    )).toEqual({ type: "activate", targetId: "autosave" });
    expect(commandForInput(
      { type: "pointer", phase: "down", point: { x: autosave.width - 1, y: 0 }, button: 0 },
      frame,
      focus
    )).toEqual({ type: "focus", targetId: "autosave" });
    expect(commandForInput(
      { type: "pointer", phase: "up", point: { x: autosave.width - 1, y: 0 }, button: 0 },
      frame,
      focus
    )).toEqual({ type: "activate", targetId: "autosave" });
    expect(commandForInput(
      { type: "pointer", phase: "up", point: { x: disabled.x, y: disabled.y }, button: 0 },
      frame,
      focus
    )).toBeNull();
    expect(resolvePointerAppearance(frame, { x: autosave.width - 1, y: 0 }))
      .toEqual({ hoveredId: "autosave", cursor: "pointer" });
    expect(resolvePointerAppearance(frame, { x: disabled.x, y: disabled.y }))
      .toEqual({ hoveredId: null, cursor: "default" });
    expect(focus.move(frame.tree, 1)).toBe("word-wrap");

    const hovered = runtime.render(checkboxes(), { hoveredId: "autosave" });
    expect(hovered.buffer.get(autosave.width - 1, 0)?.style.backgroundColor).toBe("#25292e");
    const focused = runtime.render(checkboxes(), { focusedId: "autosave" });
    expect(focused.buffer.get(autosave.width - 1, 0)?.style).toMatchObject({
      backgroundColor: "#1a1a1a",
      bold: true,
    });
    expect(frame.buffer.get(disabled.x + 1, disabled.y)?.style.color).toBe("#666666");
    runtime.dispose();
  });

  it("projects boolean and mixed state without treating it as selection", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 4 } });
    const frame = runtime.render(checkboxes(), { focusedId: "autosave" });

    expect(frame.semantics.nodes.get("autosave")).toMatchObject({
      role: "checkbox",
      label: "Autosave",
      checked: false,
      actions: ["focus", "activate"],
    });
    expect(frame.semantics.nodes.get("word-wrap")).toMatchObject({ checked: true });
    expect(frame.semantics.nodes.get("select-all")).toMatchObject({ checked: "mixed" });
    expect(frame.semantics.nodes.get("disabled")).toMatchObject({
      checked: false,
      disabled: true,
      actions: [],
    });
    expect(frame.semantics.nodes.get("word-wrap")?.selected).toBeUndefined();
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
    runtime.dispose();
  });

  it("normalizes user activation from mixed into the binary cycle", () => {
    expect(nextCellCheckboxState(false)).toBe(true);
    expect(nextCellCheckboxState(true)).toBe(false);
    expect(nextCellCheckboxState("indeterminate")).toBe(true);
  });
});
