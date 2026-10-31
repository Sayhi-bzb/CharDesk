import polygonClipping, { type Polygon } from 'polygon-clipping';
const { union } = polygonClipping;
import type { GridCellSource, Point } from '@chardesk/cell-plane/types';
import { resolveGridSelectionCoverage, type GridSelectionCoverage } from './coverage.js';
import type { GridBounds, GridRange } from './grid-types.js';
export * from './coverage.js';

export interface GridSelectionGeometry {
  polygons: Array<{ rings: Point[][] }>;
  bounds: GridBounds | null;
}

const rangeToPolygon = (range: GridRange): Polygon => {
  const minX = range.start.x;
  const minY = range.start.y;
  const maxX = range.end.x + 1;
  const maxY = range.end.y + 1;
  return [
    [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
      [minX, minY],
    ],
  ];
};

export const getGridSelectionGeometry = (
  ranges: GridRange[],
  grid?: GridCellSource
): GridSelectionGeometry =>
  getGridSelectionCoverageGeometry(resolveGridSelectionCoverage(ranges, grid));

export const getGridSelectionCoverageGeometry = (
  coverage: GridSelectionCoverage
): GridSelectionGeometry => {
  if (!coverage.bounds) return { polygons: [], bounds: null };
  const [first, ...rest] = coverage.areas.map(rangeToPolygon);
  const polygons = union(first, ...rest).map((polygon) => ({
    rings: polygon.map((ring) => ring.map(([x, y]) => ({ x, y }))),
  }));

  return {
    polygons,
    bounds: coverage.bounds,
  };
};
