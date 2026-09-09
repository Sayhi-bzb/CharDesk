import { afterEach, describe, expect, it } from "vitest";
import { TestCanvasContentSurface } from "@/domains/canvas/testing";
import {
  applyFreeformSnapshotToYMaps,
  canvasCommands,
  defaultCanvasDocuments,
  setCanvasTestState,
  useEditorStore,
} from "@/domains/canvas/testing";
import type { EditorState } from "@/domains/canvas/state/interfaces";
import type { CanvasInteractionSnapshot } from "@/domains/canvas/public";
import { decodeCellPlaneOperationRows } from "@/domains/canvas/cell-plane/model";

const initialState = useEditorStore.getState();

const resetStore = () => {
  useEditorStore.setState(initialState, true);
  applyFreeformSnapshotToYMaps([]);
};

const setTextState = (
  state: Partial<
    Pick<EditorState, "contentSurface" | "canvasMode"> &
      Pick<CanvasInteractionSnapshot, "textCursor">
  >
) => {
  setCanvasTestState({
    canvasMode: "freeform",
    contentSurface: new TestCanvasContentSurface(),
    ...state,
  });
};

describe("textSlice newlineText", () => {
  afterEach(() => {
    resetStore();
  });

  it("keeps the current column when the current row is empty", () => {
    setTextState({
      textCursor: { x: 20, y: 3 },
    });

    useEditorStore.getState().newlineText();

    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 20, y: 4 });
  });

  it("inherits real leading indentation when the cursor is after text", () => {
    setTextState({
      textCursor: { x: 8, y: 0 },
      contentSurface: new TestCanvasContentSurface([
        ["4,0", { char: "f", color: "#ffffff" }],
        ["5,0", { char: "o", color: "#ffffff" }],
        ["6,0", { char: "o", color: "#ffffff" }],
      ]),
    });

    useEditorStore.getState().newlineText();

    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 4, y: 1 });
  });

  it("finds the start of a contiguous row containing wide characters", () => {
    setTextState({
      textCursor: { x: 8, y: 0 },
      contentSurface: new TestCanvasContentSurface([
        ["4,0", { char: "你", color: "#ffffff" }],
        ["6,0", { char: "好", color: "#ffffff" }],
      ]),
    });

    useEditorStore.getState().newlineText();

    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 4, y: 1 });
  });

  it("keeps the current column when the cursor is inside indentation", () => {
    setTextState({
      textCursor: { x: 2, y: 0 },
      contentSurface: new TestCanvasContentSurface([
        ["4,0", { char: "f", color: "#ffffff" }],
        ["5,0", { char: "o", color: "#ffffff" }],
        ["6,0", { char: "o", color: "#ffffff" }],
      ]),
    });

    useEditorStore.getState().newlineText();

    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 2, y: 1 });
  });

  it("keeps the current column when text starts to the right of the cursor", () => {
    setTextState({
      textCursor: { x: 3, y: 0 },
      contentSurface: new TestCanvasContentSurface([
        ["10,0", { char: "x", color: "#ffffff" }],
      ]),
    });

    useEditorStore.getState().newlineText();

    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 3, y: 1 });
  });

  it("returns to the nearest text run instead of unrelated content on the left", () => {
    setTextState({
      textCursor: { x: 15, y: 0 },
      contentSurface: new TestCanvasContentSurface([
        ["0,0", { char: "x", color: "#ffffff" }],
        ["10,0", { char: "h", color: "#ffffff" }],
        ["11,0", { char: " ", color: "#ffffff" }],
        ["12,0", { char: "好", color: "#ffffff" }],
      ]),
    });

    useEditorStore.getState().newlineText();

    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 10, y: 1 });
  });

  it("supports text runs at negative columns", () => {
    setTextState({
      textCursor: { x: -1, y: 2 },
      contentSurface: new TestCanvasContentSurface([
        ["-4,2", { char: "a", color: "#ffffff" }],
        ["-3,2", { char: "b", color: "#ffffff" }],
      ]),
    });

    useEditorStore.getState().newlineText();

    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: -4, y: 3 });
  });

});

