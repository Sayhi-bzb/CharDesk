import { DEFAULT_CANVAS_CELL_METRICS } from "@/shared/fonts/canvas-profile";

export const shouldDrawCanvasGrid = (zoom: number) =>
  DEFAULT_CANVAS_CELL_METRICS.cellWidth * zoom >= 4;
