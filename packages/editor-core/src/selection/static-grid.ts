import type { GridCellSource, SelectionArea } from '@chardesk/cell-plane/types';
import { normalizeCellRangeEndpoints } from '@chardesk/cell-core';
import { GridManager } from '@chardesk/cell-plane/grid';
import { resolveGridAnchor, resolveGridSlot } from '@chardesk/cell-plane/grid-occupancy';
import { getGridSelectionCoverageGeometry } from './grid-selection-geometry.js';
import { resolveGridSelectionCoverage } from './coverage.js';
import type { GridAddress, GridBounds, GridRange } from './grid-types.js';
import type { StaticGridInputSession } from './static-grid-input-session.js';

export type { GridAddress, GridBounds, GridRange } from './grid-types.js';

type GridEdge = 'left' | 'right' | 'top' | 'bottom';

export interface GridSelectionState {
  mode: 'cell' | 'range';
  activeCell: GridAddress;
  anchorCell: GridAddress;
  primaryRange: GridRange;
  additionalRanges: GridRange[];
}

export type StaticGridState =
  | Readonly<{
      mode: 'navigate';
      selection: GridSelectionState;
    }>
  | Readonly<{
      mode: 'text-edit';
      session: StaticGridInputSession;
    }>;

export type StaticGridTarget = Readonly<{
  ranges: readonly GridRange[];
  areas: readonly SelectionArea[];
}>;

export type StaticGridInteraction =
  | Readonly<{
      kind: 'navigate';
      activeCell: GridAddress;
    }>
  | Readonly<{
      kind: 'text-edit';
      activeCell: GridAddress;
      cursor: GridAddress;
    }>
  | Readonly<{
      kind: 'range';
      activeCell: GridAddress;
      geometry: import('./grid-selection-geometry.js').GridSelectionGeometry;
    }>;

export type StaticGridViewState = Readonly<{
  target: StaticGridTarget;
  interaction: StaticGridInteraction;
}>;

const createGridAddress = (x = 0, y = 0): GridAddress => ({ x, y });

const createSingleCellRange = (address: GridAddress): GridRange => ({
  start: { ...address },
  end: { ...address },
});

export const normalizeGridRange = (range: GridRange): GridRange => {
  const normalized = normalizeCellRangeEndpoints({
    anchor: range.start,
    focus: range.end,
  });
  return { start: normalized.anchor, end: normalized.focus };
};

export const gridRangesEqual = (left: GridRange, right: GridRange) => {
  const a = normalizeGridRange(left);
  const b = normalizeGridRange(right);
  return (
    a.start.x === b.start.x && a.start.y === b.start.y && a.end.x === b.end.x && a.end.y === b.end.y
  );
};

export const getEffectiveGridBounds = (input: {
  grid: GridCellSource;
  activeCell: GridAddress;
  ranges?: GridRange[];
  fixedBounds?: GridBounds | null;
}): GridBounds => {
  if (input.fixedBounds) return normalizeGridRange(input.fixedBounds);

  let minX = input.activeCell.x;
  let maxX = input.activeCell.x;
  let minY = input.activeCell.y;
  let maxY = input.activeCell.y;
  const include = ({ x, y }: GridAddress) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };

  GridManager.iterate(input.grid, (cell, x, y) => {
    include({ x, y });
    include({ x: x + GridManager.getCharWidth(cell.char) - 1, y });
  });
  for (const range of input.ranges ?? []) {
    include(range.start);
    include(range.end);
  }

  return { start: { x: minX, y: minY }, end: { x: maxX, y: maxY } };
};

export const moveGridAddressToEdge = (
  address: GridAddress,
  edge: GridEdge,
  bounds: GridBounds
): GridAddress => {
  const normalized = normalizeGridRange(bounds);
  if (edge === 'left') return { x: normalized.start.x, y: address.y };
  if (edge === 'right') return { x: normalized.end.x, y: address.y };
  if (edge === 'top') return { x: address.x, y: normalized.start.y };
  return { x: address.x, y: normalized.end.y };
};

