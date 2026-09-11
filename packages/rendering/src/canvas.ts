import {
  CHARDESK_SYSTEM_FONT_PROFILE,
  type CharDeskFontCapability,
  type CharDeskResolvedFontBoldStrategy,
  type CharDeskFontProfile,
} from "@chardesk/fonts";
import { getGraphemeCellWidth, type CharDeskTextAttributes } from "@chardesk/protocol";
import { type CellFrame, type CellPoint, type CellRect } from "@chardesk/cell-core";
import type {
  CharDeskCellCursorPaintStyle,
  CharDeskCellFrameCell,
  CharDeskCellMetrics,
  CharDeskCellRangeGeometry,
  CharDeskCellRangePaintStyle,
  CharDeskCellRangePhase,
  CharDeskCellVisual,
  CharDeskRenderFontRoute,
  CharDeskRenderModel,
} from "./index.js";
import { DEFAULT_CHARDESK_CELL_METRICS } from "./metrics.js";
import { resolveCharDeskFontRoute } from "./index.js";
import { drawCharDeskCellGraphic, resolveCharDeskCanvasGlyphSource } from "./cell-graphics.js";
export { CELL_GRAPHICS_VERSION, resolveCharDeskCanvasGlyphSource } from "./cell-graphics.js";
import {
  alignCanvasRect,
  type AxisTransform,
} from "./canvas-geometry.js";
export { alignCanvasRect as alignCharDeskCanvasRect } from "./canvas-geometry.js";
export type { CharDeskFontProfile } from "@chardesk/fonts";

export type CharDeskCanvasSurface = HTMLCanvasElement | OffscreenCanvas;
export type CharDeskCanvasContext =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export type CharDeskCanvasPalette = {
  color: string;
  background: string;
};

export type CharDeskCanvasFontAvailability = Record<
  CharDeskRenderFontRoute,
  boolean
>;

export type CharDeskCanvasFontFamilies = Record<
  CharDeskRenderFontRoute,
  { regular: string; bold?: string }
>;

export type CharDeskCanvasFontResolver = (input: {
  grapheme: string;
  route: CharDeskRenderFontRoute;
  /** True only when the resolved strategy requests a native bold face. */
  bold: boolean;
  italic: boolean;
}) => string | undefined;

export type CharDeskCanvasResolvedFontFace = Readonly<{
  capability: CharDeskFontCapability;
  family: string;
  fontSizeScale: number;
  baselineShiftEm: number;
  boldStrategy: CharDeskResolvedFontBoldStrategy;
  boldOverdrawEm: number;
}>;

export type CharDeskCanvasCellDrawOptions = {
  color?: string;
  underline?: boolean;
  zoom?: number;
  metrics?: CharDeskCellMetrics;
  palette?: CharDeskCanvasPalette;
  fontAvailability?: CharDeskCanvasFontAvailability;
  fontProfile?: CharDeskFontProfile;
  fontFamilies?: CharDeskCanvasFontFamilies;
  fontResolver?: CharDeskCanvasFontResolver;
};

export type CharDeskCanvasCellDrawEntry = {
  cell: CharDeskCellVisual;
  x: number;
  y: number;
  options?: CharDeskCanvasCellDrawOptions;
  drawBackground?: boolean;
  drawText?: boolean;
};

export type CharDeskCanvasCellVisual = CharDeskCellVisual & {
  color: string;
};

export type CharDeskCanvasCursorEntry = Readonly<{
  cell: CharDeskCellVisual;
  x: number;
  y: number;
  style: CharDeskCellCursorPaintStyle;
  options?: CharDeskCanvasCellDrawOptions;
  drawText?: boolean;
}>;

export type CharDeskCanvasRangeOptions = Readonly<{
  metrics?: CharDeskCellMetrics;
  offset?: CellPoint;
  zoom?: number;
  clipRegions?: readonly CellRect[];
}>;

export type CharDeskCanvasRangeEntry = Readonly<{
  geometry: CharDeskCellRangeGeometry;
  phase: CharDeskCellRangePhase;
  style: CharDeskCellRangePaintStyle;
  options?: CharDeskCanvasRangeOptions;
}>;

export type CharDeskCanvasRangeBackdropEntry = Readonly<{
  geometry: CharDeskCellRangeGeometry;
  source: CanvasImageSource;
  width: number;
  height: number;
  options?: CharDeskCanvasRangeOptions;
}>;

export type CharDeskCanvasDocumentOptions = {
  metrics?: CharDeskCellMetrics;
  palette: CharDeskCanvasPalette;
  padding?: number;
  zoom?: number;
  fontAvailability?: CharDeskCanvasFontAvailability;
  fontProfile?: CharDeskFontProfile;
  fontFamilies?: CharDeskCanvasFontFamilies;
  fontResolver?: CharDeskCanvasFontResolver;
};

export type CharDeskCanvasDocumentLayout = {
  width: number;
  height: number;
  padding: number;
  metrics: CharDeskCellMetrics;
};

