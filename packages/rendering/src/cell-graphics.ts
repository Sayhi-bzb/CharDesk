import { cellGraphicDefinitions, CustomGlyphDefinitionType } from "./cell-graphics-definitions.js";
import { alignCanvasRect, type AxisTransform, type CharDeskNormalizedCellRect } from "./canvas-geometry.js";
import { traceCellGraphicCorner, traceCellGraphicPath } from "./cell-graphics-path.js";
import {
  CustomGlyphScaleType,
  CustomGlyphVectorType,
  type CustomGlyphDefinitionPart,
} from "./cell-graphics-types.js";

export const CELL_GRAPHICS_VERSION = "xterm-cell-graphics-v5";
const STRUCTURAL_STROKE_SCALE = 1.5;
const BRAILLE_DOTS = new Uint8Array([1, 0, 1, 2, 1, 4, 5, 0, 5, 2, 5, 4, 1, 6, 5, 6]);

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type CharDeskCellGraphicPresentation = Readonly<{
  fontSize?: number;
  backgroundColor?: string;
}>;

/** Only exact registered single-grapheme definitions bypass font shaping. */
export const resolveCharDeskCanvasGlyphSource = (text: string): "font" | "cell-graphics" =>
  cellGraphicDefinitions[text] === undefined ? "font" : "cell-graphics";

const partsOf = (text: string): readonly CustomGlyphDefinitionPart[] => {
  const definition = cellGraphicDefinitions[text];
  if (!definition) throw new Error(`Missing Cell graphic: ${text}`);
  return "type" in definition ? [definition] : definition;
};

function clipRect(ctx: Context, bounds: CharDeskNormalizedCellRect) {
  ctx.beginPath();
  ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.clip();
}

function resolveDrawBounds(
  part: CustomGlyphDefinitionPart,
  cellBounds: CharDeskNormalizedCellRect,
  fontSize: number,
  zoom: number,
  transform?: AxisTransform,
) {
  if (part.scaleType !== CustomGlyphScaleType.CHAR) return alignCanvasRect(cellBounds, transform);
  const height = Math.min(cellBounds.height, fontSize * zoom);
  return alignCanvasRect({
    x: cellBounds.x,
    y: cellBounds.y + (cellBounds.height - height) / 2,
    width: cellBounds.width,
    height,
  }, transform);
}

function drawOctants(ctx: Context, part: CustomGlyphDefinitionPart & { type: 0 },
  rawBounds: CharDeskNormalizedCellRect, transform?: AxisTransform) {
  const axis = transform && transform.b === 0 && transform.c === 0 && transform.a > 0 && transform.d > 0;
  const cellLeft = axis ? Math.round(rawBounds.x * transform.a + (transform.e ?? 0)) : 0;
  const cellRight = axis ? Math.round((rawBounds.x + rawBounds.width) * transform.a + (transform.e ?? 0)) : 0;
  const cellTop = axis ? Math.round(rawBounds.y * transform.d + (transform.f ?? 0)) : 0;
  const cellBottom = axis ? Math.round((rawBounds.y + rawBounds.height) * transform.d + (transform.f ?? 0)) : 0;
  ctx.beginPath();
  for (const box of part.data) {
    const source = {
      x: rawBounds.x + box.x * rawBounds.width / 8,
      y: rawBounds.y + box.y * rawBounds.height / 8,
      width: box.w * rawBounds.width / 8,
      height: box.h * rawBounds.height / 8,
    };
    const aligned = alignCanvasRect(source, transform);
    let { x, y, width, height } = aligned;
    // A Cell narrower than eight device pixels cannot give every octant a unique
    // partition. Keep a non-empty Unicode block visible by assigning its collapsed
    // interval the nearest in-cell pixel; overlapping parts are union-filled below.
    if (axis && width === 0 && cellRight > cellLeft) {
      const center = (source.x + source.width / 2) * transform.a + (transform.e ?? 0);
      const start = Math.max(cellLeft, Math.min(cellRight - 1, Math.floor(center)));
      x = (start - (transform.e ?? 0)) / transform.a;
      width = 1 / transform.a;
    }
    if (axis && height === 0 && cellBottom > cellTop) {
      const center = (source.y + source.height / 2) * transform.d + (transform.f ?? 0);
      const start = Math.max(cellTop, Math.min(cellBottom - 1, Math.floor(center)));
      y = (start - (transform.f ?? 0)) / transform.d;
      height = 1 / transform.d;
    }
    ctx.rect(x, y, width, height);
  }
  ctx.fill();
}

