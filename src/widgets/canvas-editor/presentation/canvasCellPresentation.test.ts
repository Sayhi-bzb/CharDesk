import { describe, expect, it } from "vitest";
import { createStaticGridRangeMovePlan } from "@/domains/canvas/public";
import {
  getGridSelectionGeometry,
  type GridSelectionGeometry,
} from "@/domains/selection/public";
import { GridSnapshotSource } from "@/shared/utils/grid-source";
import {
  resolveCanvasCellPresentation,
  resolveCanvasRangePresentation,
  type CanvasRangeVisualIntent,
} from "./canvasCellPresentation";

const geometry = getGridSelectionGeometry([
  { start: { x: 1, y: 2 }, end: { x: 3, y: 2 } },
]);

const range = (
  phase: CanvasRangeVisualIntent["phase"] = "resting",
  rangeGeometry: GridSelectionGeometry = geometry
): CanvasRangeVisualIntent => ({
  kind: "range",
  geometry: rangeGeometry,
  phase,
});

const resolve = (
  overrides: Partial<Parameters<typeof resolveCanvasCellPresentation>[0]> = {}
) => resolveCanvasCellPresentation({
  viewActive: true,
  inputFocused: true,
  canvasMode: "freeform",
  range: null,
  staticGrid: {
    editMode: "navigate",
    activeCell: { x: 1, y: 2 },
    textCursor: null,
  },
  structured: {
    gridFocus: null,
    editingText: false,
    hasNodeSelection: false,
  },
  cursorPreference: { shape: "block", blink: true },
  ...overrides,
});

const resolveRange = (
  overrides: Partial<Parameters<typeof resolveCanvasRangePresentation>[0]> = {}
) => resolveCanvasRangePresentation({
  canvasMode: "freeform",
  source: new GridSnapshotSource(),
  selectionRanges: [],
  selectionGeometry: getGridSelectionGeometry([]),
  draggingSelection: null,
  movePreview: null,
  ...overrides,
});

describe("Canvas Cell presentation", () => {
  it("uses one configured Cursor for navigate and text edit", () => {
    expect(resolve()).toEqual({
      visual: {
        kind: "terminal-cursor",
        point: { x: 1, y: 2 },
        shape: "block",
        blink: false,
      },
    });
    expect(resolve({
      staticGrid: {
        editMode: "text-edit",
        activeCell: { x: 1, y: 2 },
        textCursor: { x: 4, y: 5 },
      },
      cursorPreference: { shape: "underline", blink: true },
    }).visual).toEqual({
      kind: "terminal-cursor",
      point: { x: 4, y: 5 },
      shape: "underline",
      blink: true,
    });
  });

  it("keeps an unfocused active view visible but stops blinking", () => {
    expect(resolve({
      inputFocused: false,
      staticGrid: {
        editMode: "text-edit",
        activeCell: { x: 1, y: 2 },
        textCursor: { x: 2, y: 3 },
      },
    }).visual).toMatchObject({ blink: false });
  });

  it("makes Range the exclusive primary Cell visual", () => {
    const visual = range("moving");
    expect(resolve({ range: visual })).toEqual({ visual });
    expect(resolve({ viewActive: false, range: visual })).toEqual({ visual: null });
  });

  it("keeps structured navigation focus semantically distinct", () => {
    const structured = {
      gridFocus: { x: 6, y: 7 },
      editingText: false,
      hasNodeSelection: false,
    };
    expect(resolve({ canvasMode: "structured", structured })).toEqual({
      visual: {
        kind: "navigation-focus",
        point: { x: 6, y: 7 },
      },
    });

    for (const suppressed of [
      { ...structured, editingText: true },
      { ...structured, hasNodeSelection: true },
    ]) {
      expect(resolve({ canvasMode: "structured", structured: suppressed }))
        .toEqual({ visual: null });
    }
  });
});

describe("Canvas Range presentation", () => {
  it("maps committed selection to a resting Range", () => {
    expect(resolveRange({
      selectionRanges: [{ start: { x: 1, y: 2 }, end: { x: 3, y: 2 } }],
      selectionGeometry: geometry,
    })).toEqual(range("resting"));
  });

  it("merges the active drag with committed static ranges", () => {
    const result = resolveRange({
      selectionRanges: [{ start: { x: 1, y: 2 }, end: { x: 2, y: 2 } }],
      selectionGeometry: geometry,
      draggingSelection: {
        start: { x: 3, y: 2 },
        end: { x: 4, y: 2 },
      },
    });

    expect(result?.phase).toBe("selecting");
    expect(result?.geometry.polygons).toEqual(
      getGridSelectionGeometry([
        { start: { x: 1, y: 2 }, end: { x: 2, y: 2 } },
        { start: { x: 3, y: 2 }, end: { x: 4, y: 2 } },
      ]).polygons
    );
  });

  it("keeps structured drag independent from stale static selection", () => {
    const result = resolveRange({
      canvasMode: "structured",
      selectionRanges: [{ start: { x: 1, y: 2 }, end: { x: 3, y: 2 } }],
      selectionGeometry: geometry,
      draggingSelection: {
        start: { x: 7, y: 8 },
        end: { x: 8, y: 9 },
      },
    });

    expect(result).toEqual(range(
      "selecting",
      getGridSelectionGeometry([
        { start: { x: 7, y: 8 }, end: { x: 8, y: 9 } },
      ])
    ));
    expect(resolveRange({
      canvasMode: "structured",
      selectionRanges: [{ start: { x: 1, y: 2 }, end: { x: 3, y: 2 } }],
      selectionGeometry: geometry,
    })).toBeNull();
  });

  it("gives a transactional move preview highest priority", () => {
    const source = new GridSnapshotSource([
      ["1,2", { char: "A", color: "#fff" }],
    ]);
    const movePreview = createStaticGridRangeMovePlan({
      source,
      range: { start: { x: 1, y: 2 }, end: { x: 1, y: 2 } },
      requestedDelta: { x: 4, y: 3 },
    });
    expect(movePreview).not.toBeNull();

    const result = resolveRange({
      source,
      selectionGeometry: geometry,
      draggingSelection: {
        start: { x: 9, y: 9 },
        end: { x: 10, y: 10 },
      },
      movePreview,
    });
    expect(result?.phase).toBe("moving");
    expect(result?.geometry.polygons).toEqual(
      getGridSelectionGeometry(
        [movePreview!.targetRange],
        movePreview!.previewSource
      ).polygons
    );
    expect(resolveRange({
      canvasMode: "structured",
      source,
      movePreview,
    })).toBeNull();
  });
});
