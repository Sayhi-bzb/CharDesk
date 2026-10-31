import { getGraphemeCellWidth } from '@chardesk/protocol';
import { createPointGridReader, resolveGridSlot } from '@chardesk/cell-plane/grid-occupancy';
import { writeStyledCell } from '@chardesk/cell-plane/grid-ops';
import { forEachGridSelectionSpan } from './coverage.js';
import type { GridCellSource } from '@chardesk/cell-plane/types';
import type { GridRange } from './grid-types.js';

/** Fill merged selection spans without splitting a grapheme at their right edge. */
export function fillGridSelection(
  grid: Parameters<typeof writeStyledCell>[0],
  reader: GridCellSource,
  ranges: GridRange[],
  char: string,
  color: string,
  options?: { preserveTargetBackground?: boolean }
) {
  const width = getGraphemeCellWidth(char);
  if (!char || width < 1) return;
  forEachGridSelectionSpan(
    ranges,
    ({ y, minX, maxX }) => {
      for (let x = minX; x + width - 1 <= maxX; x += width) {
        const bgColor = options?.preserveTargetBackground
          ? resolveGridSlot(createPointGridReader(grid), { x, y })?.cell.bgColor
          : undefined;
        writeStyledCell(grid, x, y, { char, color, ...(bgColor ? { bgColor } : {}) });
      }
    },
    reader
  );
}
