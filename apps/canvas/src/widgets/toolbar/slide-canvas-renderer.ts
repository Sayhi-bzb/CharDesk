import type {
  SlideDescriptor,
  SlideGridEntry,
  SlideSize,
} from "@/domains/slides/public";
import {
  BACKGROUND_COLOR,
  COLOR_PRIMARY_TEXT,
} from "@/shared/lib/constants";
import {
  drawCellBackground,
  drawCellText,
} from "@/shared/cell-rendering/canvas-drawing";
import { prepareCharDeskCanvasSurface } from "@chardesk/rendering/canvas";
import { DEFAULT_CANVAS_CELL_METRICS } from "@/shared/fonts/canvas-profile";
import { GridManager } from "@/shared/utils/grid";
import { effectiveCellStyle } from "@/shared/utils/ansi";
import {
  resolveSlidePlaybackLayout,
  type SlidePlaybackLayout,
} from "./slide-playback-model";

type DrawSlideCanvasOptions = {
  canvas: HTMLCanvasElement;
  slide: SlideDescriptor & {
    grid: Iterable<SlideGridEntry>;
  };
  size: SlideSize;
  viewportWidth: number;
  viewportHeight: number;
  padding?: number;
  maxZoom?: number;
  backdropColor?: string | null;
  pageColor?: string | null;
  defaultTextColor?: string;
  dpr?: number;
};

export const drawSlideCanvas = ({
  canvas,
  slide,
  size,
  viewportWidth,
  viewportHeight,
  padding,
  maxZoom,
  backdropColor,
  pageColor = BACKGROUND_COLOR,
  defaultTextColor,
  dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
}: DrawSlideCanvasOptions): SlidePlaybackLayout | null => {
  if (viewportWidth <= 0 || viewportHeight <= 0) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  prepareCharDeskCanvasSurface(canvas, ctx, viewportWidth, viewportHeight, dpr);
  const resolvedBackdropColor = backdropColor === undefined
    ? pageColor
    : backdropColor;
  if (resolvedBackdropColor !== null) {
    ctx.fillStyle = resolvedBackdropColor;
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);
  }

  const layout = resolveSlidePlaybackLayout({
    viewportWidth,
    viewportHeight,
    columns: size.columns,
    rows: size.rows,
    padding,
    maxZoom,
  });
  if (pageColor !== null) {
    ctx.fillStyle = pageColor;
    ctx.fillRect(layout.x, layout.y, layout.width, layout.height);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.x, layout.y, layout.width, layout.height);
  ctx.clip();

  const visibleCells = function* () {
    for (const [key, cell] of slide.grid) {
      const { x, y } = GridManager.fromKey(key);
      if (x >= 0 && x < size.columns && y >= 0 && y < size.rows) {
        yield { x, y, cell };
      }
    }
  };

  for (const { x, y, cell } of visibleCells()) {
    drawCellBackground(
      ctx,
      cell,
      layout.x + x * DEFAULT_CANVAS_CELL_METRICS.cellWidth * layout.zoom,
      layout.y + y * DEFAULT_CANVAS_CELL_METRICS.cellHeight * layout.zoom,
      { zoom: layout.zoom }
    );
  }
  for (const { x, y, cell } of visibleCells()) {
    if (cell.char === " " && !cell.attrs) continue;
    const style = effectiveCellStyle(cell);
    const color =
      defaultTextColor &&
      (!style.bgColor || style.bgColor === "transparent") &&
      style.color.toLowerCase() === COLOR_PRIMARY_TEXT
        ? defaultTextColor
        : undefined;
    drawCellText(
      ctx,
      cell,
      layout.x + x * DEFAULT_CANVAS_CELL_METRICS.cellWidth * layout.zoom,
      layout.y + y * DEFAULT_CANVAS_CELL_METRICS.cellHeight * layout.zoom,
      { color, zoom: layout.zoom }
    );
  }

  ctx.restore();
  return layout;
};