export type CharDeskCanvasFontSample =
  | string
  | { grapheme: string; bold?: boolean; italic?: boolean };

export type CharDeskCanvasFontLoadOptions = Readonly<{
  metrics?: CharDeskCellMetrics;
  fontProfile?: CharDeskFontProfile;
  fontFamilies?: CharDeskCanvasFontFamilies;
  fontResolver?: CharDeskCanvasFontResolver;
}>;

export const DEFAULT_CHARDESK_CANVAS_FONT_AVAILABILITY: CharDeskCanvasFontAvailability = {
  text: true,
  emoji: true,
};

const DEFAULT_PALETTE: CharDeskCanvasPalette = {
  color: "#000000",
  background: "#ffffff",
};

export const getCharDeskCanvasFont = (
  metrics: CharDeskCellMetrics = DEFAULT_CHARDESK_CELL_METRICS,
  zoom = 1,
  options?: {
    bold?: boolean;
    italic?: boolean;
    route?: CharDeskRenderFontRoute;
    fontFamily?: string;
    fontSizeScale?: number;
    boldStrategy?: CharDeskResolvedFontBoldStrategy;
    /** @deprecated Use boldStrategy. */
    weightPolicy?: "inherit" | "regular";
  }
) => {
  const route = options?.route ?? "text";
  const fontFamily = options?.fontFamily ?? (route === "emoji"
    ? CHARDESK_SYSTEM_FONT_PROFILE.families.emoji
    : metrics.fontFamily);
  const bold = options?.bold && (options.boldStrategy !== undefined
    ? options.boldStrategy === "native"
    : options.weightPolicy !== "regular");
  return `${options?.italic ? "italic " : ""}${bold ? "700 " : ""}${
    metrics.fontSize * (options?.fontSizeScale ?? 1) * zoom
  }px ${fontFamily}`;
};

export const resolveCharDeskCanvasFontFace = (input: Readonly<{
  grapheme: string;
  capabilityGrapheme?: string;
  route: CharDeskRenderFontRoute;
  bold: boolean;
  italic: boolean;
  fontProfile?: CharDeskFontProfile;
  fontFamilies?: CharDeskCanvasFontFamilies;
  fontResolver?: CharDeskCanvasFontResolver;
}>): CharDeskCanvasResolvedFontFace => {
  const profile = input.fontProfile ?? CHARDESK_SYSTEM_FONT_PROFILE;
  const capability = profile.resolveCapability(
    input.capabilityGrapheme ?? input.grapheme
  );
  const spec = profile.capabilities[capability];
  const routeFamilies = input.fontFamilies?.[input.route];
  const effectiveBold = input.bold && spec.boldStrategy === "native";
  const profileFamily = effectiveBold
    ? spec.families.bold ?? spec.families.regular
    : spec.families.regular;
  const family = input.fontResolver?.({
    grapheme: input.grapheme,
    route: input.route,
    bold: effectiveBold,
    italic: input.italic,
  }) ?? (effectiveBold
    ? routeFamilies?.bold ?? routeFamilies?.regular
    : routeFamilies?.regular) ?? profileFamily;
  return {
    capability,
    family,
    fontSizeScale: spec.fontSizeScale ?? 1,
    baselineShiftEm: spec.baselineShiftEm ?? 0,
    boldStrategy: spec.boldStrategy,
    boldOverdrawEm: spec.boldOverdrawEm,
  };
};

export type CharDeskFontMeasurement = Readonly<{
  metrics: CharDeskCellMetrics;
  source: "font-bounds" | "glyph-bounds" | "calibrated";
  /** Uncalibrated regular-face geometry, before Profile grid overrides. */
  fontMetrics: CharDeskCellMetrics;
  fontMetricsSource: "font-bounds" | "glyph-bounds";
}>;