describe("textSlice writeTextString", () => {
  afterEach(() => {
    resetStore();
  });

  it("preserves CRLF new lines when writing pasted text", () => {
    setTextState({
      textCursor: { x: 3, y: 4 },
    });

    useEditorStore.getState().writeTextString("a\r\nb");

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(
      new Map([
        ["3,4", { char: "a", color: "#000000" }],
        ["3,5", { char: "b", color: "#000000" }],
      ])
    );
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 4, y: 5 });
  });

  it("fills the formal 1x1 selection at the static active cell", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      contentSurface: new TestCanvasContentSurface(),
      textCursor: null,
      staticGridSelection: {
        mode: "range",
        activeCell: { x: 6, y: 7 },
        anchorCell: { x: 6, y: 7 },
        primaryRange: { start: { x: 6, y: 7 }, end: { x: 6, y: 7 } },
        additionalRanges: [],
      },
      staticGridEditMode: "navigate",
    });

    useEditorStore.getState().writeTextString("A");

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(
      new Map([["6,7", { char: "A", color: "#000000" }]])
    );
    expect(useEditorStore.getState().interaction.textCursor).toBeNull();
  });

  it("keeps ordinary text input on the existing full-cell replacement policy", () => {
    setTextState({ textCursor: { x: 0, y: 0 } });
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "A", color: "#ffffff", bgColor: "#000000" }],
    ]);

    useEditorStore.getState().writeTextString("X");

    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")).toEqual({
      char: "X",
      color: "#000000",
    });
  });

  it("advances the active cell by each grapheme's display width", () => {
    setTextState({ textCursor: { x: 2, y: 1 } });

    useEditorStore.getState().writeTextString("A你 ");

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(
      new Map([
        ["2,1", { char: "A", color: "#000000" }],
        ["3,1", { char: "你", color: "#000000" }],
        ["5,1", { char: " ", color: "#000000" }],
      ])
    );
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 6, y: 1 });
    expect(useEditorStore.getState().interaction.staticGridSelection.activeCell).toEqual({ x: 6, y: 1 });
  });

  it("wraps bounded input to its nonzero line origin without splitting CJK", () => {
    useEditorStore.getState().createCanvasSession("slide", {
      slideSize: { columns: 5, rows: 2 },
    });
    canvasCommands.staticGrid.enterTextEdit({ x: 3, y: 0 });

    useEditorStore.getState().writeTextString("AB你");

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(
      new Map([
        ["3,0", { char: "A", color: "#000000" }],
        ["4,0", { char: "B", color: "#000000" }],
        ["3,1", { char: "你", color: "#000000" }],
      ])
    );
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 3, y: 1 });
    expect(useEditorStore.getState().interaction.staticGridInputFlow).toMatchObject({
      lineOriginX: 3,
      activeCell: { x: 3, y: 1 },
      exhausted: true,
    });
  });

  it("stores terminal spaces once and lets Backspace resume an exhausted flow", () => {
    useEditorStore.getState().createCanvasSession("slide", {
      slideSize: { columns: 1, rows: 1 },
    });
    canvasCommands.staticGrid.enterTextEdit({ x: 0, y: 0 });

    useEditorStore.getState().writeTextString(" ");
    const terminalReader = useEditorStore.getState().contentSurface.reader;
    const terminalState = useEditorStore.getState();
    useEditorStore.getState().writeTextString(" ");

    expect(useEditorStore.getState()).toBe(terminalState);
    expect(useEditorStore.getState().contentSurface.reader).toBe(terminalReader);
    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe(" ");
    expect(useEditorStore.getState().interaction.staticGridInputFlow?.exhausted).toBe(true);

    useEditorStore.getState().backspaceText();

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(new Map());
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 0, y: 0 });
    expect(useEditorStore.getState().interaction.staticGridInputFlow?.exhausted).toBe(false);
  });

  it("backspaces the previous row after an automatic wrap", () => {
    useEditorStore.getState().createCanvasSession("slide", {
      slideSize: { columns: 3, rows: 2 },
    });
    canvasCommands.staticGrid.enterTextEdit({ x: 1, y: 0 });
    useEditorStore.getState().writeTextString("AB");

    useEditorStore.getState().backspaceText();

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(
      new Map([["1,0", { char: "A", color: "#000000" }]])
    );
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 2, y: 0 });
  });

  it("keeps the advanced active cell and clears edit state when leaving text edit mode", () => {
    setTextState({ textCursor: { x: 0, y: 0 } });
    useEditorStore.getState().writeTextString("AB");

    canvasCommands.staticGrid.exitTextEdit();

    expect(useEditorStore.getState().interaction.textCursor).toBeNull();
    expect(useEditorStore.getState().interaction.staticGridSelection.activeCell).toEqual({ x: 2, y: 0 });
    expect(useEditorStore.getState().interaction.staticGridInputFlow).toBeNull();
  });
});

