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

  it("returns to the explicit origin of one continuous input session", () => {
    setTextState({
      textCursor: { x: 0, y: 0 },
    });

    useEditorStore.getState().writeTextString("abc          123森");
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 18, y: 0 });
    useEditorStore.getState().newlineText();

    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 0, y: 1 });
    expect(useEditorStore.getState().interaction.staticGridInputSession?.origin)
      .toEqual({ x: 0, y: 0 });
  });

  it("does not infer a new session origin from literal space cells", () => {
    setTextState({
      textCursor: { x: 18, y: 0 },
      contentSurface: new TestCanvasContentSurface([
        ["0,0", { char: "a", color: "#ffffff" }],
        ["1,0", { char: "b", color: "#ffffff" }],
        ["2,0", { char: "c", color: "#ffffff" }],
        ...Array.from({ length: 10 }, (_, index) => [
          `${index + 3},0`,
          { char: " ", color: "#ffffff" },
        ] as const),
        ["13,0", { char: "1", color: "#ffffff" }],
        ["14,0", { char: "2", color: "#ffffff" }],
        ["15,0", { char: "3", color: "#ffffff" }],
        ["16,0", { char: "森", color: "#ffffff" }],
      ]),
    });

    useEditorStore.getState().newlineText();

    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 18, y: 1 });
  });

  it("does not infer a new session origin from empty cells", () => {
    setTextState({
      textCursor: { x: 18, y: 0 },
      contentSurface: new TestCanvasContentSurface([
        ["0,0", { char: "a", color: "#ffffff" }],
        ["1,0", { char: "b", color: "#ffffff" }],
        ["2,0", { char: "c", color: "#ffffff" }],
        ["13,0", { char: "1", color: "#ffffff" }],
        ["14,0", { char: "2", color: "#ffffff" }],
        ["15,0", { char: "3", color: "#ffffff" }],
        ["16,0", { char: "森", color: "#ffffff" }],
      ]),
    });

    useEditorStore.getState().newlineText();

    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 18, y: 1 });
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
    expect(useEditorStore.getState().interaction.staticGridInputSession).toMatchObject({
      origin: { x: 3, y: 0 },
      activeCell: { x: 3, y: 1 },
      exhausted: true,
    });
  });

  it("stores terminal spaces once and lets Backspace resume an exhausted session", () => {
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
    expect(useEditorStore.getState().interaction.staticGridInputSession?.exhausted).toBe(true);

    useEditorStore.getState().backspaceText();

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(new Map());
    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 0, y: 0 });
    expect(useEditorStore.getState().interaction.staticGridInputSession?.exhausted).toBe(false);
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

  it("keeps the session origin while backspacing", () => {
    setTextState({ textCursor: { x: 4, y: 2 } });
    useEditorStore.getState().writeTextString("AB");

    useEditorStore.getState().backspaceText();

    expect(useEditorStore.getState().interaction.staticGridInputSession)
      .toMatchObject({
        origin: { x: 4, y: 2 },
        activeCell: { x: 5, y: 2 },
      });
  });

  it("starts a new session after explicit cursor movement", () => {
    setTextState({ textCursor: { x: 0, y: 0 } });
    useEditorStore.getState().writeTextString("AB");

    useEditorStore.getState().moveTextCursor(1, 0);
    expect(useEditorStore.getState().interaction.staticGridInputSession?.origin)
      .toEqual({ x: 3, y: 0 });
    useEditorStore.getState().newlineText();

    expect(useEditorStore.getState().interaction.textCursor).toEqual({ x: 3, y: 1 });
  });

  it("starts a new session after indentation", () => {
    setTextState({ textCursor: { x: 0, y: 0 } });
    useEditorStore.getState().writeTextString("A");

    useEditorStore.getState().indentText();
    expect(useEditorStore.getState().interaction.staticGridInputSession?.origin)
      .toEqual({ x: 3, y: 0 });
  });

  it("keeps the advanced active cell and clears edit state when leaving text edit mode", () => {
    setTextState({ textCursor: { x: 0, y: 0 } });
    useEditorStore.getState().writeTextString("AB");

    canvasCommands.staticGrid.exitTextEdit();

    expect(useEditorStore.getState().interaction.textCursor).toBeNull();
    expect(useEditorStore.getState().interaction.staticGridSelection.activeCell).toEqual({ x: 2, y: 0 });
    expect(useEditorStore.getState().interaction.staticGridInputSession).toBeNull();
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
      staticGridInputSession: null,
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
      staticGridInputSession: null,
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