/** Measure a loaded display face. Content and DPR never participate in grid sizing. */
export const measureCharDeskCanvasFont = (
  context: Pick<CharDeskCanvasContext, "save" | "restore" | "measureText" | "font" | "textBaseline">,
  fontProfile: CharDeskFontProfile = CHARDESK_SYSTEM_FONT_PROFILE,
  fontSize = DEFAULT_CHARDESK_CELL_METRICS.fontSize
): CharDeskFontMeasurement => {
  if (!Number.isFinite(fontSize) || fontSize <= 0) throw new RangeError("Font size must be positive.");
  const face = resolveCharDeskCanvasFontFace({ grapheme: "0", route: "text", bold: false, italic: false, fontProfile });
  const effectiveSize = fontSize * face.fontSizeScale;
  const calibration = fontProfile.capabilities.display.cellMetrics;
  context.save();
  try {
    context.font = getCharDeskCanvasFont({ ...DEFAULT_CHARDESK_CELL_METRICS, fontSize }, 1, {
      fontFamily: face.family, fontSizeScale: face.fontSizeScale,
    });
    context.textBaseline = "alphabetic";
    const width = context.measureText("0").width;
    const sample = context.measureText("Mg");
    const fontBounds = Number.isFinite(sample.fontBoundingBoxAscent)
      && Number.isFinite(sample.fontBoundingBoxDescent)
      && sample.fontBoundingBoxAscent + sample.fontBoundingBoxDescent > 0;
    const ascent = fontBounds ? sample.fontBoundingBoxAscent : sample.actualBoundingBoxAscent;
    const descent = fontBounds ? sample.fontBoundingBoxDescent : sample.actualBoundingBoxDescent;
    const cellWidth = calibration?.width === undefined ? width : calibration.width * effectiveSize;
    const cellHeight = calibration?.height === undefined ? ascent + descent : calibration.height * effectiveSize;
    // prepareFontGlyph already applies the face's baseline shift.
    const baseline = calibration?.baseline === undefined
      ? ascent - face.baselineShiftEm * effectiveSize : calibration.baseline * effectiveSize;
    if (![cellWidth, cellHeight].every((value) => Number.isFinite(value) && value > 0)
      || !Number.isFinite(baseline)) throw new RangeError("Font produced invalid Cell metrics.");
    return {
      metrics: { cellWidth, cellHeight, baseline, fontSize, fontFamily: face.family },
      source: calibration ? "calibrated" : fontBounds ? "font-bounds" : "glyph-bounds",
      fontMetrics: { cellWidth: width, cellHeight: ascent + descent,
        baseline: ascent - face.baselineShiftEm * effectiveSize, fontSize, fontFamily: face.family },
      fontMetricsSource: fontBounds ? "font-bounds" : "glyph-bounds",
    };
  } finally {
    context.restore();
  }
};

export type CharDeskFontAuditSample = Readonly<{
  text: string;
  requestedFamily: string;
  requestedBold: boolean;
  effectiveBold: boolean;
  status: "measured" | "unavailable";
  advance: number | null;
  availableWidth: number;
  advanceOverflow: number | null;
  inkLeft: number | null;
  inkRight: number | null;
  overflowLeft: number | null;
  overflowRight: number | null;
  top: number | null;
  bottom: number | null;
  overflowTop: number | null;
  overflowBottom: number | null;
  /** Geometric estimate for repeated full-height │/█, not a raster guarantee. */
  verticalGap: number | null;
}>;

export type CharDeskFontAudit = Readonly<{
  measurement: CharDeskFontMeasurement;
  metrics: CharDeskCellMetrics;
  /** Canvas cannot identify which fallback face supplied an individual glyph. */
  faceIdentity: "requested-stack-only";
  samples: readonly CharDeskFontAuditSample[];
}>;

/** Audit explicitly loaded samples without modifying the supplied grid. */
export const auditCharDeskCanvasFont = (
  context: Pick<CharDeskCanvasContext, "save" | "restore" | "measureText" | "font" | "textBaseline">,
  profile: CharDeskFontProfile,
  metrics: CharDeskCellMetrics,
  samples: Iterable<CharDeskCanvasFontSample>
): CharDeskFontAudit => {
  if (![metrics.cellWidth, metrics.cellHeight, metrics.fontSize].every((n) => Number.isFinite(n) && n > 0)
    || (metrics.baseline !== undefined && !Number.isFinite(metrics.baseline))) {
    throw new RangeError("Invalid audit grid metrics.");
  }
  const measurement = measureCharDeskCanvasFont(context, profile, metrics.fontSize);
  const result: CharDeskFontAuditSample[] = [];
  context.save();
  try {
    context.textBaseline = metrics.baseline === undefined ? "middle" : "alphabetic";
    for (const sample of samples) {
      const text = typeof sample === "string" ? sample : sample.grapheme;
      const bold = typeof sample === "string" ? false : !!sample.bold;
      const italic = typeof sample === "string" ? false : !!sample.italic;
      const route = resolveCharDeskFontRoute(text);
      const face = resolveCharDeskCanvasFontFace({ grapheme: text, route, bold, italic, fontProfile: profile });
      context.font = getCharDeskCanvasFont(metrics, 1, { bold, italic, route,
        fontFamily: face.family, fontSizeScale: face.fontSizeScale, boldStrategy: face.boldStrategy });
      const bounds = context.measureText(text);
      const availableWidth = getGraphemeCellWidth(text) * metrics.cellWidth;
      const measured = [bounds.width, bounds.actualBoundingBoxAscent, bounds.actualBoundingBoxDescent].every(Number.isFinite);
      const baseline = (metrics.baseline ?? metrics.cellHeight / 2)
        + face.baselineShiftEm * metrics.fontSize * face.fontSizeScale;
      const advance = measured ? bounds.width : null;
      const overdrawWidth = bold && face.boldStrategy === "overdraw"
        ? face.boldOverdrawEm * metrics.fontSize * face.fontSizeScale
        : 0;
      const leftExtent = measured
        ? (Number.isFinite(bounds.actualBoundingBoxLeft) ? bounds.actualBoundingBoxLeft : bounds.width / 2)
        : null;
      const rightExtent = measured
        ? (Number.isFinite(bounds.actualBoundingBoxRight) ? bounds.actualBoundingBoxRight : bounds.width / 2) + overdrawWidth
        : null;
      const inkLeft = leftExtent === null ? null : availableWidth / 2 - leftExtent;
      const inkRight = rightExtent === null ? null : availableWidth / 2 + rightExtent;
      const top = measured ? baseline - bounds.actualBoundingBoxAscent : null;
      const bottom = measured ? baseline + bounds.actualBoundingBoxDescent : null;
      result.push({ text, requestedFamily: face.family, requestedBold: bold,
        effectiveBold: bold && face.boldStrategy === "native", status: measured ? "measured" : "unavailable",
        advance, availableWidth, advanceOverflow: advance === null ? null : Math.max(0, advance - availableWidth),
        inkLeft, inkRight,
        overflowLeft: inkLeft === null ? null : Math.max(0, -inkLeft),
        overflowRight: inkRight === null ? null : Math.max(0, inkRight - availableWidth),
        top, bottom, overflowTop: top === null ? null : Math.max(0, -top),
        overflowBottom: bottom === null ? null : Math.max(0, bottom - metrics.cellHeight),
        verticalGap: measured && (text === "│" || text === "█")
          ? metrics.cellHeight - bounds.actualBoundingBoxAscent - bounds.actualBoundingBoxDescent : null });
    }
  } finally {
    context.restore();
  }
  return { measurement, metrics: { ...metrics }, faceIdentity: "requested-stack-only", samples: result };
};

