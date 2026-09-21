import { expect, it } from "vitest";
import {
  Box, CellTextEditor, CellUiRuntime, CLASSIC_MAC_DARK_THEME, CLASSIC_MAC_LIGHT_THEME,
  Root, TextArea, TextInput, createTestPilot,
} from "./index.js";
import type { CellSingleLineInputStyle } from "./types.js";

for (const [name, Editor] of [["TextArea", TextArea]] as const) {
  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    for (const borderShape of ["square", "rounded"] as const) {
      it(`${name} projects actual focus across its rectangle (${theme.background}, ${borderShape})`, () => {
        const runtime = new CellUiRuntime({ viewport: { width: 16, height: 7 }, theme });
        const editor = new CellTextEditor({ value: "Hi", multiline: Editor === TextArea });
        const view = (disabled = false, readOnly = false) => <Root>
          <Box id="outer" frame="bordered" style={{ width: 16, height: 7 }}>
            <Editor id="editor" state={editor.snapshot()} disabled={disabled} readOnly={readOnly}
              frame="bordered" borderShape={borderShape} style={{ width: 12, height: 3 }} />
          </Box>
        </Root>;
        const idle = runtime.render(view());
        const pointer = runtime.render(view(), { focusedId: "editor", activeFocusId: "editor", focusVisible: false });
        const layout = pointer.scene.entries.get("editor")!.layoutBounds;
        for (let y = layout.y; y < layout.y + layout.height; y++) {
          for (let x = layout.x; x < layout.x + layout.width; x++) {
            expect(pointer.buffer.get(x, y)?.style).toMatchObject(theme.focusedSurfaceStyle);
          }
        }
        expect(pointer.buffer.get(0, 0)).toEqual(idle.buffer.get(0, 0));
        const keyboard = runtime.render(view(), { focusedId: "editor", activeFocusId: "editor", focusVisible: true });
        expect(keyboard.buffer).toEqual(pointer.buffer);
        const readonly = runtime.render(view(false, true), { focusedId: "editor", activeFocusId: "editor", focusVisible: false });
        expect(readonly.buffer).toEqual(pointer.buffer);
        const blurred = runtime.render(view(), { focusedId: "editor", activeFocusId: null, focusVisible: false });
        expect(blurred.buffer).toEqual(idle.buffer);
        expect(blurred.semantics.focusedId).toBe("editor");
        expect(blurred.buffer.toText()).toBe(pointer.buffer.toText());
        const disabled = runtime.render(view(true), { focusedId: "editor", activeFocusId: "editor", focusVisible: true });
        expect(disabled.buffer.get(layout.x + 1, layout.y + 1)?.style).toMatchObject(theme.disabledStyle);
        expect(disabled.buffer.get(layout.x + 1, layout.y + 1)?.style.backgroundColor)
          .toBeUndefined();
        runtime.dispose();
      });
    }
  }
}

