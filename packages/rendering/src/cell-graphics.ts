import { cellGraphicDefinitions, CustomGlyphDefinitionType } from "./cell-graphics-definitions.js";
import { alignCanvasRect, type AxisTransform, type CharDeskNormalizedCellRect } from "./canvas-geometry.js";
import { traceCellGraphicCorner, traceCellGraphicPath } from "./cell-graphics-path.js";

export const CELL_GRAPHICS_VERSION = "xterm-box-block-v4";
const BOX_STROKE_SCALE = 1.5;

/** Only whole, single-codepoint structural cells bypass font shaping. */
export const resolveCharDeskCanvasGlyphSource = (text: string): "font" | "cell-graphics" =>
  /^[\u2500-\u259f]$/u.test(text) ? "cell-graphics" : "font";

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function drawCharDeskCellGraphic(
  ctx: Context, text: string, bounds: CharDeskNormalizedCellRect,
  zoom: number, transform?: AxisTransform,
): void {
  const definition = cellGraphicDefinitions[text];
  if (!definition) throw new Error(`Missing Cell graphic: ${text}`);
  const aligned = alignCanvasRect(bounds, transform);
  if (aligned.width <= 0 || aligned.height <= 0) return;
  const axis = transform && transform.b === 0 && transform.c === 0;
  const sx = axis ? Math.abs(transform.a) || 1 : 1;
  const sy = axis ? Math.abs(transform.d) || 1 : 1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(aligned.x, aligned.y, aligned.width, aligned.height);
  ctx.clip();
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  for (const part of Array.isArray(definition) ? definition : [definition]) {
    if (part.type === CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR) {
      // One nonzero fill unions overlapping rectangles without double alpha or internal seams.
      ctx.beginPath();
      for (const box of part.data) {
        const rect = alignCanvasRect({ x: bounds.x + box.x * bounds.width / 8,
          y: bounds.y + box.y * bounds.height / 8,
          width: box.w * bounds.width / 8, height: box.h * bounds.height / 8 }, transform);
        ctx.rect(rect.x, rect.y, rect.width, rect.height);
      }
      ctx.fill();
    } else if (part.type === CustomGlyphDefinitionType.BLOCK_PATTERN) {
      const width = Math.round(aligned.width * sx), height = Math.round(aligned.height * sy);
      const phaseX = Math.round(aligned.x * sx + (transform?.e ?? 0));
      const phaseY = Math.round(aligned.y * sy + (transform?.f ?? 0));
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        if (part.data[(y + phaseY) & 1]![(x + phaseX) & 1]) {
          ctx.fillRect(aligned.x + x / sx, aligned.y + y / sy, 1 / sx, 1 / sy);
        }
      }
    } else {
      ctx.lineWidth = Math.max(1, Math.round(part.strokeWidth * BOX_STROKE_SCALE * zoom * sx)) / sx;
      // Double-line centers need one clear device pixel between their stroke edges.
      const doubleLine = text >= "\u2550" && text <= "\u256c";
      const offsetX = doubleLine ? Math.max(zoom, (ctx.lineWidth + 1 / sx) / 2) : zoom;
      const offsetY = doubleLine ? Math.max(zoom, (ctx.lineWidth + 1 / sy) / 2) : zoom;
      ctx.save();
      // Rasterize uniform positive scales in device space: converting snapped centers
      // back through fractional Canvas transforms can reintroduce faint fringe pixels.
      const deviceSpace = axis && transform.a > 0 && transform.a === transform.d;
      let strokeBounds = aligned;
      if (deviceSpace) {
        strokeBounds = {
          x: Math.round(aligned.x * sx + (transform.e ?? 0)),
          y: Math.round(aligned.y * sy + (transform.f ?? 0)),
          width: Math.round(aligned.width * sx), height: Math.round(aligned.height * sy),
        };
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.lineWidth = Math.round(ctx.lineWidth * sx);
      }
      ctx.beginPath();
      if (part.type === CustomGlyphDefinitionType.ROUND_CORNER) {
        traceCellGraphicCorner(ctx, part, strokeBounds, ctx.lineWidth, deviceSpace ? undefined : transform);
      } else {
        const path = typeof part.data === "string" ? part.data : part.data(offsetX / aligned.width, offsetY / aligned.height);
        traceCellGraphicPath(ctx, path, strokeBounds, ctx.lineWidth, deviceSpace ? undefined : transform);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}
