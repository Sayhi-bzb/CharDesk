import { afterEach, describe, expect, it } from "vitest";
import { TestCanvasContentSurface } from "@/domains/canvas/testing";
import { applyFreeformSnapshotToYMaps, setCanvasTestState, useEditorStore } from "@/domains/canvas/testing";
import {
  createGridSelectionState,
  selectGridRange,
} from "@/domains/selection/public";
import type { Point } from "@/shared/types";
import { DEFAULT_SESSION_ID } from "@/domains/canvas/state/helpers/storeUtils";

const initialState = useEditorStore.getState();

const createRangeSelection = (start: Point, end: Point) =>
  selectGridRange(
    createGridSelectionState(start),
    { start, end },
    { activeCell: "start" }
  );

const resetStore = () => {
  useEditorStore.setState(
    {
      ...initialState,
      contentSurface: new TestCanvasContentSurface(),
      canvasSessions: initialState.canvasSessions.map((session) =>
        session.id === DEFAULT_SESSION_ID ? { ...session, grid: [] } : session
      ),
    },
    true
  );
  applyFreeformSnapshotToYMaps([]);
};

describe("selectionSlice setSelectionTextAttributes", () => {
  afterEach(() => {
    resetStore();
  });

  it("keeps the old primary range only when a new range is appended", () => {
    useEditorStore.getState().setStaticGridActiveCell({ x: 1, y: 1 });

    useEditorStore.getState().appendStaticGridSelectionRange({
      start: { x: 4, y: 3 },
      end: { x: 2, y: 2 },
    });

    expect(useEditorStore.getState().interaction.staticGridSelection).toEqual({
      mode: "range",
      activeCell: { x: 4, y: 3 },
      anchorCell: { x: 4, y: 3 },
      primaryRange: { start: { x: 2, y: 2 }, end: { x: 4, y: 3 } },
      additionalRanges: [
        { start: { x: 1, y: 1 }, end: { x: 1, y: 1 } },
      ],
    });
  });

  it("adds attributes to existing selected cells only", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 2, y: 0 }),
    });
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "A", color: "#ffffff" }],
      ["2,0", { char: "B", color: "#ffffff", bgColor: "#111111" }],
    ]);

    useEditorStore.getState().setSelectionTextAttributes({ bold: true });

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(
      new Map([
        ["0,0", { char: "A", color: "#ffffff", attrs: { bold: true } }],
        [
          "2,0",
          {
            char: "B",
            color: "#ffffff",
            bgColor: "#111111",
            attrs: { bold: true },
          },
        ],
      ])
    );
  });

  it("materializes blank selected cells for underline using the brush color", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      brushColor: "#2563eb",
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 1, y: 0 }),
    });
    applyFreeformSnapshotToYMaps([]);

    useEditorStore.getState().setSelectionTextAttributes({ underline: true });

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(
      new Map([
        ["0,0", { char: " ", color: "#2563eb", attrs: { underline: true } }],
        ["1,0", { char: " ", color: "#2563eb", attrs: { underline: true } }],
      ])
    );
  });

  it("materializes blank selected cells for strike using the brush color", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      brushColor: "#ef4444",
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 0, y: 0 }),
    });
    applyFreeformSnapshotToYMaps([]);

    useEditorStore.getState().setSelectionTextAttributes({ strike: true });

    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")).toEqual({
      char: " ",
      color: "#ef4444",
      attrs: { strike: true },
    });
  });

  it("materializes blank selected cells for inverse without rewriting colors", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      brushColor: "#22c55e",
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 0, y: 0 }),
    });
    applyFreeformSnapshotToYMaps([]);

    useEditorStore.getState().setSelectionTextAttributes({ inverse: true });

    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")).toEqual({
      char: " ",
      color: "#22c55e",
      attrs: { inverse: true },
    });
  });

  it("does not materialize blank selected cells for bold or italic only", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 1, y: 0 }),
    });
    applyFreeformSnapshotToYMaps([]);

    useEditorStore
      .getState()
      .setSelectionTextAttributes({ bold: true, italic: true });

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(new Map());
  });

  it("removes only toggled attributes and preserves other styling", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 0, y: 0 }),
    });
    applyFreeformSnapshotToYMaps([
      [
        "0,0",
        {
          char: "A",
          color: "#ffffff",
          bgColor: "#111111",
          attrs: { bold: true, italic: true, strike: true, inverse: true },
        },
      ],
    ]);

    useEditorStore.getState().setSelectionTextAttributes({ bold: false });

    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")).toEqual({
      char: "A",
      color: "#ffffff",
      bgColor: "#111111",
      attrs: { italic: true, strike: true, inverse: true },
    });
  });

  it("removes attrs when no text attributes remain", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 0, y: 0 }),
    });
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "A", color: "#ffffff", attrs: { underline: true } }],
    ]);

    useEditorStore.getState().setSelectionTextAttributes({ underline: false });

    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")).toEqual({
      char: "A",
      color: "#ffffff",
    });
  });

  it("deletes materialized blank cells when underline is removed", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 0, y: 0 }),
    });
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: " ", color: "#ffffff", attrs: { underline: true } }],
    ]);

    useEditorStore.getState().setSelectionTextAttributes({ underline: false });

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(new Map());
  });

  it("does not update cells in structured mode", () => {
    setCanvasTestState({
      canvasMode: "structured",
      contentSurface: new TestCanvasContentSurface([["0,0", { char: "A", color: "#ffffff" }]]),
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 0, y: 0 }),
    });

    useEditorStore.getState().setSelectionTextAttributes({ bold: true });

    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")).toEqual({
      char: "A",
      color: "#ffffff",
    });
  });
});