describe("textSlice paste background merging", () => {
  afterEach(() => {
    resetStore();
  });

  it("inherits target backgrounds unless rich cells provide one", () => {
    setTextState({ textCursor: { x: 0, y: 0 } });
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "A", color: "#ffffff", bgColor: "#000000" }],
      ["1,0", { char: "B", color: "#ffffff", bgColor: "#000000" }],
    ]);

    useEditorStore.getState().pasteRichData([
      { x: 0, y: 0, char: "X", color: "#ff0000" },
      {
        x: 1,
        y: 0,
        char: "Y",
        color: "#00ff00",
        bgColor: "#0000ff",
      },
    ]);

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(
      new Map([
        ["0,0", { char: "X", color: "#ff0000", bgColor: "#000000" }],
        ["1,0", { char: "Y", color: "#00ff00", bgColor: "#0000ff" }],
      ])
    );
  });

  it("commits rich rows as one compact CellPlane operation", () => {
    setTextState({ textCursor: { x: 3, y: 2 } });
    const before = defaultCanvasDocuments.yCellPlaneOperations.length;

    useEditorStore.getState().pasteRichRows([{
      y: 0,
      spans: [{
        x: 0,
        text: "A你B",
        width: 4,
        color: "#ff0000",
      }],
    }]);

    expect(defaultCanvasDocuments.yCellPlaneOperations.length).toBe(before + 1);
    const operation = defaultCanvasDocuments.yCellPlaneOperations.get(before)!;
    expect(operation).toMatchObject({
      bounds: { x: 3, y: 2, width: 4, height: 1 },
      format: 2,
    });
    expect(decodeCellPlaneOperationRows(operation)).toMatchObject([{
        y: 2,
        spans: [{ x: 3, text: "A你B", preserveTargetBackground: true }],
      }]);
    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(new Map([
      ["3,2", { char: "A", color: "#ff0000" }],
      ["4,2", { char: "你", color: "#ff0000" }],
      ["6,2", { char: "B", color: "#ff0000" }],
    ]));
  });

  it("inherits the anchor background when pasting onto a wide follower", () => {
    setTextState({ textCursor: { x: 1, y: 0 } });
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "你", color: "#ffffff", bgColor: "#000000" }],
    ]);

    useEditorStore.getState().pasteRichData([
      { x: 0, y: 0, char: "X", color: "#ff0000" },
    ]);

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(
      new Map([
        ["1,0", { char: "X", color: "#ff0000", bgColor: "#000000" }],
      ])
    );
  });

  it("anchors sparse rich data at the selection union top-left and preserves holes", () => {
    setTextState({ textCursor: null });
    setCanvasTestState({
      staticGridEditMode: "navigate",
      staticGridSelection: {
        mode: "range",
        activeCell: { x: 5, y: 4 },
        anchorCell: { x: 5, y: 4 },
        primaryRange: { start: { x: 5, y: 4 }, end: { x: 6, y: 5 } },
        additionalRanges: [
          { start: { x: 2, y: 3 }, end: { x: 2, y: 3 } },
        ],
      },
    });
    applyFreeformSnapshotToYMaps([
      ["2,3", { char: "A", color: "#ffffff" }],
      ["3,3", { char: "B", color: "#ffffff" }],
      ["2,4", { char: "C", color: "#ffffff" }],
      ["3,4", { char: "D", color: "#ffffff" }],
    ]);

    useEditorStore.getState().pasteRichData([
      { x: 1, y: 0, char: "b", color: "#ff0000" },
      { x: 0, y: 1, char: "c", color: "#00ff00" },
    ]);

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(
      new Map([
        ["2,3", { char: "A", color: "#ffffff" }],
        ["3,3", { char: "b", color: "#ff0000" }],
        ["2,4", { char: "c", color: "#00ff00" }],
        ["3,4", { char: "D", color: "#ffffff" }],
      ])
    );
  });

  it("selects the actual rich paste footprint including wide cells", () => {
    setTextState({ textCursor: { x: 4, y: 2 } });

    useEditorStore.getState().pasteRichData(
      [
        { x: 0, y: 0, char: "A", color: "#ffffff" },
        { x: 0, y: 1, char: "你", color: "#ffffff" },
      ],
      undefined,
      { selectResult: true }
    );

    expect(useEditorStore.getState().interaction).toMatchObject({
      textCursor: null,
      staticGridEditMode: "navigate",
      staticGridInputFlow: null,
      staticGridSelection: {
        mode: "range",
        activeCell: { x: 4, y: 2 },
        primaryRange: {
          start: { x: 4, y: 2 },
          end: { x: 5, y: 3 },
        },
      },
    });
  });

  it("selects a multiline plain-text paste without changing normal input flow", () => {
    setTextState({ textCursor: { x: 3, y: 1 } });

    useEditorStore.getState().writeTextString("AB\n你", undefined, {
      selectResult: true,
    });

    expect(useEditorStore.getState().interaction).toMatchObject({
      textCursor: null,
      staticGridEditMode: "navigate",
      staticGridInputFlow: null,
      staticGridSelection: {
        mode: "range",
        activeCell: { x: 3, y: 1 },
        primaryRange: {
          start: { x: 3, y: 1 },
          end: { x: 4, y: 2 },
        },
      },
    });
  });
});

