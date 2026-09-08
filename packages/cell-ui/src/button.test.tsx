import { describe, expect, it } from "vitest";
import {
  Button,
  CellUiRuntime,
  FocusManager,
  Root,
  Text,
  auditSemanticSnapshot,
  commandForInput,
  createKeyInput,
} from "./index.js";
import { resolvePointerAppearance } from "./pointer.js";

const buttons = () => (
  <Root id="root" style={{ direction: "row", gap: 1 }}>
    <Button id="save" label="Save document"><Text>Save</Text></Button>
    <Button id="disabled" disabled><Text>Disabled</Text></Button>
    <Button id="next"><Text>Next</Text></Button>
  </Root>
);

describe("Button", () => {
  it("uses intrinsic one-row layout, complete Insets, and a filled Cell surface", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 30, height: 1 } });
    const frame = runtime.render(buttons());
    const save = frame.layout.entries.get("save")!;

    expect(save.rect).toMatchObject({ width: 6, height: 1 });
    expect(save.paddingInsets).toEqual({ top: 0, right: 1, bottom: 0, left: 1 });
    expect(frame.buffer.get(save.rect.x, 0)).toMatchObject({
      ownerId: "save",
      style: { backgroundColor: "#191d22" },
    });
    expect(frame.buffer.get(save.rect.x + 1, 0)?.text).toBe("S");
    expect(frame.buffer.get(save.rect.x + save.rect.width - 1, 0)?.style.backgroundColor)
      .toBe("#191d22");
    expect(frame.buffer.toText({ trimEnd: true })).toBe(" Save   Disabled   Next");

    const insetRuntime = new CellUiRuntime({ viewport: { width: 30, height: 6 } });
    const insetFrame = insetRuntime.render(
      <Root id="root">
        <Button
          id="insets"
          style={{ width: 12, height: 6, paddingTop: 1, paddingRight: 2, paddingBottom: 3, paddingLeft: 4 }}
        ><Text>Ok</Text></Button>
      </Root>
    );
    expect(insetFrame.layout.entries.get("insets")?.paddingInsets)
      .toEqual({ top: 1, right: 2, bottom: 3, left: 4 });
    insetRuntime.dispose();
    runtime.dispose();
  });

  it("resolves semantic variants and sizes without changing the one-row contract", () => {
    const render = (
      variant: "default" | "outline" | "ghost",
      size: "sm" | "default" | "lg",
    ) => {
      const runtime = new CellUiRuntime({ viewport: { width: 20, height: 1 } });
      const frame = runtime.render(
        <Root id="root" style={{ direction: "row" }}>
          <Button id="save" variant={variant} size={size}><Text>Save</Text></Button>
        </Root>
      );
      runtime.dispose();
      return frame;
    };

    const expectations = [
      ["default", "sm", 4, "Save"],
      ["default", "default", 6, " Save"],
      ["default", "lg", 8, "  Save"],
      ["outline", "sm", 6, "[Save]"],
      ["outline", "default", 8, "[ Save ]"],
      ["outline", "lg", 10, "[  Save  ]"],
      ["ghost", "sm", 4, "Save"],
      ["ghost", "default", 6, " Save"],
      ["ghost", "lg", 8, "  Save"],
    ] as const;

    for (const [variant, size, width, text] of expectations) {
      const frame = render(variant, size);
      expect(frame.layout.entries.get("save")?.rect).toMatchObject({ width, height: 1 });
      expect(frame.buffer.toText({ trimEnd: true })).toBe(text);
    }

    const filled = render("default", "default");
    const outline = render("outline", "default");
    const ghost = render("ghost", "default");
    expect(filled.buffer.get(0, 0)?.style.backgroundColor).toBe("#191d22");
    expect(outline.buffer.get(0, 0)).toMatchObject({ text: "[", ownerId: "save" });
    expect(outline.buffer.get(0, 0)?.style.backgroundColor).toBeUndefined();
    expect(ghost.buffer.get(0, 0)?.style.backgroundColor).toBeUndefined();

    const focus = new FocusManager();
    focus.sync(outline.tree, "save");
    expect(commandForInput(
      { type: "pointer", phase: "up", point: { x: 0, y: 0 }, button: 0 },
      outline,
      focus,
    )).toEqual({ type: "activate", targetId: "save" });
  });

  it("invalidates layout when semantic appearance changes geometry", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 1 } });
    const render = (variant: "default" | "outline", size: "default" | "lg") => runtime.render(
      <Root id="root" style={{ direction: "row" }}>
        <Button id="save" variant={variant} size={size}><Text>Save</Text></Button>
      </Root>
    );

    expect(render("default", "default").layout.entries.get("save")?.rect.width).toBe(6);
    expect(render("outline", "default").layout.entries.get("save")?.rect.width).toBe(8);
    expect(render("outline", "lg").layout.entries.get("save")?.rect.width).toBe(10);

    runtime.dispose();
  });

  it("shares hover, focus, disabled, keyboard, pointer, and semantic behavior", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 30, height: 1 } });
    const frame = runtime.render(buttons());
    const save = frame.layout.entries.get("save")!.rect;
    const disabled = frame.layout.entries.get("disabled")!.rect;
    const focus = new FocusManager();
    focus.sync(frame.tree, "save");

    expect(frame.semantics.nodes.get("save")).toMatchObject({
      role: "button",
      label: "Save document",
      actions: ["focus", "activate"],
    });
    expect(frame.semantics.nodes.get("disabled")).toMatchObject({
      role: "button",
      label: "Disabled",
      disabled: true,
      actions: [],
    });
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
    expect(commandForInput(createKeyInput({ key: "Enter" }), frame, focus))
      .toEqual({ type: "activate", targetId: "save" });
    expect(commandForInput(createKeyInput({ key: " " }), frame, focus))
      .toEqual({ type: "activate", targetId: "save" });
    expect(commandForInput(
      { type: "semantic", targetId: "save", action: "activate" },
      frame,
      focus
    )).toEqual({ type: "activate", targetId: "save" });
    expect(commandForInput(
      { type: "pointer", phase: "down", point: { x: save.x, y: save.y }, button: 0 },
      frame,
      focus
    )).toEqual({ type: "focus", targetId: "save" });
    expect(commandForInput(
      { type: "pointer", phase: "up", point: { x: save.x, y: save.y }, button: 0 },
      frame,
      focus
    )).toEqual({ type: "activate", targetId: "save" });
    expect(commandForInput(
      { type: "pointer", phase: "up", point: { x: disabled.x, y: disabled.y }, button: 0 },
      frame,
      focus
    )).toBeNull();
    expect(resolvePointerAppearance(frame, { x: save.x, y: save.y }))
      .toEqual({ hoveredId: "save", cursor: "pointer" });
    expect(resolvePointerAppearance(frame, { x: disabled.x, y: disabled.y }))
      .toEqual({ hoveredId: null, cursor: "default" });
    expect(focus.move(frame.tree, 1)).toBe("next");

    const hovered = runtime.render(buttons(), { hoveredId: "save" });
    expect(hovered.buffer.get(save.x, save.y)?.style.backgroundColor).toBe("#25292e");
    const focused = runtime.render(buttons(), { focusedId: "save" });
    expect(focused.buffer.get(save.x, save.y)?.style).toMatchObject({
      backgroundColor: "#1a1a1a",
      bold: true,
    });
    expect(frame.buffer.get(disabled.x + 1, disabled.y)?.style).toMatchObject({
      backgroundColor: "#191d22",
      color: "#666666",
    });
    runtime.dispose();
  });
});
