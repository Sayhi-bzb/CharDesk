import { afterEach, describe, expect, it } from "vitest";
import { TestCanvasContentSurface } from "@/domains/canvas/testing";
import {
  applyFreeformSnapshotToYMaps,
  undoCanvas,
  useEditorStore,
} from "@/domains/canvas/testing";
import { createGridSelectionState, getGridSelectionRanges } from "@/domains/selection/public";

const initialState = useEditorStore.getState();

const resetStore = () => {
  useEditorStore.setState(
    {
      ...initialState,
      canvasMode: "freeform",
      contentSurface: new TestCanvasContentSurface(),
      textCursor: null,
      staticGridSelection: createGridSelectionState(),
      staticGridEditMode: "navigate",
    },
    true
  );
  applyFreeformSnapshotToYMaps([]);
};

describe("staticGridSlice", () => {
  afterEach(() => {
    resetStore();
  });

  it("moves the active cell without creating editing cursor state", () => {
    useEditorStore.getState().setStaticGridActiveCell({ x: 4, y: 5 });
    useEditorStore.getState().moveStaticGridFocus(1, -2);

    expect(useEditorStore.getState().staticGridSelection).toEqual({
      mode: "cell",
      activeCell: { x: 5, y: 3 },
      anchorCell: { x: 5, y: 3 },
      primaryRange: { start: { x: 5, y: 3 }, end: { x: 5, y: 3 } },
      additionalRanges: [],
    });
    expect(useEditorStore.getState().textCursor).toBeNull();
  });

  it("moves a selected range as one undoable cell-plane operation", () => {
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "A", color: "#fff" }],
      ["1,0", { char: "B", color: "#fff" }],
      ["2,0", { char: "X", color: "#f00" }],
    ]);
    useEditorStore.getState().setStaticGridSelectionRange({
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
    });

    expect(
      useEditorStore.getState().moveStaticGridSelection({ x: 2, y: 0 })
    ).toBe(true);
    const moved = useEditorStore.getState().contentSurface.reader;
    expect(moved.get({ x: 0, y: 0 })).toBeUndefined();
    expect(moved.get({ x: 2, y: 0 })?.char).toBe("A");
    expect(moved.get({ x: 3, y: 0 })?.char).toBe("B");
    expect(useEditorStore.getState().staticGridSelection.primaryRange).toEqual({
      start: { x: 2, y: 0 },
      end: { x: 3, y: 0 },
    });

    undoCanvas();
    const restored = useEditorStore.getState().contentSurface.reader;
    expect(restored.get({ x: 0, y: 0 })?.char).toBe("A");
    expect(restored.get({ x: 1, y: 0 })?.char).toBe("B");
    expect(restored.get({ x: 2, y: 0 })?.char).toBe("X");
    expect(restored.get({ x: 3, y: 0 })).toBeUndefined();
  });

  it("anchors either half of a wide cell and moves across it atomically", () => {
    applyFreeformSnapshotToYMaps([
      ["2,1", { char: "你", color: "#fff" }],
      ["4,1", { char: "B", color: "#fff" }],
    ]);

    useEditorStore.getState().setStaticGridActiveCell({ x: 3, y: 1 });
    expect(useEditorStore.getState().staticGridSelection.activeCell).toEqual({
      x: 2,
      y: 1,
    });

    useEditorStore.getState().moveStaticGridFocus(1, 0);
    expect(useEditorStore.getState().staticGridSelection.activeCell).toEqual({
      x: 4,
      y: 1,
    });
    useEditorStore.getState().moveStaticGridFocus(-1, 0);
    expect(useEditorStore.getState().staticGridSelection.activeCell).toEqual({
      x: 2,
      y: 1,
    });
  });

  it("extends selection from the anchor", () => {
    useEditorStore.getState().setStaticGridActiveCell({ x: 2, y: 2 });
    useEditorStore.getState().moveStaticGridFocus(3, 1, { extend: true });

    expect(useEditorStore.getState().staticGridSelection).toEqual({
      mode: "range",
      activeCell: { x: 2, y: 2 },
      anchorCell: { x: 2, y: 2 },
      primaryRange: { start: { x: 2, y: 2 }, end: { x: 5, y: 3 } },
      additionalRanges: [],
    });
    expect(useEditorStore.getState().textCursor).toBeNull();
  });

  it("replaces the old range and keeps a reverse drag anchored at its start", () => {
    useEditorStore.getState().setStaticGridActiveCell({ x: 1, y: 1 });
    useEditorStore.getState().setStaticGridSelectionRange({
      start: { x: 5, y: 4 },
      end: { x: 2, y: 3 },
    });

    expect(useEditorStore.getState().staticGridSelection).toEqual({
      mode: "range",
      activeCell: { x: 5, y: 4 },
      anchorCell: { x: 5, y: 4 },
      primaryRange: { start: { x: 2, y: 3 }, end: { x: 5, y: 4 } },
      additionalRanges: [],
    });
  });

  it("extends selection left across repeated shift arrow moves", () => {
    useEditorStore.getState().setStaticGridActiveCell({ x: 5, y: 5 });
    useEditorStore.getState().moveStaticGridFocus(-1, 0, { extend: true });
    useEditorStore.getState().moveStaticGridFocus(-1, 0, { extend: true });

    expect(useEditorStore.getState().staticGridSelection).toEqual({
      mode: "range",
      activeCell: { x: 5, y: 5 },
      anchorCell: { x: 5, y: 5 },
      primaryRange: { start: { x: 3, y: 5 }, end: { x: 5, y: 5 } },
      additionalRanges: [],
    });
    expect(useEditorStore.getState().textCursor).toBeNull();
  });

  it("extends selection up across repeated shift arrow moves", () => {
    useEditorStore.getState().setStaticGridActiveCell({ x: 5, y: 5 });
    useEditorStore.getState().moveStaticGridFocus(0, -1, { extend: true });
    useEditorStore.getState().moveStaticGridFocus(0, -1, { extend: true });

    expect(useEditorStore.getState().staticGridSelection).toEqual({
      mode: "range",
      activeCell: { x: 5, y: 5 },
      anchorCell: { x: 5, y: 5 },
      primaryRange: { start: { x: 5, y: 3 }, end: { x: 5, y: 5 } },
      additionalRanges: [],
    });
    expect(useEditorStore.getState().textCursor).toBeNull();
  });
  it("clears the range without losing the active cell", () => {
    useEditorStore.getState().setStaticGridSelectionRange({
      start: { x: 1, y: 1 },
      end: { x: 3, y: 4 },
    });
    useEditorStore.getState().clearStaticGridSelection();

    expect(useEditorStore.getState().staticGridSelection).toEqual({
      mode: "cell",
      activeCell: { x: 1, y: 1 },
      anchorCell: { x: 1, y: 1 },
      primaryRange: { start: { x: 1, y: 1 }, end: { x: 1, y: 1 } },
      additionalRanges: [],
    });
    expect(useEditorStore.getState().textCursor).toBeNull();
  });
  it("clamps keyboard navigation to slide bounds", () => {
    useEditorStore.setState({
      canvasMode: "slide",
      slideDeck: {
        activeSlideId: "slide-1",
        slides: [
          {
            id: "slide-1",
            name: "Slide 1",
            size: { columns: 3, rows: 2 },
          },
        ],
      },
    });
    useEditorStore.getState().setStaticGridActiveCell({ x: 2, y: 1 });
    useEditorStore.getState().moveStaticGridFocus(1, 1);

    expect(useEditorStore.getState().staticGridSelection.activeCell).toEqual({ x: 2, y: 1 });
    expect(useEditorStore.getState().textCursor).toBeNull();
  });

  it("uses content bounds for edge, row, and column navigation in freeform", () => {
    applyFreeformSnapshotToYMaps([
      ["-2,-1", { char: "A", color: "#fff" }],
      ["5,4", { char: "B", color: "#fff" }],
    ]);
    useEditorStore.getState().setStaticGridActiveCell({ x: 1, y: 2 });

    useEditorStore.getState().moveStaticGridFocusToEdge("left");
    expect(useEditorStore.getState().staticGridSelection.activeCell).toEqual({ x: -2, y: 2 });
    expect(useEditorStore.getState().textCursor).toBeNull();

    useEditorStore.getState().selectStaticGridRow();
    expect(getGridSelectionRanges(useEditorStore.getState().staticGridSelection)).toEqual([
      { start: { x: -2, y: 2 }, end: { x: 5, y: 2 } },
    ]);

    useEditorStore.getState().clearStaticGridSelection();
    useEditorStore.getState().selectStaticGridColumn();
    expect(getGridSelectionRanges(useEditorStore.getState().staticGridSelection)).toEqual([
      { start: { x: -2, y: -1 }, end: { x: -2, y: 4 } },
    ]);
  });

  it("cycles select-all from the connected region to all effective content", () => {
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "A", color: "#fff" }],
      ["1,0", { char: "B", color: "#fff" }],
      ["5,5", { char: "C", color: "#fff" }],
    ]);
    useEditorStore.getState().setStaticGridActiveCell({ x: 0, y: 0 });

    useEditorStore.getState().selectStaticGridAll();
    expect(getGridSelectionRanges(useEditorStore.getState().staticGridSelection)).toEqual([
      { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
    ]);

    useEditorStore.getState().selectStaticGridAll();
    expect(getGridSelectionRanges(useEditorStore.getState().staticGridSelection)).toEqual([
      { start: { x: 0, y: 0 }, end: { x: 5, y: 5 } },
    ]);
  });

  it("keeps the active cell visible when leaving text edit mode", () => {
    useEditorStore.getState().enterStaticGridTextEdit({ x: 3, y: 2 });
    useEditorStore.getState().exitStaticGridTextEdit();

    expect(useEditorStore.getState().staticGridEditMode).toBe("navigate");
    expect(useEditorStore.getState().textCursor).toBeNull();
    expect(useEditorStore.getState().staticGridSelection.activeCell).toEqual({ x: 3, y: 2 });
  });

  it("jumps to visible content boundaries and extends from the active anchor", () => {
    applyFreeformSnapshotToYMaps([
      ["1,1", { char: "A", color: "#fff" }],
      ["2,1", { char: "B", color: "#fff" }],
      ["4,1", { char: " ", color: "#fff", bgColor: "#333" }],
      ["5,1", { char: "C", color: "#fff" }],
    ]);
    useEditorStore.getState().enterStaticGridTextEdit({ x: 1, y: 1 });

    useEditorStore.getState().moveStaticGridFocusToContentBoundary("right");
    expect(useEditorStore.getState()).toMatchObject({
      staticGridEditMode: "navigate",
      textCursor: null,
      staticGridSelection: {
        activeCell: { x: 2, y: 1 },
        anchorCell: { x: 2, y: 1 },
        primaryRange: { start: { x: 2, y: 1 }, end: { x: 2, y: 1 } },
        additionalRanges: [],
      },
    });

    useEditorStore.getState().moveStaticGridFocusToContentBoundary("right", {
      extend: true,
    });
    expect(useEditorStore.getState().staticGridSelection).toEqual({
      mode: "range",
      activeCell: { x: 2, y: 1 },
      anchorCell: { x: 2, y: 1 },
      primaryRange: { start: { x: 2, y: 1 }, end: { x: 5, y: 1 } },
      additionalRanges: [],
    });
    expect(useEditorStore.getState().textCursor).toBeNull();
  });

  it("uses the static-grid background color for slide background shapes", () => {
    useEditorStore.setState({
      canvasMode: "slide",
      brushColor: "#111111",
      brushBackgroundColor: "#abcdef",
    });

    useEditorStore
      .getState()
      .updateScratchForShape("bg", { x: 0, y: 0 }, { x: 1, y: 0 });

    expect(useEditorStore.getState().scratchLayer?.get("0,0")?.bgColor).toBe(
      "#abcdef"
    );
  });
});