export const alignCharDeskCanvasCoordinate = (
  value: number,
  lineWidth = 1
) => {
  const rounded = Math.round(value);
  return lineWidth % 2 === 1 ? rounded + 0.5 : rounded;
};

export const getCharDeskCanvasCellAnchor = (
  x: number,
  y: number,
  width: 1 | 2,
  zoom = 1,
  metrics: CharDeskCellMetrics = DEFAULT_CHARDESK_CELL_METRICS
) => ({
  x: x + metrics.cellWidth * zoom * width / 2,
  y: y + (metrics.baseline ?? metrics.cellHeight / 2) * zoom,
});

export const prepareCharDeskCanvasSurface = (
  canvas: CharDeskCanvasSurface,
  ctx: CharDeskCanvasContext,
  width: number,
  height: number,
  dpr: number
) => {
  const targetWidth = Math.round(width * dpr);
  const targetHeight = Math.round(height * dpr);
  if ("style" in canvas) {
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, targetWidth, targetHeight);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};

export const resolveCharDeskCanvasCellVisual = (
  cell: CharDeskCellVisual,
  palette: CharDeskCanvasPalette = DEFAULT_PALETTE
): CharDeskCanvasCellVisual => {
  const color = cell.color ?? palette.color;
  if (!cell.attrs?.inverse) {
    return cell.color ? cell as CharDeskCanvasCellVisual : { ...cell, color };
  }
  return {
    ...cell,
    color: cell.bgColor ?? palette.background,
    bgColor: color,
  };
};

const drawDecoration = (
  ctx: CharDeskCanvasContext,
  x: number,
  y: number,
  width: number,
  color: string,
  lineWidth: number
) => {
  const lineY = alignCharDeskCanvasCoordinate(y, lineWidth);
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.moveTo(x, lineY);
  ctx.lineTo(x + width, lineY);
  ctx.stroke();
};

const drawCellBackground = (
  ctx: CharDeskCanvasContext,
  entry: CharDeskCanvasCellDrawEntry,
  visual: CharDeskCanvasCellVisual,
  previousColor: string | null,
  transform?: AxisTransform
) => {
  const options = entry.options;
  const metrics = options?.metrics ?? DEFAULT_CHARDESK_CELL_METRICS;
  const zoom = options?.zoom ?? 1;
  if (!visual.bgColor) return previousColor;
  if (visual.bgColor !== previousColor) ctx.fillStyle = visual.bgColor;
  const bounds = { x: entry.x, y: entry.y, width: metrics.cellWidth * zoom * entry.cell.width, height: metrics.cellHeight * zoom };
  const aligned = alignCanvasRect(bounds, transform);
  ctx.fillRect(aligned.x, aligned.y, aligned.width, aligned.height);
  return visual.bgColor;
};

type CanvasTextState = {
  font: string | null;
  color: string | null;
  transform?: AxisTransform;
};

