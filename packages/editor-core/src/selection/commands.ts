import type { GridCellSource, Point } from '@chardesk/cell-plane/types';
import { resolveGridAnchor, resolveGridSlot } from '@chardesk/cell-plane/grid-occupancy';
import {
  collapseGridSelectionTo,
  extendGridSelectionTo,
  getGridSelectionExtent,
  moveGridAddress,
  selectGridRange,
  getEffectiveGridBounds,
  getGridSelectionRanges,
  moveGridAddressToEdge,
  moveGridAddressToContentBoundary,
  selectGridRow,
  selectGridColumn,
  type GridBounds,
  type GridRange,
  type GridSelectionState,
} from './static-grid.js';

export type GridEdge = 'left' | 'right' | 'top' | 'bottom';
export type GridCornerOrEdge = GridEdge | 'top-left' | 'bottom-right';

export function selectGridAxis(
  grid: GridCellSource,
  selection: GridSelectionState,
  axis: 'row' | 'column',
  fixedBounds?: GridBounds | null
) {
  const bounds = getEffectiveGridBounds({
    grid,
    activeCell: selection.activeCell,
    ranges: getGridSelectionRanges(selection),
    fixedBounds,
  });
  return axis === 'row' ? selectGridRow(selection, bounds) : selectGridColumn(selection, bounds);
}

export function moveGridFocusToEdge(
  grid: GridCellSource,
  selection: GridSelectionState,
  edge: GridCornerOrEdge,
  extend = false,
  fixedBounds?: GridBounds | null,
  resolveAddress: (point: Point) => Point = (point) => resolveGridAnchor(grid, point)
) {
  const bounds = getEffectiveGridBounds({
    grid,
    activeCell: selection.activeCell,
    ranges: getGridSelectionRanges(selection),
    fixedBounds,
  });
  let point = extend ? getGridSelectionExtent(selection) : selection.activeCell;
  if (edge === 'top-left') point = bounds.start;
  else if (edge === 'bottom-right') point = bounds.end;
  else point = moveGridAddressToEdge(point, edge, bounds);
  const target = resolveAddress(point);
  return extend
    ? extendGridSelectionTo(selection, target)
    : collapseGridSelectionTo(selection, target);
}

export function moveGridFocusToContentBoundary(
  grid: GridCellSource,
  selection: GridSelectionState,
  edge: GridEdge,
  extend = false,
  fixedBounds?: GridBounds | null,
  resolveAddress: (point: Point) => Point = (point) => resolveGridAnchor(grid, point)
) {
  const address = extend ? getGridSelectionExtent(selection) : selection.activeCell;
  const target = resolveAddress(
    moveGridAddressToContentBoundary({ grid, address, edge, fixedBounds })
  );
  return extend
    ? extendGridSelectionTo(selection, target)
    : collapseGridSelectionTo(selection, target);
}

/** Pointer range endpoints identify grapheme anchors, including follower hits. */
export function selectGridRangeAt(
  grid: GridCellSource,
  selection: GridSelectionState,
  range: GridRange,
  append = false
) {
  return selectGridRange(
    selection,
    { start: resolveGridAnchor(grid, range.start), end: resolveGridAnchor(grid, range.end) },
    { append, activeCell: 'start' }
  );
}

/** Keyboard extension moves the extent while keeping the active cell at its anchor. */
export function moveGridFocus(
  grid: GridCellSource,
  selection: GridSelectionState,
  delta: Point,
  extend = false,
  resolveAddress: (point: Point) => Point = (point) => resolveGridAnchor(grid, point)
) {
  const focus = extend ? getGridSelectionExtent(selection) : selection.activeCell;
  const slot = resolveGridSlot(grid, focus);
  const visualDx = delta.x > 0 && slot ? delta.x + slot.width - 1 : delta.x;
  const next = resolveAddress(moveGridAddress(focus, visualDx, delta.y));
  return extend ? extendGridSelectionTo(selection, next) : collapseGridSelectionTo(selection, next);
}

/** Written bounds retain their full cell extent even when the last glyph is wide. */
export function selectWrittenBounds(
  selection: GridSelectionState,
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
) {
  const start = { x: bounds.minX, y: bounds.minY };
  return bounds.minX === bounds.maxX && bounds.minY === bounds.maxY
    ? collapseGridSelectionTo(selection, start)
    : selectGridRange(
        selection,
        { start, end: { x: bounds.maxX, y: bounds.maxY } },
        { activeCell: 'start' }
      );
}
