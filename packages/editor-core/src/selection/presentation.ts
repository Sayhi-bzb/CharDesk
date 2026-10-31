import type { GridCellSource } from '@chardesk/cell-plane/types';
import type { StaticGridRangeMovePlan } from '../rangeMove.js';
import type { GridRange } from './grid-types.js';
import { resolveGridSelectionCoverage, type GridSelectionCoverage } from './coverage.js';

export interface GridSelectionPresentation {
  readonly phase: 'resting' | 'selecting' | 'moving';
  readonly coverage: GridSelectionCoverage;
}

export type GridSelectionDragPreview = GridRange & { append?: boolean };

/** Hosts render this result; they do not reinterpret gesture rectangles. */
export const resolveGridSelectionPresentation = (input: {
  source: GridCellSource;
  ranges: readonly GridRange[];
  draggingRange?: GridSelectionDragPreview | null;
  movePreview?: StaticGridRangeMovePlan | null;
}): GridSelectionPresentation => {
  if (input.movePreview) return { phase: 'moving', coverage: input.movePreview.targetCoverage };
  return {
    phase: input.draggingRange ? 'selecting' : 'resting',
    coverage: resolveGridSelectionCoverage(
      input.draggingRange
        ? [...(input.draggingRange.append ? input.ranges : []), input.draggingRange]
        : input.ranges,
      input.source
    ),
  };
};
