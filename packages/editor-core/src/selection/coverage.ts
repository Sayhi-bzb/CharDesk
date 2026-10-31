import { resolveCellRangeSpans } from '@chardesk/cell-core';
import type { GridCellSource, Point, SelectionArea } from '@chardesk/cell-plane/types';
import { getGridFootprint } from '@chardesk/cell-plane/grid-occupancy';
import type { GridBounds, GridRange } from './grid-types.js';

export interface GridSelectionSpan {
  y: number;
  minX: number;
  maxX: number;
}

/** Physical coverage, after expanding each row to whole graphemes. Bounds are
 * an envelope only; membership and operations must use spans/areas. */
export interface GridSelectionCoverage {
  readonly spans: readonly GridSelectionSpan[];
  readonly areas: readonly SelectionArea[];
  readonly bounds: GridBounds | null;
  contains(point: Point): boolean;
}

export const resolveGridSelectionCoverage = (
  ranges: readonly GridRange[],
  grid?: GridCellSource
): GridSelectionCoverage => {
  const spans = resolveCellRangeSpans(
    ranges.map((range) => ({ anchor: range.start, focus: range.end })),
    grid
      ? {
          getFootprint: (point) => {
            const footprint = getGridFootprint(grid, point);
            return footprint
              ? {
                  x: footprint.start.x,
                  y: footprint.start.y,
                  width: footprint.end.x - footprint.start.x + 1,
                  height: footprint.end.y - footprint.start.y + 1,
                }
              : null;
          },
        }
      : {}
  ).map((span) => ({
    y: span.y,
    minX: span.x,
    maxX: span.x + span.width - 1,
  }));
  const areas = spans.map(({ y, minX, maxX }) => ({
    start: { x: minX, y },
    end: { x: maxX, y },
  }));
  let bounds: GridBounds | null = null;
  const rows = new Map<number, GridSelectionSpan[]>();
  for (const span of spans) {
    if (!bounds) bounds = { start: { x: span.minX, y: span.y }, end: { x: span.maxX, y: span.y } };
    else {
      bounds.start.x = Math.min(bounds.start.x, span.minX);
      bounds.end.x = Math.max(bounds.end.x, span.maxX);
      bounds.end.y = span.y;
    }
    const row = rows.get(span.y) ?? [];
    row.push(span);
    rows.set(span.y, row);
  }
  return {
    spans,
    areas,
    bounds,
    contains: (point) =>
      rows.get(point.y)?.some((s) => point.x >= s.minX && point.x <= s.maxX) ?? false,
  };
};

export const getGridSelectionSpans = (
  ranges: GridRange[],
  grid?: GridCellSource
): GridSelectionSpan[] => [...resolveGridSelectionCoverage(ranges, grid).spans];

export const forEachGridSelectionSpan = (
  ranges: GridRange[],
  visit: (span: GridSelectionSpan) => void,
  grid?: GridCellSource
) => {
  getGridSelectionSpans(ranges, grid).forEach(visit);
};
