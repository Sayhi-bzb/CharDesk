import { describe, expect, it } from "vitest";
import { createStaticGridRangeMovePlan } from "@/domains/canvas/public";
import {
  createGridSelectionState,
  getGridSelectionGeometry,
  getStaticGridViewState,
  type GridRange,
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

const navigateView = () => getStaticGridViewState({
  selection: createGridSelectionState({ x: 1, y: 2 }),
  editMode: "navigate",
  textCursor: null,
});

const rangeView = (ranges: readonly GridRange[]) => {
  const primaryRange = ranges[ranges.length - 1]!;
  return getStaticGridViewState({
    selection: {
      mode: "range",
      activeCell: primaryRange.end,
      anchorCell: primaryRange.start,
      primaryRange,
      additionalRanges: ranges.slice(0, -1),
    },
    editMode: "navigate",
    textCursor: null,
  });
};

const resolve = (
  overrides: Partial<Parameters<typeof resolveCanvasCellPresentation>[0]> = {}
) => resolveCanvasCellPresentation({
  viewActive: true,
  inputFocused: true,
  range: null,
  staticGrid: {
    kind: "navigate",
    activeCell: { x: 1, y: 2 },
  },
  cursorPreference: { shape: "block", blink: true },
  ...overrides,
});

const resolveRange = (
  overrides: Partial<Parameters<typeof resolveCanvasRangePresentation>[0]> = {}
) => resolveCanvasRangePresentation({
  source: new GridSnapshotSource(),
  staticGrid: navigateView(),
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
        kind: "text-edit",
        activeCell: { x: 1, y: 2 },
        cursor: { x: 4, y: 5 },
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
        kind: "text-edit",
        activeCell: { x: 1, y: 2 },
        cursor: { x: 2, y: 3 },
      },
    }).visual).toMatchObject({ blink: false });
  });

  it("makes Range the exclusive primary Cell visual", () => {
    const visual = range("moving");
    expect(resolve({ range: visual })).toEqual({ visual });
    expect(resolve({ viewActive: false, range: visual })).toEqual({ visual: null });
  });

});

describe("Canvas Range presentation", () => {
  it("does not infer a Range from the navigate target", () => {
    const view = navigateView();
    expect(view.target.areas).toHaveLength(1);
    expect(resolveRange({ staticGrid: view })).toBeNull();
  });

  it("maps committed selection to a resting Range", () => {
    expect(resolveRange({
      staticGrid: rangeView([
        { start: { x: 1, y: 2 }, end: { x: 3, y: 2 } },
      ]),
    })).toEqual(range("resting"));
  });

  it("merges the active drag with committed static ranges", () => {
    const result = resolveRange({
      staticGrid: rangeView([
        { start: { x: 1, y: 2 }, end: { x: 2, y: 2 } },
      ]),
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
      staticGrid: rangeView([
        { start: { x: 1, y: 2 }, end: { x: 3, y: 2 } },
      ]),
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
  });
});
