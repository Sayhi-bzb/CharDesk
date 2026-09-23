import { describe, expect, it } from "vitest";
import {
  Box,
  Button,
  CellUiRuntime,
  CLASSIC_MAC_DARK_THEME,
  CLASSIC_MAC_LIGHT_THEME,
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
      style: { color: "#FFFFFF", backgroundColor: "#000000" },
    });
    expect(frame.buffer.get(save.rect.x + 1, 0)?.text).toBe("S");
    expect(frame.buffer.get(save.rect.x + save.rect.width - 1, 0)?.style.backgroundColor)
      .toBe("#000000");
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

  it("resolves variants and horizontal padding without changing the one-row contract", () => {
    const render = (
      variant: "solid" | "surface" | "outline" | "ghost",
      inset: 0 | 1 | 2,
    ) => {
      const runtime = new CellUiRuntime({ viewport: { width: 20, height: 1 } });
      const frame = runtime.render(
        <Root id="root" style={{ direction: "row" }}>
          <Button id="save" variant={variant} style={{ paddingLeft: inset, paddingRight: inset }}><Text>Save</Text></Button>
        </Root>
      );
      runtime.dispose();
      return frame;
    };

    const expectations = [
      ["solid", 0, 4, "Save"],
      ["solid", 1, 6, " Save"],
      ["solid", 2, 8, "  Save"],
      ["surface", 0, 4, "Save"],
      ["surface", 1, 6, " Save"],
      ["surface", 2, 8, "  Save"],
      ["outline", 0, 6, "[Save]"],
      ["outline", 1, 8, "[ Save ]"],
      ["outline", 2, 10, "[  Save  ]"],
      ["ghost", 0, 4, "Save"],
      ["ghost", 1, 6, " Save"],
      ["ghost", 2, 8, "  Save"],
    ] as const;

    for (const [variant, inset, width, text] of expectations) {
      const frame = render(variant, inset);
      expect(frame.layout.entries.get("save")?.rect).toMatchObject({ width, height: 1 });
      expect(frame.buffer.toText({ trimEnd: true })).toBe(text);
    }

    const filled = render("solid", 1);
    const outline = render("outline", 1);
    const ghost = render("ghost", 1);
    expect(filled.buffer.get(0, 0)?.style).toMatchObject({
      color: "#FFFFFF",
      backgroundColor: "#000000",
    });
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
    const render = (variant: "solid" | "outline", inset: 1 | 2) => runtime.render(
      <Root id="root" style={{ direction: "row" }}>
        <Button id="save" variant={variant} style={{ paddingLeft: inset, paddingRight: inset }}><Text>Save</Text></Button>
      </Root>
    );

    expect(render("solid", 1).layout.entries.get("save")?.rect.width).toBe(6);
    expect(render("outline", 1).layout.entries.get("save")?.rect.width).toBe(8);
    expect(render("outline", 2).layout.entries.get("save")?.rect.width).toBe(10);

    runtime.dispose();
  });

  it("overrides each horizontal inset without adding vertical padding", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 16, height: 1 } });
    const frame = runtime.render(
      <Root style={{ direction: "row" }}><Button id="save" variant="outline" style={{ paddingLeft: 0, paddingRight: 2 }}>
        <Text>Save</Text>
      </Button></Root>,
    );
    expect(frame.layout.entries.get("save")?.rect).toMatchObject({ width: 8, height: 1 });
    expect(frame.layout.entries.get("save")?.paddingInsets)
      .toEqual({ top: 0, right: 3, bottom: 0, left: 1 });
    expect(frame.buffer.toText({ trimEnd: true })).toBe("[Save  ]");
    runtime.dispose();
  });

  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    it(`uses the elevated surface across Button states (${theme.background})`, () => {
      const runtime = new CellUiRuntime({ viewport: { width: 16, height: 3 }, theme });
      const view = (disabled = false, textStyle?: { color?: string; backgroundColor?: string }) => (
        <Root><Box frame="bordered" style={{ width: 16, height: 3 }}>
          <Button id="save" variant="surface" disabled={disabled} textStyle={textStyle} style={{ width: 6 }}>
            <Text>Save</Text>
          </Button>
        </Box></Root>
      );
      const idle = runtime.render(view());
      const bounds = idle.layout.entries.get("save")!.rect;
      expect(bounds.width).toBe(6);
      for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
        expect(idle.buffer.get(x, bounds.y)?.style).toMatchObject({
          color: theme.foreground,
          backgroundColor: theme.elevatedSurfaceStyle.backgroundColor,
        });
      }
      const focused = runtime.render(view(), { focusedId: "save", focusVisible: true });
      expect(focused.buffer.get(bounds.x, bounds.y)?.style).toMatchObject({
        color: theme.elevatedSurfaceStyle.backgroundColor,
        backgroundColor: theme.foreground,
      });
      const pressed = runtime.render(view(), { pressActiveId: "save" });
      expect(pressed.buffer.get(bounds.x, bounds.y)?.style).toMatchObject({
        color: theme.elevatedSurfaceStyle.backgroundColor,
        backgroundColor: theme.foreground,
      });
      const disabled = runtime.render(view(true), { focusedId: "save", pressActiveId: "save" });
      expect(disabled.buffer.get(bounds.x, bounds.y)?.style).toMatchObject({
        ...theme.disabledStyle,
        backgroundColor: theme.elevatedSurfaceStyle.backgroundColor,
      });
      const custom = runtime.render(view(false, { color: "#123456", backgroundColor: "#abcdef" }));
      expect(custom.buffer.get(bounds.x, bounds.y)?.style).toMatchObject({
        color: "#123456", backgroundColor: "#abcdef",
      });
      runtime.dispose();
    });
  }

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
    expect(hovered.buffer.get(save.x, save.y)?.style).toMatchObject({
      color: "#000000",
      backgroundColor: "#FFFFFF",
    });
    const focused = runtime.render(buttons(), { focusedId: "save" });
    expect(focused.buffer.get(save.x, save.y)?.style).toMatchObject({
      color: "#000000",
      backgroundColor: "#FFFFFF",
    });
    expect(frame.buffer.get(disabled.x + 1, disabled.y)?.style).toMatchObject({
      backgroundColor: "#FFFFFF",
      color: "#777777",
    });
    runtime.dispose();
  });
});
