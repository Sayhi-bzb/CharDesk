import { afterEach, describe, expect, it } from "vitest";
import {
  applyFreeformSnapshotToYMaps,
  canvasCommands,
  defaultCanvasDocuments,
  setCanvasTestState,
  useEditorStore,
} from "@/domains/canvas/testing";
import { getStaticGridCursor, getStaticGridSelection } from "@/domains/selection/public";

const initialState = useEditorStore.getState();
const cell = (char: string) => ({ char, color: "#fff" });
const cells = () => useEditorStore.getState().contentSurface.reader.materialize();

const resetStore = () => {
  useEditorStore.setState(initialState, true);
  applyFreeformSnapshotToYMaps([]);
};

describe("static grid deletion commands", () => {
  afterEach(resetStore);

  it("deletes the active Cell forward without moving navigation", () => {
    applyFreeformSnapshotToYMaps([
      ["0,0", cell("A")],
      ["1,0", cell("B")],
      ["2,0", cell("C")],
    ]);
    canvasCommands.staticGrid.setActiveCell({ x: 1, y: 0 });

    canvasCommands.staticGrid.delete("forward");

    expect(cells()).toEqual(
      new Map([
        ["0,0", cell("A")],
        ["2,0", cell("C")],
      ])
    );
    expect(
      getStaticGridSelection(useEditorStore.getState().interaction.staticGrid).activeCell
    ).toEqual({ x: 1, y: 0 });
  });

  it("deletes the Cell to the left and moves navigation left", () => {
    applyFreeformSnapshotToYMaps([
      ["0,0", cell("A")],
      ["1,0", cell("B")],
      ["2,0", cell("C")],
    ]);
    canvasCommands.staticGrid.setActiveCell({ x: 2, y: 0 });

    canvasCommands.staticGrid.delete("backward");

    expect(cells()).toEqual(
      new Map([
        ["0,0", cell("A")],
        ["2,0", cell("C")],
      ])
    );
    expect(
      getStaticGridSelection(useEditorStore.getState().interaction.staticGrid).activeCell
    ).toEqual({ x: 1, y: 0 });
  });

  it.each(["backward", "forward"] as const)("deletes a Range %s and preserves it", (direction) => {
    applyFreeformSnapshotToYMaps([
      ["0,0", cell("A")],
      ["1,0", cell("B")],
      ["2,0", cell("C")],
    ]);
    canvasCommands.staticGrid.setSelectionRange({
      start: { x: 1, y: 0 },
      end: { x: 2, y: 0 },
    });

    canvasCommands.staticGrid.delete(direction);

    expect(cells()).toEqual(new Map([["0,0", cell("A")]]));
    expect(getStaticGridSelection(useEditorStore.getState().interaction.staticGrid).mode).toBe(
      "range"
    );
  });

  it("deletes the current Cell forward while text editing", () => {
    applyFreeformSnapshotToYMaps([
      ["1,0", cell("B")],
      ["2,0", cell("C")],
    ]);
    canvasCommands.staticGrid.enterTextEdit({ x: 1, y: 0 });

    canvasCommands.staticGrid.delete("forward");

    expect(cells()).toEqual(new Map([["2,0", cell("C")]]));
    expect(getStaticGridCursor(useEditorStore.getState().interaction.staticGrid)).toEqual({
      x: 1,
      y: 0,
    });
  });

  it("deletes a wide Cell atomically when moving backward", () => {
    applyFreeformSnapshotToYMaps([
      ["1,0", cell("森")],
      ["3,0", cell("B")],
    ]);
    canvasCommands.staticGrid.setActiveCell({ x: 3, y: 0 });

    canvasCommands.staticGrid.delete("backward");

    expect(cells()).toEqual(new Map([["3,0", cell("B")]]));
    expect(
      getStaticGridSelection(useEditorStore.getState().interaction.staticGrid).activeCell
    ).toEqual({ x: 1, y: 0 });
  });

  it("keeps a bounded cursor in place at the left edge", () => {
    canvasCommands.sessions.create("slide", {
      slideSize: { columns: 3, rows: 2 },
    });
    canvasCommands.staticGrid.enterTextEdit({ x: 0, y: 1 });

    canvasCommands.staticGrid.delete("backward");
    canvasCommands.text.write("X");

    expect(cells()).toEqual(
      new Map([
        [
          "0,1",
          {
            char: "X",
            color: "#000000",
          },
        ],
      ])
    );
    expect(getStaticGridCursor(useEditorStore.getState().interaction.staticGrid)).toEqual({
      x: 1,
      y: 1,
    });
  });

  it("moves backward through an empty Cell without creating content", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      staticGrid: {
        mode: "navigate",
        selection: {
          mode: "cell",
          activeCell: { x: 2, y: 0 },
          anchorCell: { x: 2, y: 0 },
          primaryRange: {
            start: { x: 2, y: 0 },
            end: { x: 2, y: 0 },
          },
          additionalRanges: [],
        },
      },
    });

    canvasCommands.staticGrid.delete("backward");

    expect(cells()).toEqual(new Map());
    expect(
      getStaticGridSelection(useEditorStore.getState().interaction.staticGrid).activeCell
    ).toEqual({ x: 1, y: 0 });
  });

  it("records content deletion but not an empty forward deletion in history", () => {
    applyFreeformSnapshotToYMaps([["1,0", cell("A")]]);
    defaultCanvasDocuments.clearHistory();
    canvasCommands.staticGrid.setActiveCell({ x: 1, y: 0 });

    canvasCommands.staticGrid.delete("forward");

    expect(defaultCanvasDocuments.getHistoryAvailability().canUndo).toBe(true);
    expect(defaultCanvasDocuments.undo()).toBe(true);
    expect(cells()).toEqual(new Map([["1,0", cell("A")]]));
    expect(defaultCanvasDocuments.redo()).toBe(true);
    expect(cells()).toEqual(new Map());

    canvasCommands.staticGrid.setActiveCell({ x: 2, y: 0 });
    defaultCanvasDocuments.clearHistory();
    canvasCommands.staticGrid.delete("forward");

    expect(defaultCanvasDocuments.getHistoryAvailability().canUndo).toBe(false);
  });
});
