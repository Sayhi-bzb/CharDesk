import type { Point } from "@/shared/types";
import type { CanvasSurfaceReader } from "@/domains/canvas/public";
import type { CanvasLinkHit } from "../hooks/interaction/core/linkHitTesting";
import { GridManager } from "@/shared/utils/grid";
import {
  alignCanvasCoordinate,
  DEFAULT_ARTIFACT_CANVAS_PALETTE,
  DEFAULT_GRID_RENDER_METRICS,
  getCellOccupancy,
  resolveCellVisual,
  setTextRenderStyle,
} from "@/shared/metrics";
import {
  presentCharDeskCellFrame,
  type CharDeskCanvasContext,
} from "@chardesk/rendering/canvas";
import type { CharDeskFontProfile } from "@chardesk/fonts";
import {
  createCanvasCellFrame,
  type CanvasCellFrameProjection,
} from "./canvasCellFrame";

type ViewBounds = ReturnType<typeof GridManager.getViewportGridBounds>;
type DrawGridLayerOptions = {
  fontProfile?: CharDeskFontProfile;
  alpha?: number;
  hoveredLink?: CanvasLinkHit | null;
  content?: "all" | "background" | "text";
  projection?: CanvasCellFrameProjection;
};

/** @internal */
export type DrawGridLayerResult = {
  cells: number;
  glyphs: number;
};

export const drawHoveredLinkDecoration = (
  ctx: CharDeskCanvasContext,
  reader: CanvasSurfaceReader | null,
  hoveredLink: CanvasLinkHit,
  zoom: number,
  offset: Point
) => {
  if (!reader) return;
  const lineWidth = Math.max(1, Math.round(zoom));
  const lineY = alignCanvasCoordinate(
    GridManager.gridToScreen(
      hoveredLink.startX,
      hoveredLink.y,
      offset.x,
      offset.y,
      zoom
    ).y + DEFAULT_GRID_RENDER_METRICS.cellHeight * zoom * 0.82,
    lineWidth
  );

  ctx.save();
  ctx.lineWidth = lineWidth;
  for (const span of reader.query({
    x: hoveredLink.startX,
    y: hoveredLink.y,
    width: hoveredLink.endX - hoveredLink.startX + 1,
    height: 1,
  })) {
    let x = span.x;
    for (const cell of span.cells) {
      const width = getCellOccupancy(cell.char);
      if (
        !cell.attrs?.underline &&
        cell.href === hoveredLink.href &&
        x >= hoveredLink.startX &&
        x <= hoveredLink.endX
      ) {
        const position = GridManager.gridToScreen(
          x,
          hoveredLink.y,
          offset.x,
          offset.y,
          zoom
        );
        ctx.beginPath();
        ctx.strokeStyle = resolveCellVisual(cell).color;
        ctx.moveTo(position.x, lineY);
        ctx.lineTo(
          position.x + DEFAULT_GRID_RENDER_METRICS.cellWidth * zoom * width,
          lineY
        );
        ctx.stroke();
      }
      x += width;
    }
  }
  ctx.restore();
};

export const drawGridLayer = (
  ctx: CharDeskCanvasContext,
  reader: CanvasSurfaceReader | null,
  viewBounds: ViewBounds,
  zoom: number,
  offset: Point,
  options: DrawGridLayerOptions = {}
): DrawGridLayerResult => {
  if (!reader) return { cells: 0, glyphs: 0 };
  const { alpha = 1, hoveredLink = null } = options;
  const content = options.content ?? "all";

  ctx.save();
  ctx.globalAlpha = alpha;
  setTextRenderStyle(ctx, zoom);

  const viewport = {
    x: viewBounds.startX,
    y: viewBounds.startY,
    width: viewBounds.endX - viewBounds.startX + 1,
    height: viewBounds.endY - viewBounds.startY + 1,
  };
  const frame = createCanvasCellFrame(
    reader,
    viewport,
    "full",
    options.projection
  );
  const result = presentCharDeskCellFrame(ctx, frame, {
    metrics: DEFAULT_GRID_RENDER_METRICS,
    palette: DEFAULT_ARTIFACT_CANVAS_PALETTE,
    offset,
    zoom,
    content,
    queryOverscan: { left: 1 },
    underline: hoveredLink
      ? (x, y, cell) =>
          !!cell.visual.href &&
          cell.visual.href === hoveredLink.href &&
          y === hoveredLink.y &&
          x >= hoveredLink.startX &&
          x <= hoveredLink.endX
      : undefined,
    ...(options.fontProfile ? { fontProfile: options.fontProfile } : {}),
  });
  ctx.restore();
  return result;
};
