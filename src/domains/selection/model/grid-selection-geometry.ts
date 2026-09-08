import { union, type Polygon } from "polygon-clipping";
import type { GridCellSource, Point } from "@/shared/types";
import { getGridFootprint } from "@/shared/utils/grid-occupancy";
import type { GridBounds, GridRange } from "./grid-types";

export interface GridSelectionGeometry {
  polygons: Array<{ rings: Point[][] }>;
  bounds: GridBounds | null;
}

interface GridSelectionSpan {
  y: number;
  minX: number;
  maxX: number;
}

const normalizeRange = (range: GridRange): GridRange => ({
  start: {
    x: Math.min(range.start.x, range.end.x),
    y: Math.min(range.start.y, range.end.y),
  },
  end: {
    x: Math.max(range.start.x, range.end.x),
    y: Math.max(range.start.y, range.end.y),
  },
});

const rangeToPolygon = (range: GridRange): Polygon => {
  const normalized = normalizeRange(range);
  const minX = normalized.start.x;
  const minY = normalized.start.y;
  const maxX = normalized.end.x + 1;
  const maxY = normalized.end.y + 1;
  return [[
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ]];
};

export const getGridSelectionGeometry = (
  ranges: GridRange[],
  grid?: GridCellSource
): GridSelectionGeometry => {
  if (ranges.length === 0) return { polygons: [], bounds: null };

  const normalized = getGridSelectionSpans(ranges, grid).map(({ y, minX, maxX }) => ({
    start: { x: minX, y },
    end: { x: maxX, y },
  }));
  const minX = Math.min(...normalized.map((range) => range.start.x));
  const minY = Math.min(...normalized.map((range) => range.start.y));
  const maxX = Math.max(...normalized.map((range) => range.end.x));
  const maxY = Math.max(...normalized.map((range) => range.end.y));
  const [first, ...rest] = normalized.map(rangeToPolygon);
  const polygons = union(first, ...rest).map((polygon) => ({
    rings: polygon.map((ring) => ring.map(([x, y]) => ({ x, y }))),
  }));

  return {
    polygons,
    bounds: { start: { x: minX, y: minY }, end: { x: maxX, y: maxY } },
  };
};

const getRawGridSelectionSpans = (
  ranges: GridRange[],
): GridSelectionSpan[] => {
  if (ranges.length === 0) return [];
  const spans: GridSelectionSpan[] = [];
  const normalized = ranges.map(normalizeRange);
  const minY = Math.min(...normalized.map((range) => range.start.y));
  const maxY = Math.max(...normalized.map((range) => range.end.y));

  for (let y = minY; y <= maxY; y++) {
    const intervals = normalized
      .filter((range) => y >= range.start.y && y <= range.end.y)
      .map((range) => ({ minX: range.start.x, maxX: range.end.x }))
      .sort((left, right) => left.minX - right.minX || left.maxX - right.maxX);
    if (intervals.length === 0) continue;

    let current = intervals[0];
    for (let index = 1; index < intervals.length; index++) {
      const next = intervals[index];
      if (next.minX <= current.maxX + 1) {
        current = { minX: current.minX, maxX: Math.max(current.maxX, next.maxX) };
      } else {
        spans.push({ y, ...current });
        current = next;
      }
    }
    spans.push({ y, ...current });
  }
  return spans;
};

const mergeRowSpans = (spans: GridSelectionSpan[]) => {
  const merged: GridSelectionSpan[] = [];
  const sorted = [...spans].sort(
    (left, right) => left.y - right.y || left.minX - right.minX || left.maxX - right.maxX
  );
  for (const span of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && previous.y === span.y && span.minX <= previous.maxX + 1) {
      previous.maxX = Math.max(previous.maxX, span.maxX);
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
};

export const getGridSelectionSpans = (
  ranges: GridRange[],
  grid?: GridCellSource
): GridSelectionSpan[] => {
  const spans = getRawGridSelectionSpans(ranges);
  if (!grid) return spans;
  return mergeRowSpans(
    spans.map((span) => {
      const left = getGridFootprint(grid, { x: span.minX, y: span.y });
      const right = getGridFootprint(grid, { x: span.maxX, y: span.y });
      return {
        y: span.y,
        minX: left ? Math.min(span.minX, left.start.x) : span.minX,
        maxX: right ? Math.max(span.maxX, right.end.x) : span.maxX,
      };
    })
  );
};

export const forEachGridSelectionSpan = (
  ranges: GridRange[],
  visit: (span: GridSelectionSpan) => void,
  grid?: GridCellSource
) => {
  getGridSelectionSpans(ranges, grid).forEach(visit);
};