function drawPattern(ctx: Context, pattern: number[][], bounds: CharDeskNormalizedCellRect,
  transform?: AxisTransform) {
  const axis = transform && transform.b === 0 && transform.c === 0;
  const sx = axis ? Math.abs(transform.a) || 1 : 1;
  const sy = axis ? Math.abs(transform.d) || 1 : 1;
  const width = Math.round(bounds.width * sx), height = Math.round(bounds.height * sy);
  const phaseX = Math.round(bounds.x * sx + (transform?.e ?? 0));
  const phaseY = Math.round(bounds.y * sy + (transform?.f ?? 0));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const row = pattern[((y + phaseY) % pattern.length + pattern.length) % pattern.length]!;
    const column = ((x + phaseX) % row.length + row.length) % row.length;
    if (row[column]) {
      ctx.fillRect(bounds.x + x / sx, bounds.y + y / sy, 1 / sx, 1 / sy);
    }
  }
}

function drawBraille(ctx: Context, pattern: number, bounds: CharDeskNormalizedCellRect) {
  const xEighth = bounds.width / 8;
  const paddingY = bounds.height * 0.1;
  const yEighth = bounds.height * 0.8 / 8;
  const radius = Math.min(xEighth, yEighth);
  for (let bit = 0; bit < 8; bit++) if (pattern & (1 << bit)) {
    const x = BRAILLE_DOTS[bit * 2]!, y = BRAILLE_DOTS[bit * 2 + 1]!;
    ctx.beginPath();
    ctx.arc(bounds.x + (x + 1) * xEighth, bounds.y + paddingY + (y + 1) * yEighth,
      radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function structuralLineWidth(strokeWidth: number, zoom: number, transform?: AxisTransform) {
  const axis = transform && transform.b === 0 && transform.c === 0;
  const sx = axis ? Math.abs(transform.a) || 1 : 1;
  return Math.max(1, Math.round(strokeWidth * STRUCTURAL_STROKE_SCALE * zoom * sx)) / sx;
}

function drawPathPart(ctx: Context, text: string, part: CustomGlyphDefinitionPart,
  bounds: CharDeskNormalizedCellRect, zoom: number, transform?: AxisTransform) {
  const width = part.strokeWidth === undefined ? Math.max(1, zoom) : structuralLineWidth(part.strokeWidth, zoom, transform);
  ctx.lineWidth = width;
  let path = "data" in part && typeof part.data === "string" ? part.data : "";
  if (part.type === CustomGlyphDefinitionType.PATH_FUNCTION && typeof part.data === "function") {
    const doubleLine = text >= "\u2550" && text <= "\u256c";
    const axis = transform && transform.b === 0 && transform.c === 0;
    const sx = axis ? Math.abs(transform.a) || 1 : 1;
    const sy = axis ? Math.abs(transform.d) || 1 : 1;
    const offsetX = doubleLine ? Math.max(zoom, (width + 1 / sx) / 2) : zoom;
    const offsetY = doubleLine ? Math.max(zoom, (width + 1 / sy) / 2) : zoom;
    path = part.data(offsetX / bounds.width, offsetY / bounds.height);
  }
  const axis = transform && transform.b === 0 && transform.c === 0;
  const deviceSpace = !!axis && transform.a > 0 && transform.a === transform.d && part.strokeWidth !== undefined;
  const scale = deviceSpace ? transform.a : 1;
  const strokeBounds = deviceSpace ? {
    x: Math.round(bounds.x * scale + (transform.e ?? 0)),
    y: Math.round(bounds.y * scale + (transform.f ?? 0)),
    width: Math.round(bounds.width * scale),
    height: Math.round(bounds.height * scale),
  } : bounds;
  ctx.save();
  if (deviceSpace) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.lineWidth = Math.round(width * scale);
  }
  ctx.beginPath();
  if (part.type === CustomGlyphDefinitionType.ROUND_CORNER) {
    traceCellGraphicCorner(ctx, part, strokeBounds, ctx.lineWidth, deviceSpace ? undefined : transform);
  } else {
    traceCellGraphicPath(ctx, path, strokeBounds, ctx.lineWidth,
      deviceSpace ? undefined : transform, part.strokeWidth !== undefined);
  }
  if (part.strokeWidth === undefined) ctx.fill();
  else ctx.stroke();
  ctx.restore();
}

function drawVector(ctx: Context, part: CustomGlyphDefinitionPart & { type: 4 | 5 },
  bounds: CharDeskNormalizedCellRect, fontSize: number, zoom: number, backgroundColor?: string) {
  const vector = part.data;
  const lineWidth = Math.max(1, fontSize * zoom / 12);
  const left = (vector.leftPadding ?? 0) * lineWidth / 2;
  const right = (vector.rightPadding ?? 0) * lineWidth / 2;
  const padded = { x: bounds.x + left, y: bounds.y, width: bounds.width - left - right, height: bounds.height };
  ctx.save();
  if (part.type === CustomGlyphDefinitionType.PATH_NEGATIVE) {
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    if (backgroundColor) ctx.fillStyle = ctx.strokeStyle = backgroundColor;
    ctx.lineCap = "square";
  }
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  traceCellGraphicPath(ctx, vector.d, padded, lineWidth, undefined, false);
  if (vector.type === CustomGlyphVectorType.STROKE) ctx.stroke();
  else ctx.fill();
  ctx.restore();
}

export function drawCharDeskCellGraphic(
  ctx: Context, text: string, bounds: CharDeskNormalizedCellRect,
  zoom: number, transform?: AxisTransform, presentation: CharDeskCellGraphicPresentation = {},
): void {
  const alignedCell = alignCanvasRect(bounds, transform);
  if (alignedCell.width <= 0 || alignedCell.height <= 0) return;
  const fontSize = presentation.fontSize ?? 15;
  ctx.save();
  clipRect(ctx, alignedCell);
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  for (const part of partsOf(text)) {
    const drawBounds = resolveDrawBounds(part, bounds, fontSize, zoom, transform);
    ctx.save();
    if (part.clipPath) {
      ctx.beginPath();
      traceCellGraphicPath(ctx, part.clipPath, drawBounds, 1, undefined, false);
      ctx.clip();
    }
    switch (part.type) {
      case CustomGlyphDefinitionType.SOLID_OCTANT_BLOCK_VECTOR:
        drawOctants(ctx, part, drawBounds, transform);
        break;
      case CustomGlyphDefinitionType.BLOCK_PATTERN: drawPattern(ctx, part.data, drawBounds, transform); break;
      case CustomGlyphDefinitionType.BRAILLE: drawBraille(ctx, part.data, drawBounds); break;
      case CustomGlyphDefinitionType.PATH_FUNCTION:
      case CustomGlyphDefinitionType.PATH:
      case CustomGlyphDefinitionType.ROUND_CORNER:
        drawPathPart(ctx, text, part, drawBounds, zoom, transform); break;
      case CustomGlyphDefinitionType.PATH_NEGATIVE:
      case CustomGlyphDefinitionType.VECTOR_SHAPE:
        drawVector(ctx, part, drawBounds, fontSize, zoom, presentation.backgroundColor); break;
    }
    ctx.restore();
  }
  ctx.restore();
}
