import { resolveCharDeskCellVisual } from "@chardesk/rendering";
import {
  drawCharDeskCanvasCursor,
  type CharDeskCanvasContext,
  type CharDeskFontProfile,
} from "@chardesk/rendering/canvas";
import type { CanvasInteractionPalette } from "@/shared/canvas-appearance/runtime";
import {
  DEFAULT_GRID_RENDER_METRICS,
  gridCellRect,
  toCanvasVisual,
  type CanvasArtifactPalette,
} from "@/shared/metrics";
import type { GridCellSource, Point } from "@/shared/types";
import type { CanvasCellIndicator } from "../presentation/canvasCellPresentation";

type CanvasCellIndicatorPalette = Pick<
  CanvasInteractionPalette,
  | "selectionSurface"
  | "selectionBorder"
  | "textCursorSurface"
  | "textCursorForeground"
>;

type CanvasCellIndicatorViewport = Readonly<{
  offset: Point;
  zoom: number;
}>;

export const drawCanvasNavigationFocus = (
  ctx: CharDeskCanvasContext,
  point: Point,
  viewport: CanvasCellIndicatorViewport,
  palette: CanvasCellIndicatorPalette
) => {
  const position = gridCellRect(point, viewport);
  ctx.save();
  ctx.fillStyle = palette.selectionSurface;
  ctx.strokeStyle = palette.selectionBorder;
  ctx.lineWidth = Math.max(1, Math.round(1.5 * viewport.zoom));
  ctx.fillRect(
    Math.round(position.x),
    Math.round(position.y),
    Math.round(position.width),
    Math.round(position.height)
  );
  ctx.strokeRect(
    Math.round(position.x),
    Math.round(position.y),
    Math.round(position.width),
    Math.round(position.height)
  );
  ctx.restore();
};

export const drawCanvasCellIndicator = (
  ctx: CharDeskCanvasContext,
  indicator: CanvasCellIndicator,
  input: Readonly<{
    source: GridCellSource;
    offset: Point;
    zoom: number;
    palette: CanvasCellIndicatorPalette;
    artifactPalette: CanvasArtifactPalette;
    fontProfile: CharDeskFontProfile;
  }>
) => {
  if (indicator.kind === "navigation-focus") {
    drawCanvasNavigationFocus(ctx, indicator.point, input, input.palette);
    return;
  }

  const position = gridCellRect(indicator.point, input);
  const cell = input.source.get(indicator.point);
  drawCharDeskCanvasCursor(ctx, {
    cell: cell
      ? toCanvasVisual(cell, input.artifactPalette)
      : resolveCharDeskCellVisual({ text: " " }),
    x: position.x,
    y: position.y,
    style: {
      shape: indicator.shape,
      color: input.palette.textCursorSurface,
      textColor: input.palette.textCursorForeground,
    },
    options: {
      metrics: DEFAULT_GRID_RENDER_METRICS,
      zoom: input.zoom,
      fontProfile: input.fontProfile,
    },
    drawText: !!cell,
  });
};
