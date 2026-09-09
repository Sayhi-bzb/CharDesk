import type { GridCell } from "@/shared/types";
import { resolveCharDeskCellVisual } from "@chardesk/rendering";
import {
  drawCharDeskCanvasCells,
  resolveCharDeskCanvasCellVisual,
  type CharDeskCanvasCellDrawOptions,
  type CharDeskCanvasContext,
  type CharDeskCanvasPalette,
} from "@chardesk/rendering/canvas";
import type { RenderFontRoute } from "./fontRouting";
import { DEFAULT_CANVAS_FONT_PROFILE } from "@/shared/fonts/canvas-profile";
import {
  alignCanvasCoordinate,
  DEFAULT_GRID_RENDER_METRICS,
  getCanvasFont,
  type GridRenderMetrics,
} from "./renderMetrics";
import {
  DEFAULT_ARTIFACT_CANVAS_PALETTE,
  projectArtifactCellStyle,
} from "./artifactPalette";

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
  fontProfile: options?.fontProfile ?? DEFAULT_CANVAS_FONT_PROFILE,
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

export const resolveCellVisual = (
  cell: GridCell,
  palette: CharDeskCanvasPalette = DEFAULT_ARTIFACT_CANVAS_PALETTE
): ResolvedCellVisual => {
  const visual = resolveCharDeskCanvasCellVisual(
    toCanvasVisual(cell, palette),
    palette
  );
  return {
    char: visual.text,
    color: visual.color,
    bgColor: visual.bgColor,
    attrs: visual.attrs,
    occupancy: visual.width,
    fontRoute: visual.fontRoute,
  };
};

const canvasVisualCache = new WeakMap<
  GridCell,
  WeakMap<CharDeskCanvasPalette, ReturnType<typeof resolveCharDeskCellVisual>>
>();

export function toCanvasVisual(
  cell: GridCell,
  palette: CharDeskCanvasPalette = DEFAULT_ARTIFACT_CANVAS_PALETTE
) {
  const byPalette = canvasVisualCache.get(cell);
  const cached = byPalette?.get(palette);
  if (cached) return cached;
  const style = projectArtifactCellStyle(cell, palette);
  const visual = resolveCharDeskCellVisual({
    text: cell.char,
    color: style.color,
    ...(style.bgColor ? { bgColor: style.bgColor } : {}),
    ...(cell.attrs ? { attrs: cell.attrs } : {}),
    ...(cell.href ? { href: cell.href } : {}),
  });
  const cache = byPalette ?? new WeakMap();
  cache.set(palette, visual);
  if (!byPalette) canvasVisualCache.set(cell, cache);
  return visual;
}

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
  drawCharDeskCanvasCells(ctx, [{
    cell: toCanvasVisual(cell, options?.palette ?? DEFAULT_ARTIFACT_CANVAS_PALETTE),
    x,
    y,
    options: withProductFont(options),
  }]);
};

export const drawCellBackground = (
  ctx: CharDeskCanvasContext,
  cell: GridCell,
  x: number,
  y: number,
  options?: Pick<CanvasCellDrawOptions, "zoom" | "metrics" | "palette">
) => {
  drawCharDeskCanvasCells(ctx, [{
    cell: toCanvasVisual(cell, options?.palette ?? DEFAULT_ARTIFACT_CANVAS_PALETTE),
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
    cell: toCanvasVisual(cell, options?.palette ?? DEFAULT_ARTIFACT_CANVAS_PALETTE),
    x,
    y,
    options: withProductFont(options),
    drawBackground: false,
  }]);
};

export const drawCellBatch = (
  ctx: CharDeskCanvasContext,
  entries: readonly CanvasCellDrawEntry[],
  options?: CanvasCellDrawOptions
) => {
  drawCharDeskCanvasCells(ctx, entries.map((entry) => {
    const cached = canvasDrawEntryCache.get(entry) ?? {
      cell: toCanvasVisual(
        entry.cell,
        entry.options?.palette ?? options?.palette ?? DEFAULT_ARTIFACT_CANVAS_PALETTE
      ),
      x: entry.x,
      y: entry.y,
    };
    cached.cell = toCanvasVisual(
      entry.cell,
      entry.options?.palette ?? options?.palette ?? DEFAULT_ARTIFACT_CANVAS_PALETTE
    );
    cached.x = entry.x;
    cached.y = entry.y;
    cached.options = withProductFont({ ...options, ...entry.options });
    cached.drawBackground = entry.drawBackground;
    cached.drawText = entry.drawText;
    canvasDrawEntryCache.set(entry, cached);
    return cached;
  }));
};