describe("selectionSlice static grid selection compatibility", () => {
  afterEach(() => {
    resetStore();
  });

  it("fills cells from static grid ranges", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      brushColor: "#22c55e",
      staticGridSelection: {
        mode: "range",
        activeCell: { x: 2, y: 0 },
        anchorCell: { x: 0, y: 0 },
        primaryRange: { start: { x: 0, y: 0 }, end: { x: 2, y: 0 } },
        additionalRanges: [],
      },
    });
    applyFreeformSnapshotToYMaps([]);

    useEditorStore.getState().fillSelectionsWithChar("X");

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(
      new Map([
        ["0,0", { char: "X", color: "#22c55e" }],
        ["1,0", { char: "X", color: "#22c55e" }],
        ["2,0", { char: "X", color: "#22c55e" }],
      ])
    );
  });

  it("styles and materializes cells from static grid ranges", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      brushColor: "#f8fafc",
      staticGridSelection: {
        mode: "range",
        activeCell: { x: 2, y: 0 },
        anchorCell: { x: 0, y: 0 },
        primaryRange: { start: { x: 0, y: 0 }, end: { x: 2, y: 0 } },
        additionalRanges: [],
      },
    });
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "A", color: "#ffffff" }],
      ["2,0", { char: "B", color: "#ffffff" }],
    ]);

    useEditorStore.getState().setSelectionBackgroundColor("#0f172a");

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(
      new Map([
        ["0,0", { char: "A", color: "#ffffff", bgColor: "#0f172a" }],
        ["1,0", { char: " ", color: "#f8fafc", bgColor: "#0f172a" }],
        ["2,0", { char: "B", color: "#ffffff", bgColor: "#0f172a" }],
      ])
    );
  });

});
describe("selectionSlice setSelectionBackgroundColor", () => {
  afterEach(() => {
    resetStore();
  });

  it("fills background color and materializes empty selected cells", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      brushColor: "#f8fafc",
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 2, y: 0 }),
    });
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: "A", color: "#ffffff" }],
      ["2,0", { char: "B", color: "#ffffff", attrs: { bold: true } }],
    ]);

    useEditorStore.getState().setSelectionBackgroundColor("#2563eb");

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(
      new Map([
        ["0,0", { char: "A", color: "#ffffff", bgColor: "#2563eb" }],
        ["1,0", { char: " ", color: "#f8fafc", bgColor: "#2563eb" }],
        [
          "2,0",
          {
            char: "B",
            color: "#ffffff",
            bgColor: "#2563eb",
            attrs: { bold: true },
          },
        ],
      ])
    );
  });

  it("clears background color while preserving foreground and attributes", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 0, y: 0 }),
    });
    applyFreeformSnapshotToYMaps([
      [
        "0,0",
        {
          char: "A",
          color: "#ffffff",
          bgColor: "#2563eb",
          attrs: { underline: true },
        },
      ],
    ]);

    useEditorStore.getState().setSelectionBackgroundColor(null);

    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")).toEqual({
      char: "A",
      color: "#ffffff",
      attrs: { underline: true },
    });
  });

  it("clears background color without materializing empty selected positions", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 2, y: 0 }),
    });
    applyFreeformSnapshotToYMaps([
      ["1,0", { char: "A", color: "#ffffff", bgColor: "#2563eb" }],
    ]);

    useEditorStore.getState().setSelectionBackgroundColor(null);

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(
      new Map([
        ["1,0", { char: "A", color: "#ffffff" }],
      ])
    );
  });

  it("deletes materialized blank cells when background color is cleared", () => {
    setCanvasTestState({
      canvasMode: "freeform",
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 0, y: 0 }),
    });
    applyFreeformSnapshotToYMaps([
      ["0,0", { char: " ", color: "#ffffff", bgColor: "#2563eb" }],
    ]);

    useEditorStore.getState().setSelectionBackgroundColor(null);

    expect(useEditorStore.getState().contentSurface.reader.materialize()).toEqual(new Map());
  });

  it("does not update background color in structured mode", () => {
    setCanvasTestState({
      canvasMode: "structured",
      contentSurface: new TestCanvasContentSurface([["0,0", { char: "A", color: "#ffffff" }]]),
      staticGridSelection: createRangeSelection({ x: 0, y: 0 }, { x: 0, y: 0 }),
    });

    useEditorStore.getState().setSelectionBackgroundColor("#2563eb");

    expect(useEditorStore.getState().contentSurface.reader.materialize().get("0,0")).toEqual({
      char: "A",
      color: "#ffffff",
    });
  });
});
