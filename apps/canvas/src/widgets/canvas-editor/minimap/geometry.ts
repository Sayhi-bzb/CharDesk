import { computeMinimapTransformFromBounds } from '@chardesk/editor-core/minimap/geometry';
export {
  computeMinimapTransformFromBounds,
  unionMinimapRects,
  worldPointToMinimap,
  minimapPointToWorld,
  computeMinimapViewportRect,
  clampMinimapCameraCenter,
  lockMinimapPointToAxis,
  cameraCenterToOffset,
  getRectCenter,
  expandMinimapRect,
  isPointInMinimapRect,
} from '@chardesk/editor-core/minimap/geometry';
import type { GridCellSource, Point } from '@/shared/types';
import type { CanvasSurfaceReader } from '@/domains/canvas/public';
import { DEFAULT_CANVAS_CELL_METRICS } from '@/shared/fonts/canvas-profile';
import { GridManager } from '@/shared/utils/grid';
import type { MinimapDimensions, MinimapRect, MinimapTransform } from './types';

const hasVisibleContent = (cell: { char?: string; bgColor?: string }) => {
  if (cell.bgColor && cell.bgColor !== 'transparent') return true;
  return !!cell.char && cell.char !== ' ';
};

export const computeVisibleContentBounds = (source: GridCellSource): MinimapRect | null => {
  if (!source.getContentBounds()) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const { cellWidth, cellHeight } = DEFAULT_CANVAS_CELL_METRICS;

  GridManager.iterate(source, (cell, x, y) => {
    if (!hasVisibleContent(cell)) return;
    const occupancy = Math.max(GridManager.getCharWidth(cell.char), 1);
    minX = Math.min(minX, x * cellWidth);
    minY = Math.min(minY, y * cellHeight);
    maxX = Math.max(maxX, (x + occupancy) * cellWidth);
    maxY = Math.max(maxY, (y + 1) * cellHeight);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

export const computeVisibleSurfaceBounds = (reader: CanvasSurfaceReader): MinimapRect | null => {
  const bounds = reader.getContentBounds();
  if (!bounds) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const { cellWidth, cellHeight } = DEFAULT_CANVAS_CELL_METRICS;

  for (const row of reader.rows(bounds)) {
    for (const span of row.spans) {
      let x = span.x;
      for (const cell of span.cells) {
        const occupancy = Math.max(GridManager.getCharWidth(cell.char), 1);
        if (hasVisibleContent(cell)) {
          minX = Math.min(minX, x * cellWidth);
          minY = Math.min(minY, row.y * cellHeight);
          maxX = Math.max(maxX, (x + occupancy) * cellWidth);
          maxY = Math.max(maxY, (row.y + 1) * cellHeight);
        }
        x += occupancy;
      }
    }
  }

  return Number.isFinite(minX)
    ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    : null;
};

export const computeMinimapTransform = ({
  source,
  offset,
  zoom,
  viewportSize,
  dimensions,
  padding,
}: {
  source: GridCellSource;
  offset: Point;
  zoom: number;
  viewportSize: MinimapDimensions;
  dimensions: MinimapDimensions;
  padding: number;
}): MinimapTransform | null => {
  return computeMinimapTransformFromBounds({
    contentBounds: computeVisibleContentBounds(source),
    offset,
    zoom,
    viewportSize,
    dimensions,
    padding,
  });
};