const prepareFontGlyph = (
  ctx: CharDeskCanvasContext,
  entry: CharDeskCanvasCellDrawEntry,
  visual: CharDeskCanvasCellVisual,
  state: CanvasTextState
) => {
  const options = entry.options;
  const metrics = options?.metrics ?? DEFAULT_CHARDESK_CELL_METRICS;
  const zoom = options?.zoom ?? 1;
  const availability = options?.fontAvailability ??
    DEFAULT_CHARDESK_CANVAS_FONT_AVAILABILITY;
  const attrs: CharDeskTextAttributes | undefined = visual.attrs;
  const route = visual.fontRoute;
  const text = route === "emoji" && !availability.emoji ? "□" : visual.text;
  const face = resolveCharDeskCanvasFontFace({
    grapheme: text,
    capabilityGrapheme: visual.text,
    route,
    bold: !!attrs?.bold,
    italic: !!attrs?.italic,
    ...(options?.fontProfile ? { fontProfile: options.fontProfile } : {}),
    ...(options?.fontFamilies ? { fontFamilies: options.fontFamilies } : {}),
    ...(options?.fontResolver ? { fontResolver: options.fontResolver } : {}),
  });
  const anchor = getCharDeskCanvasCellAnchor(
    entry.x,
    entry.y,
    visual.width,
    zoom,
    metrics
  );

  const font = getCharDeskCanvasFont(metrics, zoom, {
    bold: !!attrs?.bold,
    italic: !!attrs?.italic,
    route,
    fontFamily: face.family,
    fontSizeScale: face.fontSizeScale,
    boldStrategy: face.boldStrategy,
  });
  if (font !== state.font) {
    ctx.font = font;
    state.font = font;
  }
  return {
    text,
    // Glyph positions preserve grid spacing; only allocation edges are pixel-aligned.
    x: anchor.x,
    y: anchor.y + face.baselineShiftEm * metrics.fontSize * face.fontSizeScale * zoom,
    boldOverdrawX: attrs?.bold && face.boldStrategy === "overdraw"
      ? face.boldOverdrawEm * metrics.fontSize * face.fontSizeScale * zoom
      : 0,
  };
};

const drawPreparedFontGlyph = (
  ctx: CharDeskCanvasContext,
  glyph: ReturnType<typeof prepareFontGlyph>
) => {
  const drawAt = (offsetX: number) => {
    ctx.fillText(glyph.text, glyph.x + offsetX, glyph.y);
  };
  drawAt(0);
  if (glyph.boldOverdrawX > 0) drawAt(glyph.boldOverdrawX);
};

const drawCellText = (
  ctx: CharDeskCanvasContext,
  entry: CharDeskCanvasCellDrawEntry,
  visual: CharDeskCanvasCellVisual,
  state: CanvasTextState
) => {
  const options = entry.options;
  const metrics = options?.metrics ?? DEFAULT_CHARDESK_CELL_METRICS;
  const zoom = options?.zoom ?? 1;
  ctx.textBaseline = metrics.baseline === undefined ? "middle" : "alphabetic";
  const attrs = visual.attrs;
  const textColor = options?.color ?? visual.color;
  if (textColor !== state.color) {
    ctx.fillStyle = textColor;
    state.color = textColor;
  }
  if (resolveCharDeskCanvasGlyphSource(visual.text) === "cell-graphics") {
    drawCharDeskCellGraphic(ctx, visual.text, {
      x: entry.x, y: entry.y, width: metrics.cellWidth * zoom * visual.width, height: metrics.cellHeight * zoom,
    }, zoom, state.transform, {
      fontSize: metrics.fontSize,
      backgroundColor: visual.bgColor ?? options?.palette?.background ?? DEFAULT_PALETTE.background,
    });
  } else {
    const fontGlyph = prepareFontGlyph(ctx, entry, visual, state);
    drawPreparedFontGlyph(ctx, fontGlyph);
  }

  const cellWidth = metrics.cellWidth * zoom * visual.width;
  const cellHeight = metrics.cellHeight * zoom;
  const lineWidth = Math.max(1, Math.round(zoom));
  const decorationColor = textColor;
  if (attrs?.underline || options?.underline) {
    drawDecoration(
      ctx,
      entry.x,
      entry.y + cellHeight * 0.82,
      cellWidth,
      decorationColor,
      lineWidth
    );
  }
  if (attrs?.strike) {
    drawDecoration(
      ctx,
      entry.x,
      entry.y + cellHeight * 0.54,
      cellWidth,
      decorationColor,
      lineWidth
    );
  }
};

export const drawCharDeskCanvasCells = (
  ctx: CharDeskCanvasContext,
  entries: readonly CharDeskCanvasCellDrawEntry[]
) => {
  ctx.save();
  const visuals = new Array<CharDeskCanvasCellVisual>(entries.length);
  const transform = ctx.getTransform?.();
  let backgroundColor: string | null = null;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    const visual = resolveCharDeskCanvasCellVisual(
      entry.cell,
      entry.options?.palette ?? DEFAULT_PALETTE
    );
    visuals[index] = visual;
    if (entry.drawBackground !== false) {
      backgroundColor = drawCellBackground(ctx, entry, visual, backgroundColor, transform);
    }
  }
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const textState: CanvasTextState = {
    font: null,
    color: null,
    transform,
  };
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    if (entry.drawText !== false) {
      drawCellText(ctx, entry, visuals[index]!, textState);
    }
  }
  ctx.restore();
};

