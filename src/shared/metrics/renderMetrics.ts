import {
  alignCharDeskCanvasCoordinate,
  getCharDeskCanvasFont,
  loadCharDeskCanvasFonts,
  prepareCharDeskCanvasSurface,
  type CharDeskCanvasFontSample,
  type CharDeskCanvasContext,
  type CharDeskCanvasSurface,
} from "@chardesk/rendering/canvas";
import type { CharDeskCellMetrics } from "@chardesk/rendering";
import type { RenderFontRoute } from "./fontRouting";
import { MAPLE_FONT_PROFILE } from "@chardesk/font-maple";
import type { CharDeskFontProfile } from "@chardesk/fonts";
import { DEFAULT_CANVAS_FONT_PROFILE } from "@/shared/fonts/canvas-profile";
import { DEFAULT_GRID_GEOMETRY } from "./gridGeometry";

export type GridRenderMetrics = CharDeskCellMetrics;

export const DEFAULT_GRID_RENDER_METRICS = Object.freeze({
  ...DEFAULT_GRID_GEOMETRY,
  fontSize: 15,
  fontFamily: MAPLE_FONT_PROFILE.families.text,
} satisfies GridRenderMetrics);

export const getCanvasFont = (
  metrics: GridRenderMetrics = DEFAULT_GRID_RENDER_METRICS,
  zoom = 1,
  options?: {
    bold?: boolean;
    italic?: boolean;
    route?: RenderFontRoute;
  }
) => getCharDeskCanvasFont(metrics, zoom, options);

export const alignCanvasCoordinate = alignCharDeskCanvasCoordinate;

export const prepareCanvasSurface = (
  canvas: CharDeskCanvasSurface,
  ctx: CharDeskCanvasContext,
  width: number,
  height: number,
  dpr: number
) => prepareCharDeskCanvasSurface(canvas, ctx, width, height, dpr);

type RenderFontSample = CharDeskCanvasFontSample;

export const loadRenderFonts = async (
  samplesToLoad: Iterable<RenderFontSample>,
  fontProfile: CharDeskFontProfile = DEFAULT_CANVAS_FONT_PROFILE
) => {
  await loadCharDeskCanvasFonts(samplesToLoad, { fontProfile });
};
