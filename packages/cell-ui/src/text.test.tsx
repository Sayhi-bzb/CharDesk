import { describe, expect, it } from "vitest";
import {
  CellTextEditor,
  CellUiRuntime,
  Root,
  TextArea,
  createCellTextLayout,
  normalizeGraphemeOffset,
  offsetAtCellPoint,
} from "./index.js";

describe("CellTextEditor", () => {
  it("fills empty focused editor rectangles and clears them on blur", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 5 } });
    const editor = new CellTextEditor({ multiline: true });
    const view = (focused: boolean) => <Root>
      <TextArea id="editor" focused={focused} state={editor.snapshot()} style={{ border: true, height: 5 }} />
    </Root>;
    const focused = runtime.render(view(true));
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 12; x++) {
        expect(focused.buffer.get(x, y)?.style.backgroundColor).toBe("#000000");
        expect(focused.buffer.get(x, y)?.ownerId).toBe("editor");
      }
    }
    const blurred = runtime.render(view(false));
    expect(blurred.buffer.get(5, 2)?.style.backgroundColor).toBeUndefined();
    const fresh = new CellUiRuntime({ viewport: { width: 12, height: 5 } });
    const oracle = fresh.render(view(false));
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 12; x++) expect(blurred.buffer.get(x, y)).toEqual(oracle.buffer.get(x, y));
    }
    runtime.dispose();
    fresh.dispose();
  });
  it("resizes its viewport without changing composition, selection, or history", () => {
    const editor = new CellTextEditor();
    editor.dispatch({ type: "insert", text: "a".repeat(37) });
    const wide = editor.dispatch({ type: "set-viewport", columns: 38, rows: 1 });
    expect(wide.scrollX).toBe(0);
    expect(editor.dispatch({ type: "set-viewport", columns: 38, rows: 1 })).toEqual(wide);
    editor.dispatch({ type: "composition-start" });
    const composing = editor.dispatch({ type: "composition-update", text: "世界👋" });
    const narrow = editor.dispatch({ type: "set-viewport", columns: 10, rows: 2 });
    expect(narrow.composition).toEqual(composing.composition);
    expect(narrow.selection).toEqual(composing.selection);
    expect(narrow.scrollX).toBeGreaterThan(0);
    editor.dispatch({ type: "composition-cancel" });
    expect(editor.dispatch({ type: "undo" }).value).toBe("");
    expect(editor.dispatch({ type: "redo" }).value).toBe("a".repeat(37));
    expect(() => editor.dispatch({ type: "set-viewport", columns: 0, rows: 1 })).toThrow(RangeError);
  });
  it("keeps caret and deletion on CJK, combining, and ZWJ grapheme boundaries", () => {
    const family = "👨‍👩‍👧‍👦";
    const value = `A中${family}e\u0301`;
    const editor = new CellTextEditor({ value, multiline: true });
    editor.dispatch({ type: "set-selection", anchor: value.length });
    expect(editor.dispatch({ type: "delete", direction: "backward" }).value)
      .toBe(`A中${family}`);
    const insideFamily = 3;
    expect(normalizeGraphemeOffset(value, insideFamily, "backward")).toBe(2);
    expect(normalizeGraphemeOffset(value, insideFamily, "forward"))
      .toBe(2 + family.length);
  });

  it("commits a composition as one undoable transaction", () => {
    const editor = new CellTextEditor({ value: "hi", multiline: true });
    editor.dispatch({ type: "set-selection", anchor: 2 });
    editor.dispatch({ type: "composition-start" });
    const preview = editor.dispatch({ type: "composition-update", text: "你" });
    expect(preview.value).toBe("hi");
    expect(preview.composition?.text).toBe("你");
    expect(editor.dispatch({ type: "composition-commit", text: "你" }).value)
      .toBe("hi你");
    expect(editor.dispatch({ type: "undo" }).value).toBe("hi");
    expect(editor.dispatch({ type: "redo" }).value).toBe("hi你");
  });

  it("applies single-line paste policy and reveals a wide caret horizontally", () => {
    const editor = new CellTextEditor({
      value: "ab中cd",
      viewport: { columns: 4, rows: 1 },
    });
    editor.dispatch({ type: "set-selection", anchor: 5 });
    expect(editor.snapshot().scrollX).toBe(3);
    expect(editor.dispatch({ type: "insert", text: "\r\nnext", source: "paste" }).value)
      .toBe("ab中cd next");
  });

  it("moves by logical line and preserves the desired Cell column", () => {
    const editor = new CellTextEditor({ value: "A中B\nxy\n12345", multiline: true });
    editor.dispatch({ type: "set-selection", anchor: 3 });
    expect(editor.dispatch({ type: "move", direction: "down" }).selection.head).toBe(6);
    expect(editor.dispatch({ type: "move", direction: "down" }).selection.head).toBe(11);
  });
});

describe("Cell text projection", () => {
  it("maps wide grapheme lead and continuation Cells to opposite boundaries", () => {
    const editor = new CellTextEditor({ value: "A中B" });
    const layout = createCellTextLayout(
      "input",
      { x: 0, y: 0, width: 8, height: 1 },
      { x: 0, y: 0, width: 8, height: 1 },
      editor.snapshot()
    );
    expect(offsetAtCellPoint(layout, { x: 1, y: 0 })).toBe(1);
    expect(offsetAtCellPoint(layout, { x: 2, y: 0 })).toBe(2);
  });

  it("renders TextArea, caret geometry, and textbox semantics in one frame", () => {
    const editor = new CellTextEditor({ value: "中🙂\ntext", multiline: true });
    editor.dispatch({ type: "set-selection", anchor: 0, head: 3 });
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 4 } });
    const frame = runtime.render(
      <Root id="root">
        <TextArea
          id="editor"
          label="Document"
          state={editor.snapshot()}
          style={{ border: true, height: 4 }}
        />
      </Root>,
      { focusedId: "editor" }
    );
    expect(frame.buffer.toText({ trimEnd: true })).toContain("中🙂");
    expect(frame.textLayouts.get("editor")?.caret).toEqual({ x: 5, y: 1 });
    expect(frame.semantics.nodes.get("editor")).toMatchObject({
      role: "textbox",
      label: "Document",
      value: "中🙂\ntext",
      multiline: true,
    });
    runtime.dispose();
  });
});