/** Draws a terminal-style cursor without changing the underlying Cell value. */
export const drawCharDeskCanvasCursor = (
  ctx: CharDeskCanvasContext,
  entry: CharDeskCanvasCursorEntry
) => {
  const { cell, style, options } = entry;
  if (style.shape === "block") {
    drawCharDeskCanvasCells(ctx, [{
      cell: {
        ...cell,
        color: style.textColor,
        bgColor: style.color,
        ...(cell.attrs ? { attrs: { ...cell.attrs, inverse: undefined } } : {}),
      },
      x: entry.x,
      y: entry.y,
      options,
      drawBackground: true,
      drawText: entry.drawText !== false,
    }]);
    return;
  }

  const metrics = options?.metrics ?? DEFAULT_CHARDESK_CELL_METRICS;
  const zoom = options?.zoom ?? 1;
  const thickness = Math.max(1, Math.round(zoom));
  const logical = style.shape === "bar"
    ? {
        x: entry.x,
        y: entry.y,
        width: thickness,
        height: metrics.cellHeight * zoom,
      }
    : {
        x: entry.x,
        y: entry.y + metrics.cellHeight * zoom - thickness,
        width: metrics.cellWidth * zoom * cell.width,
        height: thickness,
      };
  const aligned = alignCanvasRect(logical, ctx.getTransform?.());
  ctx.save();
  ctx.fillStyle = style.color;
  ctx.fillRect(aligned.x, aligned.y, aligned.width, aligned.height);
  ctx.restore();
};

const createCanvasRangeBoundary = (
  ctx: CharDeskCanvasContext,
  options?: CharDeskCanvasRangeOptions
) => {
  const metrics = options?.metrics ?? DEFAULT_CHARDESK_CELL_METRICS;
  const offset = options?.offset ?? { x: 0, y: 0 };
  const zoom = options?.zoom ?? 1;
  const transform = ctx.getTransform?.();
  return (point: CellPoint) => alignCanvasRect({
    x: point.x * metrics.cellWidth * zoom + offset.x,
    y: point.y * metrics.cellHeight * zoom + offset.y,
    width: 0,
    height: 0,
  }, transform);
};

const traceCanvasRangePath = (
  ctx: CharDeskCanvasContext,
  geometry: CharDeskCellRangeGeometry,
  boundary: ReturnType<typeof createCanvasRangeBoundary>
) => {
  ctx.beginPath();
  for (const polygon of geometry.polygons) {
    for (const ring of polygon.rings) {
      ring.forEach((point, index) => {
        const position = boundary(point);
        if (index === 0) ctx.moveTo(position.x, position.y);
        else ctx.lineTo(position.x, position.y);
      });
      ctx.closePath();
    }
  }
};

const clipCanvasRangeRegions = (
  ctx: CharDeskCanvasContext,
  clipRegions: readonly CellRect[] | undefined,
  boundary: ReturnType<typeof createCanvasRangeBoundary>
) => {
  if (!clipRegions) return;
  ctx.beginPath();
  for (const region of clipRegions) {
    const topLeft = boundary({ x: region.x, y: region.y });
    const bottomRight = boundary({
      x: region.x + region.width,
      y: region.y + region.height,
    });
    ctx.rect(
      topLeft.x,
      topLeft.y,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y
    );
  }
  ctx.clip();
};

/** Seeds a transparent overlay with the pixels a contrast Range must adapt against. */
export const drawCharDeskCanvasRangeBackdrop = (
  ctx: CharDeskCanvasContext,
  entry: CharDeskCanvasRangeBackdropEntry
) => {
  if (entry.geometry.polygons.length === 0 || entry.options?.clipRegions?.length === 0) return;
  const boundary = createCanvasRangeBoundary(ctx, entry.options);
  ctx.save();
  clipCanvasRangeRegions(ctx, entry.options?.clipRegions, boundary);
  traceCanvasRangePath(ctx, entry.geometry, boundary);
  ctx.clip("evenodd");
  ctx.drawImage(entry.source, 0, 0, entry.width, entry.height);
  ctx.restore();
};

/** Draws a Cell-coordinate Range without coupling rendering to selection state. */
export const drawCharDeskCanvasRange = (
  ctx: CharDeskCanvasContext,
  entry: CharDeskCanvasRangeEntry
) => {
  if (entry.geometry.polygons.length === 0 || entry.options?.clipRegions?.length === 0) return;
  const zoom = entry.options?.zoom ?? 1;
  const boundary = createCanvasRangeBoundary(ctx, entry.options);
  ctx.save();
  clipCanvasRangeRegions(ctx, entry.options?.clipRegions, boundary);
  traceCanvasRangePath(ctx, entry.geometry, boundary);
  ctx.fillStyle = entry.style.surface;
  if (entry.style.surfaceEffect === "contrast") {
    ctx.globalCompositeOperation = "difference";
  }
  ctx.fill("evenodd");
  if (entry.style.surfaceEffect === "contrast") {
    // Range borders are ordinary Host chrome even when the surface is adaptive.
    ctx.globalCompositeOperation = "source-over";
  }
  if (entry.phase === "moving") {
    ctx.strokeStyle = entry.style.border;
    ctx.lineWidth = Math.max(1, Math.round(2 * zoom));
    ctx.stroke();
  }
  ctx.restore();
};

