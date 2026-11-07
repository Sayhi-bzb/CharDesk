import type { GridCell } from '@chardesk/cell-plane/types';
import { isDefaultArtifactForeground } from '@chardesk/cell-plane/artifact-style';
import { getGraphemeCellWidth } from '@chardesk/protocol';

export type MinimapColor = Readonly<{ kind: 'foreground' } | { kind: 'literal'; value: string }>;
const foreground: MinimapColor = Object.freeze({ kind: 'foreground' });

export type MinimapRegion = Readonly<{ y: number; height: number; color: MinimapColor }>;

/** Fractional cell coverage preserves both colors of half-block artwork. */
export function describeMinimapCell(cell: Pick<GridCell, 'char' | 'color' | 'bgColor'>) {
  const width = Math.max(1, getGraphemeCellWidth(cell.char));
  const ink: MinimapColor = isDefaultArtifactForeground(cell)
    ? foreground
    : { kind: 'literal', value: cell.color };
  const background: MinimapColor | null =
    cell.bgColor && cell.bgColor !== 'transparent'
      ? { kind: 'literal', value: cell.bgColor }
      : null;
  const regions: MinimapRegion[] = [];
  const paint = (y: number, height: number, color: MinimapColor | null) => {
    if (color) regions.push({ y, height, color });
  };
  if (cell.char === '▀' || cell.char === '▄') {
    paint(0, 0.5, cell.char === '▀' ? ink : background);
    paint(0.5, 0.5, cell.char === '▄' ? ink : background);
  } else {
    paint(
      0,
      1,
      cell.char === '█' ? ink : (background ?? (cell.char && cell.char !== ' ' ? ink : null))
    );
  }
  return { width, regions };
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
