import type { GridCell } from "@/shared/types";
import { resolveCharDeskCellVisual } from "@chardesk/rendering";
import {
  drawCharDeskCanvasCells,
  resolveCharDeskCanvasCellVisual,
  type CharDeskCanvasCellDrawOptions,
  type CharDeskCanvasContext,
} from "@chardesk/rendering/canvas";
import type { RenderFontRoute } from "./fontRouting";
import { MAPLE_FONT_PROFILE } from "@chardesk/font-maple";
import {
  alignCanvasCoordinate,
  DEFAULT_GRID_RENDER_METRICS,
  getCanvasFont,
  type GridRenderMetrics,
} from "./renderMetrics";

type ResolvedCellVisual = {
  char: string;
  color: string;
  bgColor?: string;
  attrs: GridCell["attrs"];
  occupancy: number;
  fontRoute: RenderFontRoute;
};

type CanvasCellDrawOptions = CharDeskCanvasCellDrawOptions;
const withProductFont = (options?: CanvasCellDrawOptions): CanvasCellDrawOptions => ({
  ...options,
  fontProfile: options?.fontProfile ?? MAPLE_FONT_PROFILE,
});

export type CanvasCellDrawEntry = {
  cell: GridCell;
  x: number;
  y: number;
  options?: CanvasCellDrawOptions;
  drawBackground?: boolean;
  drawText?: boolean;
};

type CharDeskDrawEntry = Parameters<typeof drawCharDeskCanvasCells>[1][number];
const canvasDrawEntryCache = new WeakMap<CanvasCellDrawEntry, CharDeskDrawEntry>();

export const resolveCellVisual = (cell: GridCell): ResolvedCellVisual => {
  const visual = resolveCharDeskCanvasCellVisual(resolveCharDeskCellVisual({
    text: cell.char,
    color: cell.color,
    ...(cell.bgColor ? { bgColor: cell.bgColor } : {}),
    ...(cell.attrs ? { attrs: cell.attrs } : {}),
    ...(cell.href ? { href: cell.href } : {}),
  }));
  return {
    char: visual.text,
    color: visual.color,
    bgColor: visual.bgColor,
    attrs: visual.attrs,
    occupancy: visual.width,
    fontRoute: visual.fontRoute,
  };
};

const canvasVisualCache = new WeakMap<GridCell, ReturnType<typeof resolveCharDeskCellVisual>>();

const toCanvasVisual = (cell: GridCell) => {
  const cached = canvasVisualCache.get(cell);
  if (cached) return cached;
  const visual = resolveCharDeskCellVisual({
    text: cell.char,
    color: cell.color,
    ...(cell.bgColor ? { bgColor: cell.bgColor } : {}),
    ...(cell.attrs ? { attrs: cell.attrs } : {}),
    ...(cell.href ? { href: cell.href } : {}),
  });
  canvasVisualCache.set(cell, visual);
  return visual;
};

export const drawGridLines = (
  ctx: CharDeskCanvasContext,
  options: {
    startX: number;
    endX: number;
    startY: number;
    endY: number;
    offsetX?: number;
    offsetY?: number;
    width: number;
    height: number;
    zoom?: number;
    color: string;
    lineWidth?: number;
    metrics?: GridRenderMetrics;
  }
) => {
  const {
    startX,
    endX,
    startY,
    endY,
    offsetX = 0,
    offsetY = 0,
    width,
    height,
    zoom = 1,
    color,
    lineWidth = 1,
    metrics = DEFAULT_GRID_RENDER_METRICS,
  } = options;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  for (let x = startX; x <= endX; x++) {
    const posX = alignCanvasCoordinate(x * metrics.cellWidth * zoom + offsetX, lineWidth);
    ctx.moveTo(posX, 0);
    ctx.lineTo(posX, height);
  }
  for (let y = startY; y <= endY; y++) {
    const posY = alignCanvasCoordinate(y * metrics.cellHeight * zoom + offsetY, lineWidth);
    ctx.moveTo(0, posY);
    ctx.lineTo(width, posY);
  }
  ctx.stroke();
};

export const setTextRenderStyle = (
  ctx: CharDeskCanvasContext,
  zoom = 1,
  metrics: GridRenderMetrics = DEFAULT_GRID_RENDER_METRICS
) => {
  ctx.font = getCanvasFont(metrics, zoom);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
};

export const drawTextCell = (
  ctx: CharDeskCanvasContext,
  cell: GridCell,
  x: number,
  y: number,
  options?: CanvasCellDrawOptions
) => {
  drawCharDeskCanvasCells(ctx, [{ cell: toCanvasVisual(cell), x, y, options: withProductFont(options) }]);
};

export const drawCellBackground = (
  ctx: CharDeskCanvasContext,
  cell: GridCell,
  x: number,
  y: number,
  options?: Pick<CanvasCellDrawOptions, "zoom" | "metrics">
) => {
  drawCharDeskCanvasCells(ctx, [{
    cell: toCanvasVisual(cell),
    x,
    y,
    options: withProductFont(options),
    drawText: false,
  }]);
};

export const drawCellText = (
  ctx: CharDeskCanvasContext,
  cell: GridCell,
  x: number,
  y: number,
  options?: CanvasCellDrawOptions
) => {
  drawCharDeskCanvasCells(ctx, [{
    cell: toCanvasVisual(cell),
    x,
    y,
    options: withProductFont(options),
    drawBackground: false,
  }]);
};

export const drawCellBatch = (
  ctx: CharDeskCanvasContext,
  entries: readonly CanvasCellDrawEntry[]
) => {
  drawCharDeskCanvasCells(ctx, entries.map((entry) => {
    const cached = canvasDrawEntryCache.get(entry) ?? {
      cell: toCanvasVisual(entry.cell),
      x: entry.x,
      y: entry.y,
    };
    cached.cell = toCanvasVisual(entry.cell);
    cached.x = entry.x;
    cached.y = entry.y;
    cached.options = withProductFont(entry.options);
    cached.drawBackground = entry.drawBackground;
    cached.drawText = entry.drawText;
    canvasDrawEntryCache.set(entry, cached);
    return cached;
  }));
};
