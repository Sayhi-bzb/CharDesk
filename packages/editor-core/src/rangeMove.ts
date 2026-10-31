import { resolveGridSelectionCoverage, type GridSelectionCoverage } from './selection/coverage.js';
import type { GridBounds, GridRange } from './selection/static-grid.js';
import { normalizeGridRange } from './selection/static-grid.js';
import type { CanvasAnchor } from './canvasAnchorModel.js';
import type { GridCell, GridCellSource, Point } from '@chardesk/cell-plane/types';
import { cloneTextAttributes } from '@chardesk/cell-plane/ansi';
import { GridSnapshotSource } from '@chardesk/cell-plane/grid-source';
import type { CellPlanePatch, CellRowMutation, StyledCellSpan } from '@chardesk/cell-plane';

export type StaticGridRangeMoveMaskSpan = Readonly<{
  y: number;
  minX: number;
  maxX: number;
}>;

export type StaticGridRangeMovePlan = Readonly<{
  delta: Point;
  sourceRange: GridRange;
  targetRange: GridRange;
  targetCoverage: GridSelectionCoverage;
  hiddenSpans: readonly StaticGridRangeMoveMaskSpan[];
  previewSource: GridCellSource;
  patch: CellPlanePatch;
}>;

export function planRangeMoveAnchors(
  source: GridCellSource,
  plan: StaticGridRangeMovePlan,
  anchors: readonly CanvasAnchor[]
) {
  const sourceCoverage = resolveGridSelectionCoverage([plan.sourceRange], source);
  const overwrittenCoverage = resolveGridSelectionCoverage(plan.targetCoverage.areas, source);
  const ids = anchors
    .filter((anchor) => !anchor.detached && sourceCoverage.contains(anchor.point))
    .map((anchor) => anchor.id);
  const moving = new Set(ids);
  const overwrittenIds = anchors
    .filter(
      (anchor) =>
        !anchor.detached && !moving.has(anchor.id) && overwrittenCoverage.contains(anchor.point)
    )
    .map((anchor) => anchor.id);
  return { ids, overwrittenIds, delta: plan.delta };
}

const translateRange = (range: GridRange, delta: Point): GridRange => ({
  start: { x: range.start.x + delta.x, y: range.start.y + delta.y },
  end: { x: range.end.x + delta.x, y: range.end.y + delta.y },
});

const cloneCell = (cell: GridCell): GridCell => ({
  ...cell,
  ...(cloneTextAttributes(cell.attrs) ? { attrs: cloneTextAttributes(cell.attrs) } : {}),
});

const toSpan = (x: number, cell: GridCell): StyledCellSpan => ({
  x,
  text: cell.char,
  color: cell.color,
  ...(cell.bgColor ? { bgColor: cell.bgColor } : {}),
  ...(cloneTextAttributes(cell.attrs) ? { attrs: cloneTextAttributes(cell.attrs) } : {}),
  ...(cell.href ? { href: cell.href } : {}),
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const mergeMaskSpans = (
  spans: readonly StaticGridRangeMoveMaskSpan[]
): StaticGridRangeMoveMaskSpan[] => {
  const merged: StaticGridRangeMoveMaskSpan[] = [];
  const sorted = [...spans].sort((left, right) => left.y - right.y || left.minX - right.minX);
  for (const span of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && previous.y === span.y && span.minX <= previous.maxX + 1) {
      merged[merged.length - 1] = {
        ...previous,
        maxX: Math.max(previous.maxX, span.maxX),
      };
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
};

export const isPointInStaticGridRange = (source: GridCellSource, range: GridRange, point: Point) =>
  resolveGridSelectionCoverage([range], source).contains(point);

export const createStaticGridRangeMovePlan = ({
  source,
  range,
  requestedDelta,
  bounds,
}: {
  source: GridCellSource;
  range: GridRange;
  requestedDelta: Point;
  bounds?: GridBounds | null;
}): StaticGridRangeMovePlan | null => {
  const sourceRange = normalizeGridRange(range);
  const sourceCoverage = resolveGridSelectionCoverage([sourceRange], source);
  if (!sourceCoverage.bounds) return null;
  const sourceSpans = sourceCoverage.spans;
  const { start, end } = sourceCoverage.bounds;
  const delta = bounds
    ? {
        x: clamp(requestedDelta.x, bounds.start.x - start.x, bounds.end.x - end.x),
        y: clamp(requestedDelta.y, bounds.start.y - start.y, bounds.end.y - end.y),
      }
    : { ...requestedDelta };

  if (delta.x === 0 && delta.y === 0) return null;

  const targetSpans = sourceSpans.map((span) => ({
    y: span.y + delta.y,
    minX: span.minX + delta.x,
    maxX: span.maxX + delta.x,
  }));
  const targetCoverage = resolveGridSelectionCoverage(
    targetSpans.map((span) => ({
      start: { x: span.minX, y: span.y },
      end: { x: span.maxX, y: span.y },
    }))
  );
  const targetMaskSpans = resolveGridSelectionCoverage(targetCoverage.areas, source).spans;

  const rows = new Map<
    number,
    {
      erase: Array<{ from: number; to: number }>;
      spans: StyledCellSpan[];
    }
  >();
  const previewEntries: Array<readonly [string, GridCell]> = [];
  const rowAt = (y: number) => {
    const row = rows.get(y) ?? { erase: [], spans: [] };
    rows.set(y, row);
    return row;
  };

  for (const span of sourceSpans) {
    rowAt(span.y).erase.push({ from: span.minX, to: span.maxX });
    rowAt(span.y + delta.y).erase.push({
      from: span.minX + delta.x,
      to: span.maxX + delta.x,
    });

    for (let x = span.minX; x <= span.maxX; x += 1) {
      const cell = source.get({ x, y: span.y });
      if (!cell) continue;
      const targetX = x + delta.x;
      const targetY = span.y + delta.y;
      const copied = cloneCell(cell);
      previewEntries.push([`${targetX},${targetY}`, copied]);
      rowAt(targetY).spans.push(toSpan(targetX, copied));
    }
  }

  const patchRows: CellRowMutation[] = [...rows.entries()]
    .sort(([leftY], [rightY]) => leftY - rightY)
    .map(([y, row]) => ({
      y,
      erase: row.erase.sort((left, right) => left.from - right.from),
      spans: row.spans.sort((left, right) => left.x - right.x),
    }));

  return {
    delta,
    sourceRange,
    targetRange: translateRange(sourceRange, delta),
    targetCoverage,
    hiddenSpans: mergeMaskSpans([...sourceSpans, ...targetMaskSpans]),
    previewSource: new GridSnapshotSource(previewEntries),
    patch: { rows: patchRows },
  };
};