for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
  it(`TextInput owns one elevated Cell row (${theme.background})`, () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 3 }, theme });
    const editor = new CellTextEditor({ value: "Hi" });
    const unsupportedMultilineStyle = {
      width: 12,
      height: 3,
      minHeight: 3,
      maxHeight: 3,
      padding: 2,
    } as unknown as CellSingleLineInputStyle;
    const view = (disabled = false) => <Root><TextInput
      id="editor"
      state={editor.snapshot()}
      disabled={disabled}
      style={unsupportedMultilineStyle}
    /></Root>;
    const idle = runtime.render(view());
    const layout = idle.layout.entries.get("editor")!;
    expect(layout.rect).toEqual({ x: 0, y: 0, width: 12, height: 1 });
    expect(layout.borderInsets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(layout.paddingInsets).toEqual({ top: 0, right: 1, bottom: 0, left: 1 });
    for (let x = 0; x < layout.rect.width; x++) {
      expect(idle.buffer.get(x, 0)?.style).toMatchObject(theme.elevatedSurfaceStyle);
    }
    editor.dispatch({ type: "select-all" });

    const active = runtime.render(view(), {
      focusedId: "editor",
      activeFocusId: "editor",
      focusVisible: false,
    });
    for (let x = 0; x < layout.rect.width; x++) {
      expect(active.buffer.get(x, 0)?.style).toMatchObject(theme.focusedSurfaceStyle);
    }
    expect(active.buffer.get(1, 0)?.style.underline).toBe(true);
    expect(active.buffer.get(2, 0)?.style.underline).toBe(true);
    expect(active.buffer.get(5, 0)?.style.underline).not.toBe(true);
    const blurred = runtime.render(view(), { focusedId: "editor", activeFocusId: null });
    expect(blurred.buffer.get(1, 0)?.style.underline).not.toBe(true);
    const disabled = runtime.render(view(true), {
      focusedId: "editor",
      activeFocusId: "editor",
      focusVisible: true,
    });
    expect(disabled.buffer.get(1, 0)?.style).toMatchObject({
      ...theme.elevatedSurfaceStyle,
      ...theme.disabledStyle,
    });
    const custom = runtime.render(<Root><TextInput id="editor" state={editor.snapshot()}
      textStyle={{ backgroundColor: "#abcdef" }} style={{ width: 12 }} /></Root>);
    expect(custom.buffer.get(1, 0)?.style.backgroundColor).toBe("#abcdef");
    const parent = runtime.render(<Root><Box textStyle={{ backgroundColor: "#abcdef" }}>
      <TextInput id="editor" state={editor.snapshot()} style={{ width: 12 }} />
    </Box></Root>);
    expect(parent.buffer.get(1, 0)?.style.backgroundColor)
      .toBe(theme.elevatedSurfaceStyle.backgroundColor);
    runtime.dispose();
  });

  it(`TextInput plain keeps its row background and underlines only an active selection (${theme.background})`, () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 }, theme });
    const editor = new CellTextEditor({ value: "Hi" });
    editor.dispatch({ type: "select-all" });
    const view = (disabled = false, readOnly = false, backgroundColor?: string) => <Root>
      <TextInput id="editor" variant="plain" state={editor.snapshot()} disabled={disabled}
        readOnly={readOnly} textStyle={backgroundColor ? { backgroundColor } : undefined}
        style={{ width: 12 }} />
    </Root>;
    const idle = runtime.render(view());
    expect(idle.buffer.get(1, 0)?.style.backgroundColor).toBeUndefined();
    expect(idle.buffer.get(1, 0)?.style.underline).not.toBe(true);

    const active = runtime.render(view(), { focusedId: "editor", activeFocusId: "editor" });
    expect(active.buffer.get(1, 0)?.style).toMatchObject({ underline: true });
    expect(active.buffer.get(1, 0)?.style.backgroundColor).toBeUndefined();
    expect(active.buffer.get(5, 0)?.style.backgroundColor).toBeUndefined();
    expect(active.buffer.get(5, 0)?.style.underline).not.toBe(true);

    const blurred = runtime.render(view(), { focusedId: "editor", activeFocusId: null });
    expect(blurred.buffer.get(1, 0)?.style.underline).not.toBe(true);
    const readonly = runtime.render(view(false, true), { focusedId: "editor", activeFocusId: "editor" });
    expect(readonly.buffer.get(1, 0)?.style.underline).toBe(true);
    const disabled = runtime.render(view(true), { focusedId: "editor", activeFocusId: "editor" });
    expect(disabled.buffer.get(1, 0)?.style).toMatchObject(theme.disabledStyle);
    expect(disabled.buffer.get(1, 0)?.style.underline).not.toBe(true);
    const custom = runtime.render(view(false, false, "#abcdef"), {
      focusedId: "editor", activeFocusId: "editor",
    });
    expect(custom.buffer.get(1, 0)?.style.backgroundColor).toBe("#abcdef");
    expect(custom.buffer.get(5, 0)?.style.backgroundColor).toBe("#abcdef");
    editor.dispatch({ type: "composition-start" });
    editor.dispatch({ type: "composition-update", text: "中" });
    const composing = runtime.render(view(), { focusedId: "editor", activeFocusId: "editor" });
    expect(composing.buffer.get(1, 0)?.style.underline).toBe(true);
    const disabledComposing = runtime.render(view(true), {
      focusedId: "editor", activeFocusId: "editor",
    });
    expect(disabledComposing.buffer.get(1, 0)?.style.underline).not.toBe(true);
    runtime.dispose();
  });
}

