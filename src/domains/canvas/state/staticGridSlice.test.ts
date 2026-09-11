import { afterEach, describe, expect, it } from "vitest";
import { TestCanvasContentSurface } from "@/domains/canvas/testing";
import {
  applyFreeformSnapshotToYMaps,
  canvasCommands,
  undoCanvas,
  setCanvasTestState,
  useEditorStore,
} from "@/domains/canvas/testing";
import {
  createGridSelectionState,
  getGridSelectionRanges,
  getStaticGridCursor,
  getStaticGridSelection,
} from "@/domains/selection/public";

const initialState = useEditorStore.getState();

const resetStore = () => {
  useEditorStore.setState({
    ...initialState,
    canvasMode: "freeform",
    contentSurface: new TestCanvasContentSurface(),
  });
  setCanvasTestState({
    staticGrid: {
      mode: "navigate",
      selection: createGridSelectionState(),
    },
  });
  applyFreeformSnapshotToYMaps([]);
};

describe("static-grid commands", () => {
  afterEach(() => {
    resetStore();
  });

  it("moves the active cell without creating editing cursor state", () => {
    canvasCommands.staticGrid.setActiveCell({ x: 4, y: 5 });
    canvasCommands.staticGrid.moveFocus(1, -2);

    expect(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid)).toEqual({
      mode: "cell",
      activeCell: { x: 5, y: 3 },
      anchorCell: { x: 5, y: 3 },
      primaryRange: { start: { x: 5, y: 3 }, end: { x: 5, y: 3 } },
      additionalRanges: [],
    });
    expect(getStaticGridCursor(useEditorStore.getState().interaction.staticGrid)).toBeNull();
  });

  it("moves a selected range as one undoable cell-plane operation", () => {
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "A", color: "#fff" }],
      ["1,0", { char: "B", color: "#fff" }],
      ["2,0", { char: "X", color: "#f00" }],
    ]);
    canvasCommands.staticGrid.setSelectionRange({
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
    });

    expect(canvasCommands.selection.moveStaticRange({ x: 2, y: 0 })).toBe(
      true
    );
    const moved = useEditorStore.getState().contentSurface.reader;
    expect(moved.get({ x: 0, y: 0 })).toBeUndefined();
    expect(moved.get({ x: 2, y: 0 })?.char).toBe("A");
    expect(moved.get({ x: 3, y: 0 })?.char).toBe("B");
    expect(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid).primaryRange).toEqual({
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

    canvasCommands.staticGrid.setActiveCell({ x: 3, y: 1 });
    expect(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid).activeCell).toEqual({
      x: 2,
      y: 1,
    });

    canvasCommands.staticGrid.moveFocus(1, 0);
    expect(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid).activeCell).toEqual({
      x: 4,
      y: 1,
    });
    canvasCommands.staticGrid.moveFocus(-1, 0);
    expect(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid).activeCell).toEqual({
      x: 2,
      y: 1,
    });
  });

  it("extends selection from the anchor", () => {
    canvasCommands.staticGrid.setActiveCell({ x: 2, y: 2 });
    canvasCommands.staticGrid.moveFocus(3, 1, { extend: true });

    expect(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid)).toEqual({
      mode: "range",
      activeCell: { x: 2, y: 2 },
      anchorCell: { x: 2, y: 2 },
      primaryRange: { start: { x: 2, y: 2 }, end: { x: 5, y: 3 } },
      additionalRanges: [],
    });
    expect(getStaticGridCursor(useEditorStore.getState().interaction.staticGrid)).toBeNull();
  });

  it("replaces the old range and keeps a reverse drag anchored at its start", () => {
    canvasCommands.staticGrid.setActiveCell({ x: 1, y: 1 });
    canvasCommands.staticGrid.setSelectionRange({
      start: { x: 5, y: 4 },
      end: { x: 2, y: 3 },
    });

    expect(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid)).toEqual({
      mode: "range",
      activeCell: { x: 5, y: 4 },
      anchorCell: { x: 5, y: 4 },
      primaryRange: { start: { x: 2, y: 3 }, end: { x: 5, y: 4 } },
      additionalRanges: [],
    });
  });

  it("extends selection left across repeated shift arrow moves", () => {
    canvasCommands.staticGrid.setActiveCell({ x: 5, y: 5 });
    canvasCommands.staticGrid.moveFocus(-1, 0, { extend: true });
    canvasCommands.staticGrid.moveFocus(-1, 0, { extend: true });

    expect(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid)).toEqual({
      mode: "range",
      activeCell: { x: 5, y: 5 },
      anchorCell: { x: 5, y: 5 },
      primaryRange: { start: { x: 3, y: 5 }, end: { x: 5, y: 5 } },
      additionalRanges: [],
    });
    expect(getStaticGridCursor(useEditorStore.getState().interaction.staticGrid)).toBeNull();
  });

  it("extends selection up across repeated shift arrow moves", () => {
    canvasCommands.staticGrid.setActiveCell({ x: 5, y: 5 });
    canvasCommands.staticGrid.moveFocus(0, -1, { extend: true });
    canvasCommands.staticGrid.moveFocus(0, -1, { extend: true });

    expect(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid)).toEqual({
      mode: "range",
      activeCell: { x: 5, y: 5 },
      anchorCell: { x: 5, y: 5 },
      primaryRange: { start: { x: 5, y: 3 }, end: { x: 5, y: 5 } },
      additionalRanges: [],
    });
    expect(getStaticGridCursor(useEditorStore.getState().interaction.staticGrid)).toBeNull();
  });
  it("clears the range without losing the active cell", () => {
    canvasCommands.staticGrid.setSelectionRange({
      start: { x: 1, y: 1 },
      end: { x: 3, y: 4 },
    });
    canvasCommands.staticGrid.clearSelection();

    expect(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid)).toEqual({
      mode: "cell",
      activeCell: { x: 1, y: 1 },
      anchorCell: { x: 1, y: 1 },
      primaryRange: { start: { x: 1, y: 1 }, end: { x: 1, y: 1 } },
      additionalRanges: [],
    });
    expect(getStaticGridCursor(useEditorStore.getState().interaction.staticGrid)).toBeNull();
  });
  it("clamps keyboard navigation to slide bounds", () => {
    setCanvasTestState({
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
    canvasCommands.staticGrid.setActiveCell({ x: 2, y: 1 });
    canvasCommands.staticGrid.moveFocus(1, 1);

    expect(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid).activeCell).toEqual({ x: 2, y: 1 });
    expect(getStaticGridCursor(useEditorStore.getState().interaction.staticGrid)).toBeNull();
  });

  it("uses content bounds for edge, row, and column navigation in freeform", () => {
    applyFreeformSnapshotToYMaps([
      ["-2,-1", { char: "A", color: "#fff" }],
      ["5,4", { char: "B", color: "#fff" }],
    ]);
    canvasCommands.staticGrid.setActiveCell({ x: 1, y: 2 });

    canvasCommands.staticGrid.moveFocusToEdge("left");
    expect(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid).activeCell).toEqual({ x: -2, y: 2 });
    expect(getStaticGridCursor(useEditorStore.getState().interaction.staticGrid)).toBeNull();

    canvasCommands.staticGrid.selectRow();
    expect(getGridSelectionRanges(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid))).toEqual([
      { start: { x: -2, y: 2 }, end: { x: 5, y: 2 } },
    ]);

    canvasCommands.staticGrid.clearSelection();
    canvasCommands.staticGrid.selectColumn();
    expect(getGridSelectionRanges(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid))).toEqual([
      { start: { x: -2, y: -1 }, end: { x: -2, y: 4 } },
    ]);
  });

  it("cycles select-all from the connected region to all effective content", () => {
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "A", color: "#fff" }],
      ["1,0", { char: "B", color: "#fff" }],
      ["5,5", { char: "C", color: "#fff" }],
    ]);
    canvasCommands.staticGrid.setActiveCell({ x: 0, y: 0 });

    canvasCommands.staticGrid.selectAll();
    expect(getGridSelectionRanges(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid))).toEqual([
      { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } },
    ]);

    canvasCommands.staticGrid.selectAll();
    expect(getGridSelectionRanges(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid))).toEqual([
      { start: { x: 0, y: 0 }, end: { x: 5, y: 5 } },
    ]);
  });

  it("keeps the active cell visible when leaving text edit mode", () => {
    canvasCommands.staticGrid.enterTextEdit({ x: 3, y: 2 });
    canvasCommands.staticGrid.exitTextEdit();

    expect(useEditorStore.getState().interaction.staticGrid.mode).toBe("navigate");
    expect(getStaticGridCursor(useEditorStore.getState().interaction.staticGrid)).toBeNull();
    expect(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid).activeCell).toEqual({ x: 3, y: 2 });
  });

  it("jumps to visible content boundaries and extends from the active anchor", () => {
    applyFreeformSnapshotToYMaps([
      ["1,1", { char: "A", color: "#fff" }],
      ["2,1", { char: "B", color: "#fff" }],
      ["4,1", { char: " ", color: "#fff", bgColor: "#333" }],
      ["5,1", { char: "C", color: "#fff" }],
    ]);
    canvasCommands.staticGrid.enterTextEdit({ x: 1, y: 1 });

    canvasCommands.staticGrid.moveFocusToContentBoundary("right");
    expect(useEditorStore.getState().interaction).toMatchObject({
      staticGrid: {
        mode: "navigate",
        selection: {
          activeCell: { x: 2, y: 1 },
          anchorCell: { x: 2, y: 1 },
          primaryRange: { start: { x: 2, y: 1 }, end: { x: 2, y: 1 } },
          additionalRanges: [],
        },
      },
    });

    canvasCommands.staticGrid.moveFocusToContentBoundary("right", {
      extend: true,
    });
    expect(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid)).toEqual({
      mode: "range",
      activeCell: { x: 2, y: 1 },
      anchorCell: { x: 2, y: 1 },
      primaryRange: { start: { x: 2, y: 1 }, end: { x: 5, y: 1 } },
      additionalRanges: [],
    });
    expect(getStaticGridCursor(useEditorStore.getState().interaction.staticGrid)).toBeNull();
  });

  it("uses the static-grid background color for slide background shapes", () => {
    setCanvasTestState({
      canvasMode: "slide",
      brushColor: "#111111",
      brushBackgroundColor: "#abcdef",
    });

    canvasCommands.grid.updateScratchForShape(
      "bg",
      { x: 0, y: 0 },
      { x: 1, y: 0 }
    );

    expect(useEditorStore.getState().interaction.scratchLayer?.get("0,0")?.bgColor).toBe(
      "#abcdef"
    );
  });
});
