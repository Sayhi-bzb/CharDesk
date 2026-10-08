import { describe, expect, it } from "vitest";
import {
  appendCellInteractionEvent,
  beginCellDrag,
  cancelCellDrag,
  commitCellDrag,
  createCellInteractionTransaction,
  createCellViewportState,
  cellPointToViewport,
  cellVisibleRange,
  emptyCellSelection,
  selectCellId,
  toggleCellSelection,
  updateCellDrag,
} from "./editor.js";

describe("editor interaction contracts", () => {
  it("keeps drag preview separate from commit and cancellation", () => {
    const pending = beginCellDrag(1, "clip-a", { type: "clip" }, { x: 4, y: 2 });
    const preview = updateCellDrag(pending, { x: 9, y: 5 }, "track-b");
    expect(preview.phase).toBe("dragging");
    expect(preview.delta).toEqual({ x: 5, y: 3 });
    expect(commitCellDrag(preview).phase).toBe("dropping");
    expect(cancelCellDrag(preview).phase).toBe("cancelled");
  });

  it("supports additive and toggle selection without domain objects", () => {
    const first = selectCellId(emptyCellSelection(), "a");
    const additive = selectCellId(first, "b", { additive: true });
    expect(additive.selectedIds).toEqual(["a", "b"]);
    expect(toggleCellSelection(additive, "a").selectedIds).toEqual(["b"]);
  });

  it("records transaction events and maps points through a zoomed viewport", () => {
    const state = createCellViewportState({ x: 2, y: 3, width: 100, height: 40 }, {
      scrollX: 4, scrollY: 5, zoom: 2,
    });
    expect(cellPointToViewport(state, { x: 7, y: 8 })).toEqual({ x: 6, y: 5 });
    expect(cellVisibleRange(20, 40, 10, 1)).toEqual({ start: 1, end: 7 });
    const drag = beginCellDrag(1, "a", null, { x: 0, y: 0 });
    const transaction = appendCellInteractionEvent(
      createCellInteractionTransaction(drag),
      { type: "start", state: drag },
    );
    expect(transaction.events).toHaveLength(1);
    expect(transaction.state.sourceId).toBe("a");
  });
});
