import { resolveCharDeskCellVisual } from "@chardesk/rendering";
import {
  drawCharDeskCanvasCursor,
  type CharDeskCanvasContext,
  type CharDeskFontProfile,
} from "@chardesk/rendering/canvas";
import type { GridMap } from "@/shared/types";
import { GridManager } from "@/shared/utils/grid";
import {
  DEFAULT_GRID_RENDER_METRICS,
  gridCellRect,
  toCanvasVisual,
} from "@/shared/metrics";
import type { HostVisualTheme } from "@/shared/hooks/useHostVisualTheme";
import type { CanvasCellPresentation } from "../presentation/canvasCellPresentation";

type CanvasCursorPalette = Pick<
  HostVisualTheme["canvas"],
  "textCursorSurface" | "textCursorForeground"
>;

export const drawCanvasCellCursor = (
  ctx: CharDeskCanvasContext,
  cursor: NonNullable<CanvasCellPresentation["cursor"]>,
  input: Readonly<{
    grid: GridMap;
    offset: { x: number; y: number };
    zoom: number;
    palette: CanvasCursorPalette;
    fontProfile: CharDeskFontProfile;
  }>
) => {
  const position = gridCellRect(cursor.point, {
    offset: input.offset,
    zoom: input.zoom,
  });
  const cell = input.grid.get(GridManager.toKey(cursor.point.x, cursor.point.y));
  drawCharDeskCanvasCursor(ctx, {
    cell: cell ? toCanvasVisual(cell) : resolveCharDeskCellVisual({ text: " " }),
    x: position.x,
    y: position.y,
    style: {
      shape: cursor.shape,
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
