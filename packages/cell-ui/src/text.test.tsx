import { describe, expect, it } from "vitest";
import {
  CellTextEditor,
  CellUiRuntime,
  CLASSIC_MAC_LIGHT_THEME,
  Root,
  TextArea,
  createCellTextLayout,
  normalizeGraphemeOffset,
  offsetAtCellPoint,
} from "./index.js";
import { getGraphemeCellWidth, iterateGraphemes } from "@chardesk/protocol";
import { createVisibleCellTextLayout, measureCellText } from "./text.js";

describe("CellTextEditor", () => {
  it("keeps indexed extent correct through edits, history, and composition", () => {
    const editor = new CellTextEditor({ value: "a\t中\nwide🙂\nend", multiline: true });
    const expected = (value: string) => {
      const widths = value.split("\n").map((line) => {
        let column = 0;
        for (const { segment } of iterateGraphemes(line)) {
          column += segment === "\t" ? 4 - (column % 4) : getGraphemeCellWidth(segment);
        }
        return column;
      });
      return { width: Math.max(...widths) + 1, height: widths.length };
    };
    const check = () => {
      const snapshot = editor.snapshot();
      const { composition, value } = snapshot;
      const shown = composition
        ? value.slice(0, composition.from) + composition.text + value.slice(composition.to)
        : value;
      expect(measureCellText(snapshot)).toEqual(expected(shown));
    };
    check();
    editor.dispatch({ type: "replace-range", from: 2, to: 3, text: "\nxyz\t" }); check();
    editor.dispatch({ type: "undo" }); check();
    editor.dispatch({ type: "redo" }); check();
    editor.dispatch({ type: "composition-start" });
    editor.dispatch({ type: "composition-update", text: "中\n🙂" }); check();
    editor.dispatch({ type: "composition-cancel" }); check();
    editor.dispatch({ type: "replace-document", value: "x\ny\n" }); check();
  });

  it("keeps line widths indexed across many replacements and undos", () => {
    const editor = new CellTextEditor({ value: "first\n中\tlast\n", multiline: true });
    let seed = 17;
    const random = (limit: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % limit;
    };
    const inserts = ["x", "\n", "中", "\t", "🙂", ""];
    for (let index = 0; index < 100; index += 1) {
      const before = editor.snapshot().value;
      const from = random(before.length + 1);
      const to = Math.min(before.length, from + random(4));
      editor.dispatch({ type: "replace-range", from, to, text: inserts[random(inserts.length)]! });
      if (index % 9 === 0) editor.dispatch({ type: "undo" });
      const value = editor.snapshot().value;
      const widths = value.split("\n").map((line) => {
        let width = 0;
        for (const { segment } of iterateGraphemes(line)) {
          width += segment === "\t" ? 4 - width % 4 : getGraphemeCellWidth(segment);
        }
        return width;
      });
      expect(measureCellText(editor.snapshot())).toEqual({
        width: Math.max(...widths) + 1,
        height: widths.length,
      });
    }
  });

  it("moves and deletes across newline and emoji boundaries", () => {
    const editor = new CellTextEditor({ value: "A🙂\n中B", multiline: true });
    editor.dispatch({ type: "set-selection", anchor: 3 });
    expect(editor.dispatch({ type: "move", direction: "right" }).selection.head).toBe(4);
    expect(editor.dispatch({ type: "move", direction: "right" }).selection.head).toBe(5);
    expect(editor.dispatch({ type: "move", direction: "left" }).selection.head).toBe(4);
    expect(editor.dispatch({ type: "delete", direction: "backward" }).value).toBe("A🙂中B");
  });
  it("fills empty focused TextArea interiors without changing their borders", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 5 } });
    const editor = new CellTextEditor({ multiline: true });
    const view = (focused: boolean) => <Root>
      <TextArea id="editor" frame="bordered" focused={focused} state={editor.snapshot()} style={{ height: 5 }} />
    </Root>;
    const focused = runtime.render(view(true));
    const bounds = focused.scene.entries.get("editor")!.decorationBounds;
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 12; x++) {
        const inside = x >= bounds.x && x < bounds.x + bounds.width
          && y >= bounds.y && y < bounds.y + bounds.height;
        expect(focused.buffer.get(x, y)?.style.backgroundColor).toBe(inside
          ? CLASSIC_MAC_LIGHT_THEME.focusedSurfaceStyle.backgroundColor
          : CLASSIC_MAC_LIGHT_THEME.elevatedSurfaceStyle.backgroundColor);
        expect(focused.buffer.get(x, y)?.ownerId).toBe("editor");
      }
    }
    const blurred = runtime.render(view(false));
    expect(blurred.buffer.get(5, 2)?.style.backgroundColor)
      .toBe(CLASSIC_MAC_LIGHT_THEME.elevatedSurfaceStyle.backgroundColor);
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
  it("materializes visible Cells while preserving the complete public projection", () => {
    const editor = new CellTextEditor({
      value: Array.from({ length: 40 }, (_, index) => `${index}\t中🙂end`).join("\n"),
      multiline: true,
      viewport: { columns: 6, rows: 4 },
    });
    editor.dispatch({ type: "set-scroll", x: 3, y: 12 });
    const bounds = { x: 0, y: 0, width: 6, height: 4 };
    const full = createCellTextLayout("area", bounds, bounds, editor.snapshot());
    const visible = createVisibleCellTextLayout("area", bounds, bounds, editor.snapshot());
    expect(visible.glyphs).toEqual(full.glyphs.filter((glyph) =>
      glyph.point.y >= bounds.y && glyph.point.y < bounds.y + bounds.height
      && glyph.point.x + glyph.width > bounds.x && glyph.point.x < bounds.x + bounds.width));
    expect(visible.glyphs.length).toBeLessThan(full.glyphs.length / 4);
    expect(visible.caret).toEqual(full.caret);
    for (let y = 0; y < 4; y += 1) for (let x = 0; x < 6; x += 1) {
      expect(offsetAtCellPoint(visible, { x, y })).toBe(offsetAtCellPoint(full, { x, y }));
    }
  });
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
          frame="bordered"
          style={{ height: 4 }}
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
