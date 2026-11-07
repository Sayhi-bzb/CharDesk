import type { GridCell } from '@chardesk/cell-plane/types';
import { isDefaultArtifactForeground } from '@chardesk/cell-plane/artifact-style';
import { getGraphemeCellWidth } from '@chardesk/protocol';

export type MinimapColor = Readonly<{ kind: 'foreground' } | { kind: 'literal'; value: string }>;
const foreground: MinimapColor = Object.freeze({ kind: 'foreground' });

/** Occupancy and color semantics are independent of pixels, terminal cells and Host themes. */
export function describeMinimapCell(cell: Pick<GridCell, 'char' | 'color' | 'bgColor'>) {
  const width = Math.max(1, getGraphemeCellWidth(cell.char));
  let color: MinimapColor | null = null;
  if (cell.bgColor && cell.bgColor !== 'transparent')
    color = { kind: 'literal', value: cell.bgColor };
  else if (cell.char && cell.char !== ' ')
    color = isDefaultArtifactForeground(cell) ? foreground : { kind: 'literal', value: cell.color };
  return { width, color };
}

export const resolveMinimapColor = (color: MinimapColor, defaultForeground: string) =>
  color.kind === 'foreground' ? defaultForeground : color.value;

/** Stable tie keys also merge a known default foreground with an identical authored RGB. */
export function minimapColorKey(color: MinimapColor, defaultForeground?: string | null) {
  const value = color.kind === 'foreground' ? defaultForeground : color.value;
  if (!value) return 'foreground';
  const lower = value.toLowerCase();
  return `color:${/^#[\da-f]{3}$/.test(lower) ? '#' + [...lower.slice(1)].map((c) => c + c).join('') : lower}`;
}