const getContentNavigationBounds = (input: {
  grid: GridCellSource;
  activeCell: GridAddress;
  fixedBounds?: GridBounds | null;
}): GridBounds => {
  if (input.fixedBounds) return normalizeGridRange(input.fixedBounds);

  let minX = input.activeCell.x;
  let maxX = input.activeCell.x;
  let minY = input.activeCell.y;
  let maxY = input.activeCell.y;
  GridManager.iterate(input.grid, (cell, x, y) => {
    if (!cell.char.trim()) return;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x + Math.max(1, GridManager.getCharWidth(cell.char)) - 1);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  });
  return { start: { x: minX, y: minY }, end: { x: maxX, y: maxY } };
};

export const moveGridAddressToContentBoundary = (input: {
  grid: GridCellSource;
  address: GridAddress;
  edge: GridEdge;
  fixedBounds?: GridBounds | null;
}): GridAddress => {
  const bounds = getContentNavigationBounds({
    grid: input.grid,
    activeCell: input.address,
    fixedBounds: input.fixedBounds,
  });
  const step = {
    x: input.edge === 'left' ? -1 : input.edge === 'right' ? 1 : 0,
    y: input.edge === 'top' ? -1 : input.edge === 'bottom' ? 1 : 0,
  };
  const withinBounds = ({ x, y }: GridAddress) =>
    x >= bounds.start.x && x <= bounds.end.x && y >= bounds.start.y && y <= bounds.end.y;

  const currentCell = input.grid.get(input.address);
  const horizontalStep =
    step.x > 0 && currentCell?.char.trim()
      ? Math.max(1, GridManager.getCharWidth(currentCell.char))
      : step.x;
  const cursor = moveGridAddress(input.address, horizontalStep, step.y);
  if (!withinBounds(cursor)) return { ...input.address };

  // Work follows occupied anchors, not the coordinate distance between sparse islands.
  const horizontal = step.x !== 0;
  const direction = horizontal ? step.x : step.y;
  const coordinate = horizontal ? cursor.x : cursor.y;
  const minimum = horizontal ? bounds.start.x : bounds.start.y;
  const maximum = horizontal ? bounds.end.x : bounds.end.y;
  const intervals: { start: number; end: number }[] = [];
  GridManager.iterate(input.grid, (cell, x, y) => {
    if (!cell.char.trim()) return;
    const width = Math.max(1, GridManager.getCharWidth(cell.char));
    if (horizontal && y !== input.address.y) return;
    if (!horizontal && (input.address.x < x || input.address.x >= x + width)) return;
    const start = Math.max(minimum, horizontal ? x : y);
    const end = Math.min(maximum, horizontal ? x + width - 1 : y);
    if (start <= end) intervals.push({ start, end });
  });
  intervals.sort((a, b) => a.start - b.start);
  const origin = (at: number) => {
    const point = horizontal ? { x: at, y: input.address.y } : { x: input.address.x, y: at };
    return resolveGridSlot(input.grid, point)?.anchor ?? point;
  };
  const adjacent = intervals.findIndex(
    ({ start, end }) => start <= coordinate && end >= coordinate
  );
  if (adjacent >= 0) {
    let index = adjacent;
    let edge = direction > 0 ? intervals[index]!.end : intervals[index]!.start;
    while (intervals[index + direction]) {
      const next = intervals[index + direction]!;
      if (direction > 0 && next.start > edge + 1) break;
      if (direction < 0 && next.end < edge - 1) break;
      edge = direction > 0 ? Math.max(edge, next.end) : Math.min(edge, next.start);
      index += direction;
    }
    return origin(edge);
  }
  const candidates = direction > 0 ? intervals : [...intervals].reverse();
  const ahead = candidates.find(({ start, end }) =>
    direction > 0 ? start >= coordinate : end <= coordinate
  );
  if (ahead) return origin(direction > 0 ? ahead.start : ahead.end);

  return moveGridAddressToEdge(input.address, input.edge, bounds);
};

