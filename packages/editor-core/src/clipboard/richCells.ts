import { getGraphemeCellWidth } from '@chardesk/protocol';
import type { RichTextCell } from '../textCommandTypes.js';

/** Legacy clipboard cells may include a blank follower for a two-column glyph. */
export function filterRichPasteCells(cells: readonly RichTextCell[]): RichTextCell[] {
  const byPoint = new Map(cells.map((cell) => [`${cell.x},${cell.y}`, cell]));
  return cells.filter((cell) => {
    if (cell.char !== ' ') return true;
    const left = byPoint.get(`${cell.x - 1},${cell.y}`);
    return !left || getGraphemeCellWidth(left.char) !== 2;
  });
}
