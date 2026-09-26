import { describe, expect, it } from "vitest";
import { GridSnapshotSource } from "@/shared/utils/grid-source";
import {
  collapseGridSelectionTo,
  createStaticGridInputSession,
  createGridSelectionState,
  extendGridSelectionTo,
  forEachGridSelectionSpan,
  getGridSelectionGeometry,
  getGridSelectionRanges,
  gridRangeFromSelectionArea,
  moveGridAddress,
  moveGridAddressToContentBoundary,
  normalizeGridRange,
  selectionAreaFromGridRange,
  getStaticGridViewState,
  getConnectedGridRange,
  getEffectiveGridBounds,
  moveGridAddressToEdge,
  selectGridColumn,
  selectGridRange,
  selectGridRow,
} from "@/domains/selection/public";

describe("staticGridModel", () => {
  it("normalizes reversed ranges", () => {
    expect(
      normalizeGridRange({ start: { x: 4, y: 3 }, end: { x: 1, y: 9 } })
    ).toEqual({ start: { x: 1, y: 3 }, end: { x: 4, y: 9 } });
  });

  it("converts between legacy selection areas and grid ranges", () => {
    const range = gridRangeFromSelectionArea({
      start: { x: 8, y: 2 },
      end: { x: 3, y: 4 },
    });

    expect(range).toEqual({ start: { x: 3, y: 2 }, end: { x: 8, y: 4 } });
    expect(selectionAreaFromGridRange(range)).toEqual({
      start: { x: 3, y: 2 },
      end: { x: 8, y: 4 },
    });
  });

  it("extends a range while keeping the active cell at its anchor", () => {
    const base = createGridSelectionState({ x: 2, y: 2 });
    const moved = collapseGridSelectionTo(base, moveGridAddress(base.activeCell, 1, 0));
    const extended = extendGridSelectionTo(moved, moveGridAddress(moved.activeCell, 0, 2));

    expect(moved).toEqual({
      mode: "cell",
      activeCell: { x: 3, y: 2 },
      anchorCell: { x: 3, y: 2 },
      primaryRange: { start: { x: 3, y: 2 }, end: { x: 3, y: 2 } },
      additionalRanges: [],
    });
    expect(extended).toEqual({
      mode: "range",
      activeCell: { x: 3, y: 2 },
      anchorCell: { x: 3, y: 2 },
      primaryRange: { start: { x: 3, y: 2 }, end: { x: 3, y: 4 } },
      additionalRanges: [],
    });
  });

  it("keeps the primary range last and activates it explicitly", () => {
    const base = createGridSelectionState({ x: 1, y: 1 });
    const next = selectGridRange(
      base,
      { start: { x: 4, y: 3 }, end: { x: 2, y: 2 } },
      { append: true, activeCell: "start" }
    );

    expect(getGridSelectionRanges(next)).toEqual([
      { start: { x: 1, y: 1 }, end: { x: 1, y: 1 } },
      { start: { x: 2, y: 2 }, end: { x: 4, y: 3 } },
    ]);
    expect(next.activeCell).toEqual({ x: 4, y: 3 });
    expect(next.anchorCell).toEqual({ x: 4, y: 3 });
  });

  it("does not retain duplicate ranges when appending the active range", () => {
    const base = createGridSelectionState({ x: 1, y: 1 });
    const range = { start: { x: 2, y: 2 }, end: { x: 4, y: 3 } };
    const selected = selectGridRange(base, range, { append: true });
    const repeated = selectGridRange(selected, range, { append: true });

    expect(getGridSelectionRanges(repeated)).toEqual([
      { start: { x: 1, y: 1 }, end: { x: 1, y: 1 } },
      range,
    ]);
  });

  it("derives freeform view state from the static selection", () => {
    const view = getStaticGridViewState({
      state: {
        mode: "navigate",
        selection: {
          mode: "range",
          activeCell: { x: 4, y: 2 },
          anchorCell: { x: 2, y: 2 },
          primaryRange: { start: { x: 2, y: 2 }, end: { x: 4, y: 2 } },
          additionalRanges: [],
        },
      },
    });

    expect(view.interaction).toMatchObject({
      kind: "range",
      activeCell: { x: 4, y: 2 },
    });
    expect(view.target.areas).toEqual([
      { start: { x: 2, y: 2 }, end: { x: 4, y: 2 } },
    ]);
    if (view.interaction.kind !== "range") throw new Error("Expected range interaction");
    expect(view.interaction.geometry.bounds).toEqual({
      start: { x: 2, y: 2 },
      end: { x: 4, y: 2 },
    });
  });

  it("derives navigation from the canonical state", () => {
    const view = getStaticGridViewState({
      state: {
        mode: "navigate",
        selection: createGridSelectionState({ x: 4, y: 2 }),
      },
    });

    expect(view.interaction).toEqual({
      kind: "navigate",
      activeCell: { x: 4, y: 2 },
    });
    expect(view.target.areas).toEqual([
      { start: { x: 4, y: 2 }, end: { x: 4, y: 2 } },
    ]);
  });

  it("derives a collapsed target from the canonical text-edit session", () => {
    const view = getStaticGridViewState({
      state: {
        mode: "text-edit",
        session: createStaticGridInputSession({ origin: { x: 3, y: 2 } }),
      },
    });

    expect(view.interaction).toEqual({
      kind: "text-edit",
      activeCell: { x: 3, y: 2 },
      cursor: { x: 3, y: 2 },
    });
    expect(view.target.areas).toEqual([
      { start: { x: 3, y: 2 }, end: { x: 3, y: 2 } },
    ]);
  });

  it("keeps an explicit single-cell range distinct from navigation", () => {
    const view = getStaticGridViewState({
      state: {
        mode: "navigate",
        selection: {
          mode: "range",
          activeCell: { x: 3, y: 4 },
          anchorCell: { x: 3, y: 4 },
          primaryRange: { start: { x: 3, y: 4 }, end: { x: 3, y: 4 } },
          additionalRanges: [],
        },
      },
    });

    expect(view.interaction.kind).toBe("range");
    expect(view.target.areas).toEqual([
      { start: { x: 3, y: 4 }, end: { x: 3, y: 4 } },
    ]);
  });

  it("derives effective bounds from negative sparse content and selection", () => {
    const grid = new GridSnapshotSource([
      ["-4,3", { char: "A", color: "#fff" }],
      ["2,-2", { char: "B", color: "#fff" }],
    ]);

    expect(
      getEffectiveGridBounds({
        grid,
        activeCell: { x: 0, y: 0 },
        ranges: [{ start: { x: 7, y: 1 }, end: { x: 8, y: 2 } }],
      })
    ).toEqual({ start: { x: -4, y: -2 }, end: { x: 8, y: 3 } });
  });

  it("finds a four-way connected content region", () => {
    const cell = { char: "X", color: "#fff" };
    const grid = new GridSnapshotSource([
      ["1,1", cell],
      ["2,1", cell],
      ["2,2", cell],
      ["3,3", cell],
    ]);

    expect(getConnectedGridRange(grid, { x: 1, y: 1 })).toEqual({
      start: { x: 1, y: 1 },
      end: { x: 2, y: 2 },
    });
  });

  it("connects neighbors through a wide character's follower column", () => {
    const grid = new GridSnapshotSource([
      ["0,0", { char: "你", color: "#fff" }],
      ["2,0", { char: "A", color: "#fff" }],
    ]);

    expect(getConnectedGridRange(grid, { x: 1, y: 0 })).toEqual({
      start: { x: 0, y: 0 },
      end: { x: 2, y: 0 },
    });
  });

  it("moves to edges and creates bounded whole-row and whole-column ranges", () => {
    const state = createGridSelectionState({ x: 3, y: 4 });
    const bounds = { start: { x: -2, y: -1 }, end: { x: 8, y: 9 } };

    expect(moveGridAddressToEdge(state.activeCell, "left", bounds)).toEqual({ x: -2, y: 4 });
    expect(getGridSelectionRanges(selectGridRow(state, bounds))).toEqual([
      { start: { x: -2, y: 4 }, end: { x: 8, y: 4 } },
    ]);
    expect(getGridSelectionRanges(selectGridColumn(state, bounds))).toEqual([
      { start: { x: 3, y: -1 }, end: { x: 3, y: 9 } },
    ]);
  });

  it("moves across visible content runs and skips whitespace-only cells", () => {
    const grid = new GridSnapshotSource([
      ["1,1", { char: "A", color: "#fff" }],
      ["2,1", { char: "B", color: "#fff" }],
      ["4,1", { char: " ", color: "#fff", bgColor: "#333" }],
      ["5,1", { char: "C", color: "#fff" }],
    ]);

    expect(
      moveGridAddressToContentBoundary({
        grid,
        address: { x: 1, y: 1 },
        edge: "right",
      })
    ).toEqual({ x: 2, y: 1 });
    expect(
      moveGridAddressToContentBoundary({
        grid,
        address: { x: 2, y: 1 },
        edge: "right",
      })
    ).toEqual({ x: 5, y: 1 });
    expect(
      moveGridAddressToContentBoundary({
        grid,
        address: { x: 5, y: 1 },
        edge: "left",
      })
    ).toEqual({ x: 2, y: 1 });
  });

  it("uses fixed boundaries when no content exists in the direction", () => {
    const grid = new GridSnapshotSource([["2,2", { char: "A", color: "#fff" }]]);

    expect(
      moveGridAddressToContentBoundary({
        grid,
        address: { x: 2, y: 2 },
        edge: "bottom",
        fixedBounds: { start: { x: 0, y: 0 }, end: { x: 9, y: 7 } },
      })
    ).toEqual({ x: 2, y: 7 });
  });

  it("moves through vertical content runs in both directions", () => {
    const grid = new GridSnapshotSource([
      ["3,-2", { char: "A", color: "#fff" }],
      ["3,-1", { char: "B", color: "#fff" }],
      ["3,4", { char: "C", color: "#fff" }],
    ]);

    expect(
      moveGridAddressToContentBoundary({
        grid,
        address: { x: 3, y: -2 },
        edge: "bottom",
      })
    ).toEqual({ x: 3, y: -1 });
    expect(
      moveGridAddressToContentBoundary({
        grid,
        address: { x: 3, y: -1 },
        edge: "bottom",
      })
    ).toEqual({ x: 3, y: 4 });
    expect(
      moveGridAddressToContentBoundary({
        grid,
        address: { x: 3, y: 4 },
        edge: "top",
      })
    ).toEqual({ x: 3, y: -1 });
  });

  it("treats both visual columns of a wide character as one content cell", () => {
    const grid = new GridSnapshotSource([
      ["0,0", { char: "A", color: "#fff" }],
      ["1,0", { char: "你", color: "#fff" }],
      ["3,0", { char: "B", color: "#fff" }],
    ]);

    expect(
      moveGridAddressToContentBoundary({
        grid,
        address: { x: 0, y: 0 },
        edge: "right",
      })
    ).toEqual({ x: 3, y: 0 });
    expect(
      moveGridAddressToContentBoundary({
        grid,
        address: { x: 1, y: 0 },
        edge: "right",
      })
    ).toEqual({ x: 3, y: 0 });
    expect(
      moveGridAddressToContentBoundary({
        grid,
        address: { x: 3, y: 0 },
        edge: "left",
      })
    ).toEqual({ x: 0, y: 0 });
  });

  it("expands a wide-cell selection per row without widening unrelated rows", () => {
    const grid = new GridSnapshotSource([
      ["1,0", { char: "你", color: "#fff" }],
      ["1,1", { char: "A", color: "#fff" }],
    ]);
    const view = getStaticGridViewState({
      state: {
        mode: "navigate",
        selection: {
          mode: "range",
          activeCell: { x: 2, y: 1 },
          anchorCell: { x: 2, y: 0 },
          primaryRange: { start: { x: 2, y: 0 }, end: { x: 2, y: 1 } },
          additionalRanges: [],
        },
      },
      grid,
    });

    expect(view.interaction).toMatchObject({
      kind: "range",
      activeCell: { x: 2, y: 1 },
    });
    expect(view.target.areas).toEqual([
      { start: { x: 1, y: 0 }, end: { x: 2, y: 0 } },
      { start: { x: 2, y: 1 }, end: { x: 2, y: 1 } },
    ]);
    if (view.interaction.kind !== "range") throw new Error("Expected range interaction");
    expect(view.interaction.geometry.bounds).toEqual({
      start: { x: 1, y: 0 },
      end: { x: 2, y: 1 },
    });
  });

  it("unions overlapping and adjacent ranges into one contour", () => {
    const geometry = getGridSelectionGeometry([
      { start: { x: 0, y: 0 }, end: { x: 2, y: 1 } },
      { start: { x: 2, y: 0 }, end: { x: 4, y: 1 } },
      { start: { x: 5, y: 0 }, end: { x: 5, y: 1 } },
    ]);

    expect(geometry.polygons).toHaveLength(1);
    expect(geometry.bounds).toEqual({
      start: { x: 0, y: 0 },
      end: { x: 5, y: 1 },
    });
  });

  it("keeps disjoint ranges as separate polygons and normalizes negative bounds", () => {
    const geometry = getGridSelectionGeometry([
      { start: { x: -1, y: -2 }, end: { x: -3, y: -4 } },
      { start: { x: 2, y: 1 }, end: { x: 3, y: 2 } },
    ]);

    expect(geometry.polygons).toHaveLength(2);
    expect(geometry.bounds).toEqual({
      start: { x: -3, y: -4 },
      end: { x: 3, y: 2 },
    });
  });

  it("preserves holes in a compound selection outline", () => {
    const geometry = getGridSelectionGeometry([
      { start: { x: 0, y: 0 }, end: { x: 2, y: 0 } },
      { start: { x: 0, y: 2 }, end: { x: 2, y: 2 } },
      { start: { x: 0, y: 1 }, end: { x: 0, y: 1 } },
      { start: { x: 2, y: 1 }, end: { x: 2, y: 1 } },
    ]);

    expect(geometry.polygons).toHaveLength(1);
    expect(geometry.polygons[0].rings).toHaveLength(2);
  });

  it("visits each selected cell span once across overlapping ranges", () => {
    const spans: Array<{ y: number; minX: number; maxX: number }> = [];
    forEachGridSelectionSpan(
      [
        { start: { x: -2, y: 0 }, end: { x: 2, y: 1 } },
        { start: { x: 1, y: 1 }, end: { x: 4, y: 2 } },
      ],
      (span) => spans.push(span)
    );

    expect(spans).toEqual([
      { y: 0, minX: -2, maxX: 2 },
      { y: 1, minX: -2, maxX: 4 },
      { y: 2, minX: 1, maxX: 4 },
    ]);
  });
});