export const getConnectedGridRange = (grid: GridCellSource, origin: GridAddress): GridRange => {
  const resolvedOrigin = resolveGridSlot(grid, origin);
  if (!resolvedOrigin) return { start: { ...origin }, end: { ...origin } };

  const visited = new Set<string>();
  const pending = [{ ...resolvedOrigin.anchor }];
  let minX = resolvedOrigin.anchor.x;
  let maxX = resolvedOrigin.anchor.x + resolvedOrigin.width - 1;
  let minY = resolvedOrigin.anchor.y;
  let maxY = resolvedOrigin.anchor.y;

  while (pending.length > 0) {
    const point = pending.pop()!;
    const slot = resolveGridSlot(grid, point);
    if (!slot) continue;
    const key = GridManager.toKey(slot.anchor.x, slot.anchor.y);
    if (visited.has(key)) continue;
    visited.add(key);
    const endX = slot.anchor.x + slot.width - 1;
    minX = Math.min(minX, slot.anchor.x);
    maxX = Math.max(maxX, endX);
    minY = Math.min(minY, slot.anchor.y);
    maxY = Math.max(maxY, slot.anchor.y);
    pending.push({ x: slot.anchor.x - 1, y: slot.anchor.y }, { x: endX + 1, y: slot.anchor.y });
    for (let x = slot.anchor.x; x <= endX; x++) {
      pending.push({ x, y: slot.anchor.y - 1 }, { x, y: slot.anchor.y + 1 });
    }
  }

  return { start: { x: minX, y: minY }, end: { x: maxX, y: maxY } };
};

export const gridRangeFromSelectionArea = (area: SelectionArea): GridRange =>
  normalizeGridRange({ start: area.start, end: area.end });

export const selectionAreaFromGridRange = (range: GridRange): SelectionArea => {
  const normalized = normalizeGridRange(range);
  return {
    start: { ...normalized.start },
    end: { ...normalized.end },
  };
};

const selectionAreasFromGridRanges = (ranges: GridRange[]) =>
  ranges.map(selectionAreaFromGridRange);

export const getGridSelectionRanges = (state: GridSelectionState) => [
  ...state.additionalRanges,
  state.primaryRange,
];

export const getStaticGridSelectionAreas = (state: GridSelectionState, grid?: GridCellSource) =>
  grid
    ? [...resolveGridSelectionCoverage(getGridSelectionRanges(state), grid).areas]
    : selectionAreasFromGridRanges(getGridSelectionRanges(state));

export const hasGridRangeSelection = (state: GridSelectionState) => {
  return state.mode === 'range';
};

export const getStaticGridSelection = (state: StaticGridState): GridSelectionState =>
  state.mode === 'navigate' ? state.selection : createGridSelectionState(state.session.activeCell);

export const getStaticGridCursor = (state: StaticGridState): GridAddress | null =>
  state.mode === 'text-edit' ? state.session.activeCell : null;

export const getStaticGridInputSession = (state: StaticGridState): StaticGridInputSession | null =>
  state.mode === 'text-edit' ? state.session : null;

export const getStaticGridViewState = (input: {
  state: StaticGridState;
  grid?: GridCellSource;
}): StaticGridViewState => {
  const selection = getStaticGridSelection(input.state);
  const ranges = getGridSelectionRanges(selection);
  const coverage = resolveGridSelectionCoverage(ranges, input.grid);
  const areas = input.grid ? coverage.areas : selectionAreasFromGridRanges(ranges);
  const rawActiveCell =
    input.state.mode === 'text-edit'
      ? { ...input.state.session.activeCell }
      : { ...selection.activeCell };
  const activeCell = input.grid ? resolveGridAnchor(input.grid, rawActiveCell) : rawActiveCell;

  const target = { ranges, areas };
  if (input.state.mode === 'text-edit') {
    return {
      target,
      interaction: { kind: 'text-edit', activeCell, cursor: activeCell },
    };
  }
  if (hasGridRangeSelection(selection)) {
    return {
      target,
      interaction: {
        kind: 'range',
        activeCell,
        geometry: getGridSelectionCoverageGeometry(coverage),
      },
    };
  }
  return {
    target,
    interaction: { kind: 'navigate', activeCell },
  };
};

