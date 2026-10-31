import {
  exportSelectionToAnsi,
  exportSelectionToJSON,
  exportSelectionToString,
  exportToAnsi,
} from '@chardesk/cell-plane/text';
import { resolveGridSelectionCoverage, type GridSelectionCoverage } from '../selection/coverage.js';
import { GridManager } from '@chardesk/cell-plane/grid';
import { createGridMapSource } from '@chardesk/cell-plane/grid-source';
import { resolveGridSlot } from '@chardesk/cell-plane/grid-occupancy';
import { cloneTextAttributes } from '@chardesk/cell-plane/ansi';
import type { GridCellSource, GridMap, Point, SelectionArea } from '@chardesk/cell-plane/types';
export interface ClipboardPayload {
  plain: string;
  rich: string | null;
}
export type ClipboardPayloadFormat = 'plain' | 'ansi';
const toAnsiLikeClipboardText = (value: string) => value.replaceAll('\u001b[', '[');
export const hasClipboardSource = (selections: SelectionArea[], textCursor: Point | null) => {
  return selections.length > 0 || !!textCursor;
};

const projectGridSelection = (
  grid: GridCellSource,
  coverage: GridSelectionCoverage,
  brushColor: string
): GridMap => {
  const projection: GridMap = new Map();
  coverage.spans.forEach(({ y, minX, maxX }) => {
    for (let x = minX; x <= maxX; x++) {
      const key = GridManager.toKey(x, y);
      if (resolveGridSlot(grid, { x, y })?.offset === 1) continue;
      projection.set(key, grid.get({ x, y }) ?? { char: ' ', color: brushColor });
    }
  });
  return projection;
};

export const buildClipboardPayload = (
  grid: GridCellSource,
  selections: SelectionArea[],
  textCursor: Point | null,
  brushColor: string,
  format: ClipboardPayloadFormat = 'plain'
): ClipboardPayload | null => {
  if (!hasClipboardSource(selections, textCursor)) return null;

  if (selections.length > 0) {
    const coverage = resolveGridSelectionCoverage(selections, grid);
    const effectiveSelections = [...coverage.areas];
    const projectedGrid = projectGridSelection(grid, coverage, brushColor);
    const projectedSource = createGridMapSource(projectedGrid);
    return {
      plain:
        format === 'ansi'
          ? toAnsiLikeClipboardText(exportSelectionToAnsi(projectedSource, effectiveSelections))
          : exportSelectionToString(projectedSource, effectiveSelections),
      rich: format === 'ansi' ? null : exportSelectionToJSON(projectedSource, effectiveSelections),
    };
  }

  if (!textCursor) return null;
  const slot = resolveGridSlot(grid, textCursor);
  const cell = slot?.cell;
  const char = cell?.char || ' ';
  const singleCellGrid: GridMap = new Map([
    [
      '0,0',
      {
        char,
        color: cell?.color || brushColor,
        ...(cell?.bgColor ? { bgColor: cell.bgColor } : {}),
        ...(cloneTextAttributes(cell?.attrs) ? { attrs: cloneTextAttributes(cell?.attrs) } : {}),
        ...(cell?.href ? { href: cell.href } : {}),
      },
    ],
  ]);
  return {
    plain:
      format === 'ansi'
        ? toAnsiLikeClipboardText(exportToAnsi(createGridMapSource(singleCellGrid)))
        : char,
    rich:
      format === 'ansi'
        ? null
        : JSON.stringify({
            type: 'ascii-metropolis-zone',
            version: 1,
            cells: [
              {
                x: 0,
                y: 0,
                char,
                color: cell?.color || brushColor,
                ...(cell?.bgColor ? { bgColor: cell.bgColor } : {}),
                ...(cloneTextAttributes(cell?.attrs)
                  ? { attrs: cloneTextAttributes(cell?.attrs) }
                  : {}),
                ...(cell?.href ? { href: cell.href } : {}),
              },
            ],
          }),
  };
};