export type CharDeskCanvasFrameOptions = Readonly<{
  metrics?: CharDeskCellMetrics;
  palette: CharDeskCanvasPalette;
  offset?: CellPoint;
  zoom?: number;
  content?: "all" | "background" | "text";
  queryOverscan?: Readonly<{
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  }>;
  fontAvailability?: CharDeskCanvasFontAvailability;
  fontProfile?: CharDeskFontProfile;
  fontFamilies?: CharDeskCanvasFontFamilies;
  fontResolver?: CharDeskCanvasFontResolver;
  underline?: (x: number, y: number, cell: CharDeskCellFrameCell) => boolean;
}>;

export type CharDeskCanvasFrameResult = Readonly<{
  cells: number;
  glyphs: number;
}>;

const intersectsAnyCellRect = (
  x: number,
  y: number,
  width: number,
  regions: readonly CellRect[]
) => regions.some((region) =>
  x + width > region.x &&
  x < region.x + region.width &&
  y >= region.y &&
  y < region.y + region.height
);

export const presentCharDeskCellFrame = (
  ctx: CharDeskCanvasContext,
  frame: CellFrame<CharDeskCellFrameCell>,
  options: CharDeskCanvasFrameOptions
): CharDeskCanvasFrameResult => {
  const metrics = options.metrics ?? DEFAULT_CHARDESK_CELL_METRICS;
  const zoom = options.zoom ?? 1;
  const offset = options.offset ?? { x: 0, y: 0 };
  const content = options.content ?? "all";
  const dirty = frame.dirty === "full" ? [frame.viewport] : frame.dirty;
  if (dirty.length === 0) return { cells: 0, glyphs: 0 };
  const overscan = options.queryOverscan;
  const queryBounds = overscan
    ? {
        x: frame.viewport.x - (overscan.left ?? 0),
        y: frame.viewport.y - (overscan.top ?? 0),
        width: frame.viewport.width + (overscan.left ?? 0) + (overscan.right ?? 0),
        height: frame.viewport.height + (overscan.top ?? 0) + (overscan.bottom ?? 0),
      }
    : frame.viewport;

  const entries: CharDeskCanvasCellDrawEntry[] = [];
  let cells = 0;
  let glyphs = 0;
  frame.source.visit(queryBounds, (x, y, cell) => {
    const occupiedWidth = Math.max(cell.visual.width, cell.backgroundWidth ?? 0);
    if (!intersectsAnyCellRect(x, y, occupiedWidth, dirty)) return;
    const drawBackground = cell.drawBackground !== false && content !== "text";
    const drawText = cell.drawText !== false && content !== "background";
    if (!drawBackground && !drawText) return;
    cells += 1;
    if (drawText) glyphs += 1;
    const entryOptions: CharDeskCanvasCellDrawOptions = {
      metrics,
      zoom,
      palette: options.palette,
      underline: options.underline?.(x, y, cell),
      ...(options.fontAvailability
        ? { fontAvailability: options.fontAvailability }
        : {}),
      ...(options.fontProfile ? { fontProfile: options.fontProfile } : {}),
      ...(options.fontFamilies ? { fontFamilies: options.fontFamilies } : {}),
      ...(options.fontResolver ? { fontResolver: options.fontResolver } : {}),
    };
    const entryX = x * metrics.cellWidth * zoom + offset.x;
    const entryY = y * metrics.cellHeight * zoom + offset.y;
    if (drawBackground) {
      const backgroundWidth = cell.backgroundWidth ?? cell.visual.width;
      entries.push({
        cell: backgroundWidth === cell.visual.width
          ? cell.visual
          : { ...cell.visual, width: backgroundWidth },
        x: entryX,
        y: entryY,
        options: entryOptions,
        drawBackground: true,
        drawText: false,
      });
    }
    if (drawText) {
      entries.push({
        cell: cell.visual,
        x: entryX,
        y: entryY,
        options: entryOptions,
        drawBackground: false,
        drawText: true,
      });
    }
  });
  drawCharDeskCanvasCells(ctx, entries);
  return { cells, glyphs };
};

export const measureCharDeskCanvasDocument = (
  model: CharDeskRenderModel,
  options: Pick<CharDeskCanvasDocumentOptions, "metrics" | "padding" | "zoom"> = {}
): CharDeskCanvasDocumentLayout => {
  const metrics = options.metrics ?? DEFAULT_CHARDESK_CELL_METRICS;
  const zoom = options.zoom ?? 1;
  const padding = (options.padding ?? 16) * zoom;
  return {
    width: model.document.width * metrics.cellWidth * zoom + padding * 2,
    height: model.document.height * metrics.cellHeight * zoom + padding * 2,
    padding,
    metrics,
  };
};

