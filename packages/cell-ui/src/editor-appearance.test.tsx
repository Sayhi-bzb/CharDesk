import { expect, it } from "vitest";
import {
  Box, CellTextEditor, CellUiRuntime, CLASSIC_MAC_DARK_THEME, CLASSIC_MAC_LIGHT_THEME,
  Root, TextArea, TextInput, createTestPilot,
} from "./index.js";
import type { CellSingleLineInputStyle } from "./types.js";

for (const [name, Editor] of [["TextArea", TextArea]] as const) {
  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    for (const borderShape of ["square", "rounded"] as const) {
      it(`${name} projects actual focus inside its stable border (${theme.background}, ${borderShape})`, () => {
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
        const entry = pointer.scene.entries.get("editor")!;
        const layout = entry.layoutBounds;
        const inside = entry.decorationBounds;
        for (let y = layout.y; y < layout.y + layout.height; y++) {
          for (let x = layout.x; x < layout.x + layout.width; x++) {
            const withinInner = x >= inside.x && x < inside.x + inside.width
              && y >= inside.y && y < inside.y + inside.height;
            if (withinInner) expect(pointer.buffer.get(x, y)?.style).toMatchObject(theme.focusedSurfaceStyle);
            else expect(pointer.buffer.get(x, y)).toEqual(idle.buffer.get(x, y));
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
          .toBe(theme.elevatedSurfaceStyle.backgroundColor);
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
    expect(layout.paddingInsets).toEqual({ top: 0, right: 1, bottom: 0, left: 2 });
    expect(idle.buffer.get(0, 0)?.text).toBe(">");
    expect(idle.buffer.get(1, 0)).toMatchObject({ text: " ", ownerId: "editor" });
    expect(idle.buffer.get(2, 0)?.text).toBe("H");
    for (let x = 0; x < layout.rect.width; x++) {
      expect(idle.buffer.get(x, 0)?.style).toMatchObject(theme.elevatedSurfaceStyle);
    }
    editor.dispatch({ type: "select-all" });

    const active = runtime.render(view(), {
      focusedId: "editor",
      activeFocusId: "editor",
      focusVisible: false,
    });
    expect(active.buffer.get(0, 0)?.text).toBe(">");
    for (let x = 0; x < layout.rect.width; x++) {
      expect(active.buffer.get(x, 0)?.style).toMatchObject(
        x === 2 || x === 3
          ? { color: theme.focusedSurfaceStyle.backgroundColor, backgroundColor: theme.focusedSurfaceStyle.color }
          : theme.focusedSurfaceStyle,
      );
    }
    expect(active.buffer.get(2, 0)?.style.underline).not.toBe(true);
    expect(active.buffer.get(3, 0)?.style.underline).not.toBe(true);
    const blurred = runtime.render(view(), { focusedId: "editor", activeFocusId: null });
    expect(blurred.buffer.get(2, 0)?.style).toMatchObject(theme.elevatedSurfaceStyle);
    expect(blurred.buffer.get(2, 0)?.style.backgroundColor)
      .not.toBe(active.buffer.get(2, 0)?.style.backgroundColor);
    const refocused = runtime.render(view(), { focusedId: "editor", activeFocusId: "editor" });
    expect(refocused.buffer.get(2, 0)?.style).toEqual(active.buffer.get(2, 0)?.style);
    const disabled = runtime.render(view(true), {
      focusedId: "editor",
      activeFocusId: "editor",
      focusVisible: true,
    });
    expect(disabled.buffer.get(0, 0)?.text).toBe(">");
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

  it(`TextInput ghost keeps its inherited background and highlights only an active selection (${theme.background})`, () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 }, theme });
    const editor = new CellTextEditor({ value: "Hi" });
    editor.dispatch({ type: "select-all" });
    const view = (disabled = false, readOnly = false, backgroundColor?: string) => <Root>
      <TextInput id="editor" variant="ghost" state={editor.snapshot()} disabled={disabled}
        readOnly={readOnly} textStyle={backgroundColor ? { backgroundColor } : undefined}
        style={{ width: 12 }} />
    </Root>;
    const idle = runtime.render(view());
    expect(idle.buffer.get(0, 0)?.text).toBe(">");
    expect(idle.buffer.get(1, 0)).toMatchObject({ text: " ", ownerId: "editor" });
    expect(idle.buffer.get(1, 0)?.style.backgroundColor).toBe(theme.background);
    expect(idle.buffer.get(1, 0)?.style.underline).not.toBe(true);

    const active = runtime.render(view(), { focusedId: "editor", activeFocusId: "editor" });
    expect(active.buffer.get(2, 0)?.style).toMatchObject(theme.textSelectionStyle);
    expect(active.buffer.get(2, 0)?.style.underline).not.toBe(true);
    expect(active.buffer.get(1, 0)?.style.underline).not.toBe(true);
    expect(active.buffer.get(5, 0)?.style.backgroundColor).toBe(theme.background);
    expect(active.buffer.get(5, 0)?.style.underline).not.toBe(true);

    const blurred = runtime.render(view(), { focusedId: "editor", activeFocusId: null });
    expect(blurred.buffer.get(2, 0)?.style.backgroundColor).toBe(theme.background);
    const readonly = runtime.render(view(false, true), { focusedId: "editor", activeFocusId: "editor" });
    expect(readonly.buffer.get(2, 0)?.style).toMatchObject(theme.textSelectionStyle);
    const disabled = runtime.render(view(true), { focusedId: "editor", activeFocusId: "editor" });
    expect(disabled.buffer.get(2, 0)?.style).toMatchObject(theme.disabledStyle);
    expect(disabled.buffer.get(2, 0)?.style.underline).not.toBe(true);
    const custom = runtime.render(view(false, false, "#abcdef"), {
      focusedId: "editor", activeFocusId: "editor",
    });
    expect(custom.buffer.get(1, 0)?.style.backgroundColor).toBe("#abcdef");
    expect(custom.buffer.get(5, 0)?.style.backgroundColor).toBe("#abcdef");
    editor.dispatch({ type: "composition-start" });
    editor.dispatch({ type: "composition-update", text: "中" });
    const composing = runtime.render(view(), { focusedId: "editor", activeFocusId: "editor" });
    expect(composing.buffer.get(2, 0)?.style.underline).toBe(true);
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

it("TextArea focus includes padding but not border Cells", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 5 } });
  const editor = new CellTextEditor({ value: "Hi", multiline: true });
  const view = () => <Root><TextArea id="editor" frame="bordered" state={editor.snapshot()}
    style={{ width: 12, height: 5, padding: 1 }} /></Root>;
  const idle = runtime.render(view());
  const active = runtime.render(view(), { focusedId: "editor", activeFocusId: "editor" });
  const entry = active.scene.entries.get("editor")!;
  expect(entry.decorationBounds).toEqual({ x: 1, y: 1, width: 10, height: 3 });
  expect(entry.contentBounds).toEqual({ x: 2, y: 2, width: 8, height: 1 });
  expect(active.buffer.get(1, 1)?.style).toMatchObject(CLASSIC_MAC_LIGHT_THEME.focusedSurfaceStyle);
  expect(active.buffer.get(2, 2)?.text).toBe("H");
  expect(active.buffer.get(9, 3)?.style).toMatchObject(CLASSIC_MAC_LIGHT_THEME.focusedSurfaceStyle);
  expect(active.buffer.get(0, 0)).toEqual(idle.buffer.get(0, 0));
  expect(active.buffer.get(11, 4)).toEqual(idle.buffer.get(11, 4));
  runtime.dispose();
});

