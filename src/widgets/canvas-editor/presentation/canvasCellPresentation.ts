import type {
  CharDeskCellCursorShape,
  CharDeskCellRangeGeometry,
  CharDeskCellRangePhase,
} from "@chardesk/rendering";
import type { StaticGridRangeMovePlan } from "@/domains/canvas/public";
import type {
  StaticGridInteraction,
  StaticGridViewState,
} from "@/domains/selection/public";
import {
  getGridSelectionGeometry,
  gridRangeFromSelectionArea,
} from "@/domains/selection/public";
import type { GridCellSource, Point, SelectionArea } from "@/shared/types";

export type CanvasCellIndicator =
  | Readonly<{
      kind: "terminal-cursor";
      point: Point;
      shape: CharDeskCellCursorShape;
      blink: boolean;
    }>
  | Readonly<{
      kind: "navigation-focus";
      point: Point;
    }>;

export type CanvasRangeVisualIntent = Readonly<{
  kind: "range";
  geometry: CharDeskCellRangeGeometry;
  phase: CharDeskCellRangePhase;
}>;

export type CanvasCellVisualIntent =
  | CanvasCellIndicator
  | CanvasRangeVisualIntent;

export type CanvasCellPresentation = Readonly<{
  visual: CanvasCellVisualIntent | null;
}>;

export const resolveCanvasRangePresentation = (input: Readonly<{
  source: GridCellSource;
  staticGrid: StaticGridViewState;
  draggingSelection: SelectionArea | null;
  movePreview: StaticGridRangeMovePlan | null;
}>): CanvasRangeVisualIntent | null => {
  const committedRange = input.staticGrid.interaction.kind === "range"
    ? input.staticGrid.interaction
    : null;
  if (input.movePreview) {
    return {
      kind: "range",
      geometry: getGridSelectionGeometry(
        [input.movePreview.targetRange],
        input.movePreview.previewSource
      ),
      phase: "moving",
    };
  }

  if (input.draggingSelection) {
    const draggingRange = gridRangeFromSelectionArea(input.draggingSelection);
    return {
      kind: "range",
      geometry: getGridSelectionGeometry(
        [
          ...(committedRange ? input.staticGrid.target.ranges : []),
          draggingRange,
        ],
        input.source
      ),
      phase: "selecting",
    };
  }

  if (committedRange) {
    return {
      kind: "range",
      geometry: committedRange.geometry,
      phase: "resting",
    };
  }
  return null;
};

export const resolveCanvasCellPresentation = (input: Readonly<{
  viewActive: boolean;
  inputFocused: boolean;
  range: CanvasRangeVisualIntent | null;
  staticGrid: StaticGridInteraction;
  cursorPreference: Readonly<{
    shape: CharDeskCellCursorShape;
    blink: boolean;
  }>;
}>): CanvasCellPresentation => {
  if (!input.viewActive) return { visual: null };
  if (input.range) return { visual: input.range };

  const editing = input.staticGrid.kind === "text-edit";
  return {
    visual: {
      kind: "terminal-cursor",
      point: editing ? input.staticGrid.cursor : input.staticGrid.activeCell,
      shape: input.cursorPreference.shape,
      blink: editing && input.inputFocused && input.cursorPreference.blink,
    },
  };
};
