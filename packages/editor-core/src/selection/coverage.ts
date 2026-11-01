import { resolveCellRangeSpans, type CellRect } from '@chardesk/cell-core';
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

/** Materialized operations have a work budget; viewport presentation and hit tests can clip first. */
export function validateSelectionWork(ranges: readonly GridRange[], limit = 1_000_000) {
  let work = 0;
  for (const { start, end } of ranges) {
    if (![start.x, start.y, end.x, end.y].every(Number.isSafeInteger))
      throw new RangeError('Selection has unsupported coordinates.');
    work += (Math.abs(end.x - start.x) + 1) * (Math.abs(end.y - start.y) + 1);
    if (!Number.isSafeInteger(work) || work > limit)
      throw new RangeError('Selection is too large for this operation.');
  }
}

export const resolveGridSelectionCoverage = (
  ranges: readonly GridRange[],
  grid?: GridCellSource,
  clip?: CellRect
): GridSelectionCoverage => {
  // Include the width-two glyph halo before cropping; clamping an offscreen range
  // directly to the viewport would invent selected cells along its border.
  const halo = clip ? { ...clip, x: clip.x - 1, width: clip.width + 2 } : undefined;
  const visible = !halo
    ? ranges
    : ranges.filter(
        ({ start, end }) =>
          Math.max(start.x, end.x) >= halo.x &&
          Math.min(start.x, end.x) < halo.x + halo.width &&
          Math.max(start.y, end.y) >= halo.y &&
          Math.min(start.y, end.y) < halo.y + halo.height
      );
  const spans = resolveCellRangeSpans(
    visible.map((range) => ({ anchor: range.start, focus: range.end })),
    {
      clip: halo,
      ...(grid
        ? {
            getFootprint: (point: Point) => {
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
        : {}),
    }
  ).flatMap((span) => {
    const minX = clip ? Math.max(span.x, clip.x) : span.x;
    const maxX = clip
      ? Math.min(span.x + span.width - 1, clip.x + clip.width - 1)
      : span.x + span.width - 1;
    return minX <= maxX ? [{ y: span.y, minX, maxX }] : [];
  });
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
