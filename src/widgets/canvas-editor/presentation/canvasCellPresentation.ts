import type {
  CharDeskCellCursorShape,
  CharDeskCellRangeGeometry,
  CharDeskCellRangePhase,
} from "@chardesk/rendering";
import type { StaticGridRangeMovePlan } from "@/domains/canvas/public";
import type { CanvasMode } from "@/domains/sessions/public";
import type {
  GridEditMode,
  GridRange,
  GridSelectionGeometry,
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
  canvasMode: CanvasMode;
  source: GridCellSource;
  selectionRanges: readonly GridRange[];
  selectionGeometry: GridSelectionGeometry;
  draggingSelection: SelectionArea | null;
  movePreview: StaticGridRangeMovePlan | null;
}>): CanvasRangeVisualIntent | null => {
  if (input.canvasMode !== "structured" && input.movePreview) {
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
        input.canvasMode === "structured"
          ? [draggingRange]
          : [...input.selectionRanges, draggingRange],
        input.canvasMode === "structured" ? undefined : input.source
      ),
      phase: "selecting",
    };
  }

  if (
    input.canvasMode !== "structured" &&
    input.selectionGeometry.polygons.length > 0
  ) {
    return {
      kind: "range",
      geometry: input.selectionGeometry,
      phase: "resting",
    };
  }
  return null;
};

export const resolveCanvasCellPresentation = (input: Readonly<{
  viewActive: boolean;
  inputFocused: boolean;
  canvasMode: CanvasMode;
  range: CanvasRangeVisualIntent | null;
  staticGrid: Readonly<{
    editMode: GridEditMode;
    activeCell: Point;
    textCursor: Point | null;
  }>;
  structured: Readonly<{
    gridFocus: Point | null;
    editingText: boolean;
    hasNodeSelection: boolean;
  }>;
  cursorPreference: Readonly<{
    shape: CharDeskCellCursorShape;
    blink: boolean;
  }>;
}>): CanvasCellPresentation => {
  if (!input.viewActive) return { visual: null };
  if (input.range) return { visual: input.range };

  if (input.canvasMode === "structured") {
    const { gridFocus, editingText, hasNodeSelection } = input.structured;
    return {
      visual:
        gridFocus && !editingText && !hasNodeSelection
          ? { kind: "navigation-focus", point: gridFocus }
          : null,
    };
  }
  const editing = input.staticGrid.editMode === "text-edit";
  return {
    visual: {
      kind: "terminal-cursor",
      point:
        editing && input.staticGrid.textCursor
          ? input.staticGrid.textCursor
          : input.staticGrid.activeCell,
      shape: input.cursorPreference.shape,
      blink: editing && input.inputFocused && input.cursorPreference.blink,
    },
  };
};