export const drawCharDeskCanvasDocument = (
  ctx: CharDeskCanvasContext,
  model: CharDeskRenderModel,
  options: CharDeskCanvasDocumentOptions
) => {
  const layout = measureCharDeskCanvasDocument(model, options);
  const zoom = options.zoom ?? 1;
  const entries = model.cells.map((cell) => ({
    cell,
    x: layout.padding + cell.x * layout.metrics.cellWidth * zoom,
    y: layout.padding + cell.y * layout.metrics.cellHeight * zoom,
    options: {
      metrics: layout.metrics,
      zoom,
      palette: options.palette,
      ...(options.fontAvailability
        ? { fontAvailability: options.fontAvailability }
        : {}),
      ...(options.fontProfile ? { fontProfile: options.fontProfile } : {}),
      ...(options.fontFamilies ? { fontFamilies: options.fontFamilies } : {}),
      ...(options.fontResolver ? { fontResolver: options.fontResolver } : {}),
    },
  }));
  drawCharDeskCanvasCells(ctx, entries);
  return layout;
};

export const loadCharDeskCanvasFonts = async (
  samplesToLoad: Iterable<CharDeskCanvasFontSample>,
  options: CharDeskCanvasFontLoadOptions = {}
): Promise<CharDeskCanvasFontAvailability> => {
  if (typeof document === "undefined" || !document.fonts) {
    return { text: false, emoji: false };
  }

  const groups = new Map<string, {
    route: CharDeskRenderFontRoute;
    bold: boolean;
    italic: boolean;
    face: CharDeskCanvasResolvedFontFace;
    graphemes: Set<string>;
  }>();
  for (const sample of samplesToLoad) {
    const grapheme = typeof sample === "string" ? sample : sample.grapheme;
    if (!grapheme || resolveCharDeskCanvasGlyphSource(grapheme) === "cell-graphics") continue;
    const route = resolveCharDeskFontRoute(grapheme);
    const bold = typeof sample === "string" ? false : !!sample.bold;
    const italic = typeof sample === "string" ? false : !!sample.italic;
    const face = resolveCharDeskCanvasFontFace({
      grapheme,
      route,
      bold,
      italic,
      ...(options.fontProfile ? { fontProfile: options.fontProfile } : {}),
      ...(options.fontFamilies ? { fontFamilies: options.fontFamilies } : {}),
      ...(options.fontResolver ? { fontResolver: options.fontResolver } : {}),
    });
    const effectiveBold = bold && face.boldStrategy === "native";
    const key = `${route}:${face.capability}:${face.family}:${effectiveBold ? 1 : 0}:${italic ? 1 : 0}:${face.fontSizeScale}`;
    const group = groups.get(key) ?? {
      route,
      bold,
      italic,
      face,
      graphemes: new Set<string>(),
    };
    group.graphemes.add(grapheme);
    groups.set(key, group);
  }

  const availability: CharDeskCanvasFontAvailability = {
    text: !Array.from(groups.values()).some(({ route }) => route === "text"),
    emoji: !Array.from(groups.values()).some(({ route }) => route === "emoji"),
  };
  const sentinels: HTMLElement[] = [];
  if (typeof document.createElement === "function" && document.body) {
    for (const group of groups.values()) {
      const sentinel = document.createElement("span");
      sentinel.ariaHidden = "true";
      sentinel.style.cssText = "position:fixed;pointer-events:none;opacity:0";
      sentinel.style.font = getCharDeskCanvasFont(
        options.metrics ?? DEFAULT_CHARDESK_CELL_METRICS,
        1,
        { ...group, fontFamily: group.face.family,
          fontSizeScale: group.face.fontSizeScale, boldStrategy: group.face.boldStrategy }
      );
      sentinel.textContent = Array.from(group.graphemes).join("");
      document.body.append(sentinel);
      sentinels.push(sentinel);
    }
  }
  try {
    // WebKit may not activate supplementary-plane unicode-range faces for a
    // Canvas-only request until the same face participates in DOM shaping.
    try { await document.fonts.ready; } catch { /* Per-route loads report failure below. */ }
    await Promise.all(Array.from(groups.values(), async (group) => {
      try {
        const faces = await document.fonts.load(
          getCharDeskCanvasFont(
            options.metrics ?? DEFAULT_CHARDESK_CELL_METRICS,
            1,
            {
              ...group,
              fontFamily: group.face.family,
              fontSizeScale: group.face.fontSizeScale,
              boldStrategy: group.face.boldStrategy,
            }
          ),
          Array.from(group.graphemes).join("")
        );
        availability[group.route] ||= faces.length > 0;
      } catch {
        availability[group.route] ||= false;
      }
    }));
  } finally {
    for (const sentinel of sentinels) sentinel.remove();
  }
  try {
    await document.fonts.ready;
  } catch {
    // Per-route availability already records font loading failures.
  }
  return availability;
};
