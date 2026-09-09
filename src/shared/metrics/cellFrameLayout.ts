import type { CellRect } from "@chardesk/cell-core";
import type { GridRenderMetrics } from "./renderMetrics";

export type CellFrameCanvasLayout = Readonly<{
  offset: Readonly<{ x: number; y: number }>;
  width: number;
  height: number;
  scale: number;
}>;

export const resolveCellFrameCanvasLayout = (input: Readonly<{
  viewportWidth: number;
  viewportHeight: number;
  frameViewport: CellRect;
  metrics: GridRenderMetrics;
  padding?: number;
  maxScale?: number;
}>): CellFrameCanvasLayout | null => {
  const padding = input.padding ?? 8;
  const maxScale = input.maxScale ?? 2;
  const contentWidth = input.frameViewport.width * input.metrics.cellWidth;
  const contentHeight = input.frameViewport.height * input.metrics.cellHeight;
  const availableWidth = input.viewportWidth - padding * 2;
  const availableHeight = input.viewportHeight - padding * 2;
  if (
    input.viewportWidth <= 0 ||
    input.viewportHeight <= 0 ||
    contentWidth <= 0 ||
    contentHeight <= 0 ||
    availableWidth <= 0 ||
    availableHeight <= 0 ||
    maxScale <= 0
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
      x:
        (input.viewportWidth - width) / 2 -
        input.frameViewport.x * input.metrics.cellWidth * scale,
      y:
        (input.viewportHeight - height) / 2 -
        input.frameViewport.y * input.metrics.cellHeight * scale,
    },
    width,
    height,
    scale,
  };
};
