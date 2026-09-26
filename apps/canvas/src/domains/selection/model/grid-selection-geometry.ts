import { union, type Polygon } from "polygon-clipping";
import {
  normalizeCellRangeEndpoints,
  resolveCellRangeSpans,
} from "@chardesk/cell-core";
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

const normalizeRange = (range: GridRange): GridRange => {
  const normalized = normalizeCellRangeEndpoints({
    anchor: range.start,
    focus: range.end,
  });
  return { start: normalized.anchor, end: normalized.focus };
};

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

export const getGridSelectionSpans = (
  ranges: GridRange[],
  grid?: GridCellSource
): GridSelectionSpan[] => resolveCellRangeSpans(
  ranges.map((range) => ({ anchor: range.start, focus: range.end })),
  grid ? {
    getFootprint: (point) => {
      const footprint = getGridFootprint(grid, point);
      return footprint ? {
        x: footprint.start.x,
        y: footprint.start.y,
        width: footprint.end.x - footprint.start.x + 1,
        height: footprint.end.y - footprint.start.y + 1,
      } : null;
    },
  } : {}
).map((span) => ({
  y: span.y,
  minX: span.x,
  maxX: span.x + span.width - 1,
}));

export const forEachGridSelectionSpan = (
  ranges: GridRange[],
  visit: (span: GridSelectionSpan) => void,
  grid?: GridCellSource
) => {
  getGridSelectionSpans(ranges, grid).forEach(visit);
};
