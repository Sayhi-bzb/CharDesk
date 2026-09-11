import type { CellPoint, CellRect } from "@chardesk/cell-core";
import {
  DEFAULT_CHARDESK_CELL_METRICS,
  type CharDeskCellMetrics,
} from "./metrics.js";

export type CharDeskViewportTransform = Readonly<{
  offset: CellPoint;
  zoom: number;
}>;

export const viewportToCellPoint = (
  x: number,
  y: number,
  viewport: CharDeskViewportTransform,
  metrics: CharDeskCellMetrics = DEFAULT_CHARDESK_CELL_METRICS
): CellPoint => ({
  x: Math.floor((x - viewport.offset.x) / (metrics.cellWidth * viewport.zoom)),
  y: Math.floor((y - viewport.offset.y) / (metrics.cellHeight * viewport.zoom)),
});

export const cellToViewportPoint = (
  x: number,
  y: number,
  viewport: CharDeskViewportTransform,
  metrics: CharDeskCellMetrics = DEFAULT_CHARDESK_CELL_METRICS
): CellPoint => ({
  x: x * metrics.cellWidth * viewport.zoom + viewport.offset.x,
  y: y * metrics.cellHeight * viewport.zoom + viewport.offset.y,
});

export const getViewportCellBounds = (
  width: number,
  height: number,
  viewport: CharDeskViewportTransform,
  metrics: CharDeskCellMetrics = DEFAULT_CHARDESK_CELL_METRICS
) => {
  const cellWidth = metrics.cellWidth * viewport.zoom;
  const cellHeight = metrics.cellHeight * viewport.zoom;
  return {
    startX: Math.floor(-viewport.offset.x / cellWidth),
    endX: Math.ceil((width - viewport.offset.x) / cellWidth),
    startY: Math.floor(-viewport.offset.y / cellHeight),
    endY: Math.ceil((height - viewport.offset.y) / cellHeight),
  };
};

export const getCellViewportRect = (
  point: CellPoint,
  viewport: CharDeskViewportTransform,
  metrics: CharDeskCellMetrics = DEFAULT_CHARDESK_CELL_METRICS
): CellRect => {
  const position = cellToViewportPoint(point.x, point.y, viewport, metrics);
  return {
    x: position.x,
    y: position.y,
    width: metrics.cellWidth * viewport.zoom,
    height: metrics.cellHeight * viewport.zoom,
  };
};

export type CharDeskCellFrameViewportLayout = Readonly<{
  offset: CellPoint;
  width: number;
  height: number;
  scale: number;
}>;

export const resolveCellFrameViewportLayout = (input: Readonly<{
  viewportWidth: number;
  viewportHeight: number;
  frameViewport: CellRect;
  metrics: CharDeskCellMetrics;
  padding?: number;
  maxScale?: number;
}>): CharDeskCellFrameViewportLayout | null => {
  const padding = input.padding ?? 8;
  const maxScale = input.maxScale ?? 2;
  const contentWidth = input.frameViewport.width * input.metrics.cellWidth;
  const contentHeight = input.frameViewport.height * input.metrics.cellHeight;
  const availableWidth = input.viewportWidth - padding * 2;
  const availableHeight = input.viewportHeight - padding * 2;
  if (
    input.viewportWidth <= 0 || input.viewportHeight <= 0
    || contentWidth <= 0 || contentHeight <= 0
    || availableWidth <= 0 || availableHeight <= 0 || maxScale <= 0
  ) return null;
  const scale = Math.min(
    maxScale,
    availableWidth / contentWidth,
    availableHeight / contentHeight
  );
  const width = contentWidth * scale;
  const height = contentHeight * scale;
  return {
    offset: {
      x: (input.viewportWidth - width) / 2
        - input.frameViewport.x * input.metrics.cellWidth * scale,
      y: (input.viewportHeight - height) / 2
        - input.frameViewport.y * input.metrics.cellHeight * scale,
    },
    width,
    height,
    scale,
  };
};