describe("textSlice structured box name editing", () => {
  afterEach(() => {
    resetStore();
  });

  it("places the cursor after inserted CJK box name text", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 5, y: 2 },
      structuredScene: [
        {
          id: "box-1",
          type: "box",
          order: 1,
          start: { x: 2, y: 2 },
          end: { x: 12, y: 6 },
          style: { color: "#ffffff" },
        },
      ],
    });

    useEditorStore.getState().writeTextString("接口");

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      { id: "box-1", name: "接口" },
    ]);
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 9, y: 2 });
  });

  it("keeps overflow CJK name text while placing the cursor after the visible text", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 3, y: 0 },
      structuredScene: [
        {
          id: "box-1",
          type: "box",
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 6, y: 2 },
          style: { color: "#ffffff" },
        },
      ],
    });

    useEditorStore.getState().writeTextString("接口");

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      { id: "box-1", name: "接口" },
    ]);
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 5, y: 0 });
  });

  it("reveals overflow CJK name text after the box is widened", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 3, y: 0 },
      structuredScene: [
        {
          id: "box-1",
          type: "box",
          order: 1,
          start: { x: 0, y: 0 },
          end: { x: 6, y: 2 },
          style: { color: "#ffffff" },
        },
      ],
    });

    useEditorStore.getState().writeTextString("接口");
    useEditorStore.getState().updateStructuredBox("box-1", (node) => ({
      ...node,
      end: { x: 10, y: 2 },
    }));

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      { id: "box-1", name: "接口", end: { x: 10, y: 2 } },
    ]);
  });

  it("backspaces one CJK box name grapheme and moves by its display width", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 9, y: 2 },
      selectedStructuredNodeIds: ["box-1"],
      selectedStructuredBoxId: "box-1",
      structuredScene: [
        {
          id: "box-1",
          type: "box",
          order: 1,
          start: { x: 2, y: 2 },
          end: { x: 12, y: 6 },
          name: "接口",
          style: { color: "#ffffff" },
        },
      ],
    });

    useEditorStore.getState().backspaceText();

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      { id: "box-1", name: "接" },
    ]);
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 7, y: 2 });
  });

  it("deletes the next CJK box name grapheme without removing the box", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 5, y: 2 },
      selectedStructuredNodeIds: ["box-1"],
      selectedStructuredBoxId: "box-1",
      structuredScene: [
        {
          id: "box-1",
          type: "box",
          order: 1,
          start: { x: 2, y: 2 },
          end: { x: 12, y: 6 },
          name: "接口",
          style: { color: "#ffffff" },
        },
      ],
    });

    useEditorStore.getState().deleteTextForward();

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      { id: "box-1", name: "口" },
    ]);
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 5, y: 2 });
    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual(["box-1"]);
  });

  it("deletes the next box name character without removing the box", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 6, y: 2 },
      selectedStructuredNodeIds: ["box-1"],
      selectedStructuredBoxId: "box-1",
      structuredScene: [
        {
          id: "box-1",
          type: "box",
          order: 1,
          start: { x: 2, y: 2 },
          end: { x: 12, y: 6 },
          name: "API",
          style: { color: "#ffffff" },
        },
      ],
    });

    useEditorStore.getState().deleteTextForward();

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      { id: "box-1", name: "AI" },
    ]);
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 6, y: 2 });
    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual(["box-1"]);
  });

  it("keeps the box when deleting forward at the end of the name", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 8, y: 2 },
      selectedStructuredNodeIds: ["box-1"],
      selectedStructuredBoxId: "box-1",
      structuredScene: [
        {
          id: "box-1",
          type: "box",
          order: 1,
          start: { x: 2, y: 2 },
          end: { x: 12, y: 6 },
          name: "API",
          style: { color: "#ffffff" },
        },
      ],
    });

    useEditorStore.getState().deleteTextForward();

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      { id: "box-1", name: "API" },
    ]);
    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual(["box-1"]);
  });

  it("backspaces the previous box name character without removing the box", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 6, y: 2 },
      selectedStructuredNodeIds: ["box-1"],
      selectedStructuredBoxId: "box-1",
      structuredScene: [
        {
          id: "box-1",
          type: "box",
          order: 1,
          start: { x: 2, y: 2 },
          end: { x: 12, y: 6 },
          name: "API",
          style: { color: "#ffffff" },
        },
      ],
    });

    useEditorStore.getState().backspaceText();

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      { id: "box-1", name: "PI" },
    ]);
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 5, y: 2 });
    expect(useEditorStore.getState().interaction.selectedStructuredNodeIds).toEqual(["box-1"]);
  });

  it("creates a structured text node from structured grid focus input", () => {
    setCanvasTestState({
      canvasMode: "structured",
      structuredScene: [],
      contentSurface: new TestCanvasContentSurface(),
      textCursor: null,
      structuredGridFocus: { x: 7, y: 4 },
      selectedStructuredNodeIds: [],
      selectedStructuredBoxId: null,
      brushColor: "#abcdef",
    });

    useEditorStore.getState().writeTextString("Hi");

    const state = useEditorStore.getState();
    expect(state.structuredScene).toHaveLength(1);
    expect(state.structuredScene[0]).toMatchObject({
      type: "text",
      position: { x: 7, y: 4 },
      text: "Hi",
      style: { color: "#abcdef" },
    });
    expect(state.interaction.structuredGridFocus).toBeNull();
    expect(state.interaction.textCursor).toEqual({ x: 9, y: 4 });
    expect(state.interaction.selectedStructuredNodeIds).toEqual([
      state.structuredScene[0].id,
    ]);
  });

  it("inserts structured text at the clicked offset on a later line", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 1, y: 1 },
      editingStructuredTextNodeId: "text-1",
      selectedStructuredNodeIds: ["text-1"],
      structuredScene: [
        {
          id: "text-1",
          type: "text",
          order: 1,
          position: { x: 0, y: 0 },
          text: "AB\nCD",
          style: { color: "#ffffff" },
        },
      ],
    });

    useEditorStore.getState().writeTextString("!");

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      { id: "text-1", text: "AB\nC!D" },
    ]);
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 2, y: 1 });
  });

  it("inserts a newline inside the active structured text node", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 1, y: 0 },
      editingStructuredTextNodeId: "text-1",
      selectedStructuredNodeIds: ["text-1"],
      structuredScene: [
        {
          id: "text-1",
          type: "text",
          order: 1,
          position: { x: 0, y: 0 },
          text: "AB",
          style: { color: "#ffffff" },
        },
      ],
    });

    useEditorStore.getState().newlineText();

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      { id: "text-1", text: "A\nB" },
    ]);
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 0, y: 1 });
  });

  it("backspaces structured text by layout offset on later lines", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 1, y: 1 },
      editingStructuredTextNodeId: "text-1",
      selectedStructuredNodeIds: ["text-1"],
      structuredScene: [
        {
          id: "text-1",
          type: "text",
          order: 1,
          position: { x: 0, y: 0 },
          text: "AB\nCD",
          style: { color: "#ffffff" },
        },
      ],
    });

    useEditorStore.getState().backspaceText();

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      { id: "text-1", text: "AB\nD" },
    ]);
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 0, y: 1 });
  });

  it("deletes structured text forward by layout offset on later lines", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 1, y: 1 },
      editingStructuredTextNodeId: "text-1",
      selectedStructuredNodeIds: ["text-1"],
      structuredScene: [
        {
          id: "text-1",
          type: "text",
          order: 1,
          position: { x: 0, y: 0 },
          text: "AB\nCD",
          style: { color: "#ffffff" },
        },
      ],
    });

    useEditorStore.getState().deleteTextForward();

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      { id: "text-1", text: "AB\nC" },
    ]);
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 1, y: 1 });
  });

  it("inserts structured text after a wide character and moves the caret by width", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 2, y: 0 },
      editingStructuredTextNodeId: "text-1",
      selectedStructuredNodeIds: ["text-1"],
      structuredScene: [
        {
          id: "text-1",
          type: "text",
          order: 1,
          position: { x: 0, y: 0 },
          text: "你A",
          style: { color: "#ffffff" },
        },
      ],
    });

    useEditorStore.getState().writeTextString("!");

    expect(useEditorStore.getState().structuredScene).toMatchObject([
      { id: "text-1", text: "你!A" },
    ]);
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 3, y: 0 });
  });

  it("moves left across a structured CJK character by its display width", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 2, y: 0 },
      editingStructuredTextNodeId: "text-1",
      structuredScene: [
        {
          id: "text-1",
          type: "text",
          order: 1,
          position: { x: 0, y: 0 },
          text: "你A",
          style: { color: "#ffffff" },
        },
      ],
    });

    useEditorStore.getState().moveTextCursor(-1, 0);

    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 0, y: 0 });
  });

  it("moves right across a structured CJK character by its display width", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 0, y: 0 },
      editingStructuredTextNodeId: "text-1",
      structuredScene: [
        {
          id: "text-1",
          type: "text",
          order: 1,
          position: { x: 0, y: 0 },
          text: "你A",
          style: { color: "#ffffff" },
        },
      ],
    });

    useEditorStore.getState().moveTextCursor(1, 0);

    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 2, y: 0 });
  });

  it("moves left from after a structured wide character to its anchor", () => {
    setCanvasTestState({
      canvasMode: "structured",
      textCursor: { x: 3, y: 0 },
      editingStructuredTextNodeId: "text-1",
      structuredScene: [
        {
          id: "text-1",
          type: "text",
          order: 1,
          position: { x: 0, y: 0 },
          text: "A你B",
          style: { color: "#ffffff" },
        },
      ],
    });

    useEditorStore.getState().moveTextCursor(-1, 0);

    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 1, y: 0 });
  });
});