export const moveGridAddress = (address: GridAddress, dx: number, dy: number): GridAddress => ({
  x: address.x + dx,
  y: address.y + dy,
});

export const createGridSelectionState = (
  activeCell: GridAddress = createGridAddress()
): GridSelectionState => ({
  mode: 'cell',
  activeCell: { ...activeCell },
  anchorCell: { ...activeCell },
  primaryRange: createSingleCellRange(activeCell),
  additionalRanges: [],
});

export const createStaticGridState = (
  activeCell: GridAddress = createGridAddress()
): StaticGridState => ({
  mode: 'navigate',
  selection: createGridSelectionState(activeCell),
});

export const collapseGridSelectionTo = (
  state: GridSelectionState,
  activeCell: GridAddress
): GridSelectionState => ({
  ...state,
  mode: 'cell',
  activeCell: { ...activeCell },
  anchorCell: { ...activeCell },
  primaryRange: createSingleCellRange(activeCell),
  additionalRanges: [],
});

export const extendGridSelectionTo = (
  state: GridSelectionState,
  extentCell: GridAddress
): GridSelectionState => ({
  ...state,
  mode: 'range',
  primaryRange: normalizeGridRange({ start: state.anchorCell, end: extentCell }),
  additionalRanges: [],
});

export const getGridSelectionExtent = (state: GridSelectionState): GridAddress => {
  const range = normalizeGridRange(state.primaryRange);
  return {
    x: state.anchorCell.x === range.start.x ? range.end.x : range.start.x,
    y: state.anchorCell.y === range.start.y ? range.end.y : range.start.y,
  };
};

const isGridAddressWithinRange = (address: GridAddress, range: GridRange) =>
  address.x >= range.start.x &&
  address.x <= range.end.x &&
  address.y >= range.start.y &&
  address.y <= range.end.y;

export const selectGridRange = (
  state: GridSelectionState,
  range: GridRange,
  options?: { append?: boolean; activeCell?: 'start' | 'preserve' }
): GridSelectionState => {
  const primaryRange = normalizeGridRange(range);
  const requestedActiveCell = options?.activeCell === 'start' ? range.start : state.activeCell;
  const activeCell = isGridAddressWithinRange(requestedActiveCell, primaryRange)
    ? requestedActiveCell
    : range.start;
  return {
    ...state,
    mode: 'range',
    activeCell: { ...activeCell },
    anchorCell: { ...range.start },
    primaryRange,
    additionalRanges: options?.append
      ? [...state.additionalRanges, state.primaryRange].filter(
          (candidate, index, ranges) =>
            !gridRangesEqual(candidate, primaryRange) &&
            ranges.findIndex((range) => gridRangesEqual(range, candidate)) === index
        )
      : [],
  };
};

export const selectGridRow = (
  state: GridSelectionState,
  bounds: GridBounds
): GridSelectionState => {
  const normalized = normalizeGridRange(bounds);
  return selectGridRange(state, {
    start: { x: normalized.start.x, y: state.activeCell.y },
    end: { x: normalized.end.x, y: state.activeCell.y },
  });
};

export const selectGridColumn = (
  state: GridSelectionState,
  bounds: GridBounds
): GridSelectionState => {
  const normalized = normalizeGridRange(bounds);
  return selectGridRange(state, {
    start: { x: state.activeCell.x, y: normalized.start.y },
    end: { x: state.activeCell.x, y: normalized.end.y },
  });
};