it("TestPilot keeps editing active across pointer, keyboard and viewport commits", async () => {
  const editor = new CellTextEditor();
  const pilot = createTestPilot({
    viewport: { width: 12, height: 1 },
    render: () => <Root><TextInput id="editor" state={editor.snapshot()} /></Root>,
    onCommand: (command) => {
      if (command.type === "text") editor.dispatch(command.command);
    },
  });
  await pilot.pressKey("Tab");
  await pilot.click({ x: 1, y: 0 });
  expect(pilot.focus()).toBe("editor");
  expect(pilot.frame.tree.nodes.get("editor")).toMatchObject({ focusActive: true, focusVisible: false });
  const assertActive = () => expect(pilot.frame.buffer.get(0, 0)?.style)
    .toMatchObject(CLASSIC_MAC_LIGHT_THEME.focusedSurfaceStyle);
  assertActive();
  await pilot.pressKey("ArrowRight");
  assertActive();
  await pilot.pointerMove({ x: 10, y: 0 });
  assertActive();
  await pilot.resize({ width: 14, height: 1 });
  assertActive();
  pilot.dispose();
});

it("gives TextInput a stable one-row content viewport", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 } });
  const editor = new CellTextEditor({ value: "Hi" });
  const view = () => <Root><TextInput id="editor" state={editor.snapshot()} style={{ width: 12 }} /></Root>;
  const idle = runtime.render(view());
  expect(idle.textLayouts.get("editor")!.contentBounds)
    .toEqual({ x: 1, y: 0, width: 10, height: 1 });
  const active = runtime.render(view(), {
    focusedId: "editor",
    activeFocusId: "editor",
    focusVisible: false,
  });
  for (let x = 0; x < 12; x++) {
    expect(active.buffer.get(x, 0)?.style).toMatchObject(CLASSIC_MAC_LIGHT_THEME.focusedSurfaceStyle);
  }
  runtime.dispose();
});

it("resolves editor border tokens before activity and retains selection/composition styles", () => {
  const theme = {
    ...CLASSIC_MAC_LIGHT_THEME,
    borderStyle: { color: "#123456", backgroundColor: "#abcdef" },
    focusedSurfaceStyle: { color: "#fedcba", backgroundColor: "#654321" },
    textSelectionStyle: { color: "#ffffff", backgroundColor: "#445566" },
  };
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 3 }, theme });
  const editor = new CellTextEditor({ value: "Hi", multiline: true });
  const view = () => <Root><TextArea id="editor" frame="bordered" state={editor.snapshot()} style={{ height: 3 }} /></Root>;
  expect(runtime.render(view()).buffer.get(0, 0)?.style).toMatchObject(theme.borderStyle);
  editor.dispatch({ type: "set-selection", anchor: 0, head: 1 });
  const selected = runtime.render(view(), { focusedId: "editor", activeFocusId: "editor", focusVisible: false });
  expect(selected.buffer.get(0, 0)?.style).toMatchObject(theme.focusedSurfaceStyle);
  expect(selected.buffer.get(1, 1)?.style).toMatchObject(theme.textSelectionStyle);
  editor.dispatch({ type: "composition-start" });
  editor.dispatch({ type: "composition-update", text: "中" });
  const composing = runtime.render(view(), { focusedId: "editor", activeFocusId: "editor", focusVisible: false });
  expect(composing.buffer.get(1, 1)?.style.underline).toBe(true);
  expect(composing.buffer.get(0, 0)?.style).toMatchObject(theme.focusedSurfaceStyle);
  runtime.dispose();
});