it("gives TextInput a stable one-row content viewport", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 } });
  const editor = new CellTextEditor({ value: "Hi" });
  const view = () => <Root><TextInput id="editor" state={editor.snapshot()} style={{ width: 12 }} /></Root>;
  const idle = runtime.render(view());
  expect(idle.textLayouts.get("editor")!.contentBounds)
    .toEqual({ x: 2, y: 0, width: 9, height: 1 });
  expect(idle.semantics.nodes.get("editor")?.value).toBe("Hi");
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

it("keeps the prompt visible for an empty narrow input without adding it to TextArea or value", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 4 } });
  const input = new CellTextEditor();
  const area = new CellTextEditor({ multiline: true });
  const frame = runtime.render(<Root>
    <TextInput id="input" state={input.snapshot()} style={{ width: 1 }} />
    <TextArea id="area" state={area.snapshot()} style={{ width: 12, height: 3 }} />
  </Root>);
  expect(frame.buffer.get(0, 0)?.text).toBe(">");
  expect(frame.textLayouts.get("input")?.contentBounds.width).toBe(0);
  expect(frame.semantics.nodes.get("input")?.value).toBe("");
  expect(frame.buffer.get(0, 1)?.text).not.toBe(">");
  expect(frame.semantics.nodes.get("area")?.value).toBe("");
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
  expect(selected.buffer.get(0, 0)?.style).toMatchObject(theme.borderStyle);
  expect(selected.buffer.get(1, 1)?.style).toMatchObject(theme.textSelectionStyle);
  expect(selected.buffer.get(1, 1)?.style.underline).not.toBe(true);
  const blurred = runtime.render(view(), { focusedId: "editor", activeFocusId: null });
  expect(blurred.buffer.get(1, 1)?.style.backgroundColor)
    .not.toBe(theme.textSelectionStyle.backgroundColor);
  expect(blurred.textLayouts.get("editor")?.selection).toEqual({ anchor: 0, head: 1 });
  editor.dispatch({ type: "composition-start" });
  editor.dispatch({ type: "composition-update", text: "中" });
  const composing = runtime.render(view(), { focusedId: "editor", activeFocusId: "editor", focusVisible: false });
  expect(composing.buffer.get(1, 1)?.style.underline).toBe(true);
  expect(composing.buffer.get(0, 0)?.style).toMatchObject(theme.borderStyle);
  runtime.dispose();
});

it.each([CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME])(
  "TextArea selection stays visible when its theme token matches the focused surface (%s)", (theme) => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 4 }, theme });
    const editor = new CellTextEditor({ value: "Hi", multiline: true });
    editor.dispatch({ type: "set-selection", anchor: 0, head: 1 });
    const frame = runtime.render(<Root><TextArea id="editor" state={editor.snapshot()}
      frame="bordered" style={{ width: 12, height: 4 }} /></Root>, {
      focusedId: "editor", activeFocusId: "editor",
    });
    const selected = frame.buffer.get(1, 1)!.style;
    const plain = frame.buffer.get(2, 1)!.style;
    expect(selected).toMatchObject({
      color: theme.focusedSurfaceStyle.backgroundColor,
      backgroundColor: theme.focusedSurfaceStyle.color,
    });
    expect(selected.backgroundColor).not.toBe(plain.backgroundColor);
    expect(selected.underline).not.toBe(true);
    runtime.dispose();
  },
);
