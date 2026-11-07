import type {
  CharDeskCellCursorShape,
  CharDeskCellRangeGeometry,
  CharDeskCellRangePhase,
} from '@chardesk/rendering';
import type { StaticGridRangeMovePlan } from '@/domains/canvas/public';
import type {
  StaticGridInteraction,
  StaticGridViewState,
  GridSelectionDragPreview,
} from '@/domains/selection/public';
import {
  getGridSelectionCoverageGeometry,
  resolveGridSelectionPresentation,
  gridRangeFromSelectionArea,
} from '@/domains/selection/public';
import type { GridCellSource, Point } from '@/shared/types';

export type CanvasCellIndicator =
  | Readonly<{
      kind: 'terminal-cursor';
      point: Point;
      shape: CharDeskCellCursorShape;
      blink: boolean;
    }>
  | Readonly<{
      kind: 'navigation-focus';
      point: Point;
    }>;

export type CanvasRangeVisualIntent = Readonly<{
  kind: 'range';
  geometry: CharDeskCellRangeGeometry;
  phase: CharDeskCellRangePhase;
}>;

type CanvasCellVisualIntent = CanvasCellIndicator | CanvasRangeVisualIntent;

type CanvasCellPresentation = Readonly<{
  visual: CanvasCellVisualIntent | null;
}>;

export const resolveCanvasRangePresentation = (
  input: Readonly<{
    source: GridCellSource;
    staticGrid: StaticGridViewState;
    draggingSelection: GridSelectionDragPreview | null;
    movePreview: StaticGridRangeMovePlan | null;
  }>
): CanvasRangeVisualIntent | null => {
  const committedRange =
    input.staticGrid.interaction.kind === 'range' ? input.staticGrid.interaction : null;
  if (!committedRange && !input.draggingSelection && !input.movePreview) return null;
  const presentation = resolveGridSelectionPresentation({
    source: input.source,
    ranges: committedRange ? input.staticGrid.target.ranges : [],
    draggingRange: input.draggingSelection
      ? {
          ...gridRangeFromSelectionArea(input.draggingSelection),
          append: input.draggingSelection.append,
        }
      : null,
    movePreview: input.movePreview,
  });
  return {
    kind: 'range',
    geometry: getGridSelectionCoverageGeometry(presentation.coverage),
    phase: presentation.phase,
  };
};

export const resolveCanvasCellPresentation = (
  input: Readonly<{
    viewActive: boolean;
    inputFocused: boolean;
    range: CanvasRangeVisualIntent | null;
    staticGrid: StaticGridInteraction;
    cursorPreference: Readonly<{
      shape: CharDeskCellCursorShape;
      blink: boolean;
    }>;
  }>
): CanvasCellPresentation => {
  if (!input.viewActive) return { visual: null };
  if (input.range) return { visual: input.range };

  const editing = input.staticGrid.kind === 'text-edit';
  return {
    visual: {
      kind: 'terminal-cursor',
      point: editing ? input.staticGrid.cursor : input.staticGrid.activeCell,
      shape: input.cursorPreference.shape,
      blink: editing && input.inputFocused && input.cursorPreference.blink,
    },
  };
};
