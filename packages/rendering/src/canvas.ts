import {
  CHARDESK_SYSTEM_FONT_PROFILE,
  type CharDeskFontCapability,
  type CharDeskFontProfile,
} from "@chardesk/fonts";
import type { CharDeskTextAttributes } from "@chardesk/protocol";
import type {
  CharDeskCellVisual,
  CharDeskRenderFontRoute,
  CharDeskRenderModel,
} from "./index.js";
import { resolveCharDeskFontRoute } from "./index.js";
import {
  CHARDESK_CELL_EDGE,
  alignCanvasRect,
  type AxisTransform,
  type CharDeskCellPrimitive,
} from "./cell-primitives.js";
export { alignCanvasRect as alignCharDeskCanvasRect } from "./cell-primitives.js";
export type { CharDeskCellPrimitive } from "./cell-primitives.js";
export type { CharDeskFontProfile } from "@chardesk/fonts";

export type CharDeskCanvasMetrics = {
  cellWidth: number;
  cellHeight: number;
  fontSize: number;
  fontFamily: string;
};

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
  bold: boolean;
  italic: boolean;
}) => string | undefined;

export type CharDeskCanvasResolvedFontFace = Readonly<{
  capability: CharDeskFontCapability;
  family: string;
  fontSizeScale: number;
  scaleX: number;
  baselineShiftEm: number;
  weightPolicy: "inherit" | "regular";
}>;

export type CharDeskCanvasCellDrawOptions = {
  clipToCell?: boolean;
  color?: string;
  underline?: boolean;
  zoom?: number;
  metrics?: CharDeskCanvasMetrics;
  palette?: CharDeskCanvasPalette;
  fontAvailability?: CharDeskCanvasFontAvailability;
  fontProfile?: CharDeskFontProfile;
  fontFamilies?: CharDeskCanvasFontFamilies;
  fontResolver?: CharDeskCanvasFontResolver;
};

export type CharDeskCanvasCellDrawEntry = {
  cell: CharDeskCellVisual;
  primitive?: CharDeskCellPrimitive;
  x: number;
  y: number;
  options?: CharDeskCanvasCellDrawOptions;
  drawBackground?: boolean;
  drawText?: boolean;
};

export type CharDeskCanvasCellVisual = CharDeskCellVisual & {
  color: string;
};

export type CharDeskCanvasDocumentOptions = {
  metrics?: CharDeskCanvasMetrics;
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
  metrics: CharDeskCanvasMetrics;
};

export type CharDeskCanvasFontSample =
  | string
  | { grapheme: string; bold?: boolean; italic?: boolean };

export type CharDeskCanvasFontLoadOptions = Readonly<{
  metrics?: CharDeskCanvasMetrics;
  fontProfile?: CharDeskFontProfile;
  fontFamilies?: CharDeskCanvasFontFamilies;
  fontResolver?: CharDeskCanvasFontResolver;
}>;

export const DEFAULT_CHARDESK_CANVAS_METRICS: CharDeskCanvasMetrics = {
  cellWidth: 9,
  cellHeight: 19,
  fontSize: 15,
  fontFamily: CHARDESK_SYSTEM_FONT_PROFILE.families.text,
};

export const DEFAULT_CHARDESK_CANVAS_FONT_AVAILABILITY: CharDeskCanvasFontAvailability = {
  text: true,
  emoji: true,
};

const DEFAULT_PALETTE: CharDeskCanvasPalette = {
  color: "#000000",
  background: "#ffffff",
};

export const getCharDeskCanvasFont = (
  metrics: CharDeskCanvasMetrics = DEFAULT_CHARDESK_CANVAS_METRICS,
  zoom = 1,
  options?: {
    bold?: boolean;
    italic?: boolean;
    route?: CharDeskRenderFontRoute;
    fontFamily?: string;
    fontSizeScale?: number;
    weightPolicy?: "inherit" | "regular";
  }
) => {
  const route = options?.route ?? "text";
  const fontFamily = options?.fontFamily ?? (route === "emoji"
    ? CHARDESK_SYSTEM_FONT_PROFILE.families.emoji
    : metrics.fontFamily);
  const bold = options?.bold && options.weightPolicy !== "regular";
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
  const effectiveBold = input.bold && spec.weightPolicy !== "regular";
  const profileFamily = effectiveBold
    ? spec.families.bold ?? spec.families.regular
    : spec.families.regular;
  const family = input.fontResolver?.({
    grapheme: input.grapheme,
    route: input.route,
    bold: input.bold,
    italic: input.italic,
  }) ?? (effectiveBold
    ? routeFamilies?.bold ?? routeFamilies?.regular
    : routeFamilies?.regular) ?? profileFamily;
  return {
    capability,
    family,
    fontSizeScale: spec.fontSizeScale ?? 1,
    scaleX: spec.scaleX ?? 1,
    baselineShiftEm: spec.baselineShiftEm ?? 0,
    weightPolicy: spec.weightPolicy ?? "inherit",
  };
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
  metrics: CharDeskCanvasMetrics = DEFAULT_CHARDESK_CANVAS_METRICS
) => ({
  x: x + metrics.cellWidth * zoom * width / 2,
  y: y + metrics.cellHeight * zoom / 2,
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
  const metrics = options?.metrics ?? DEFAULT_CHARDESK_CANVAS_METRICS;
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
  scaleX: number;
  scaleY: number;
  transform?: AxisTransform;
};

const prepareFontGlyph = (
  ctx: CharDeskCanvasContext,
  entry: CharDeskCanvasCellDrawEntry,
  visual: CharDeskCanvasCellVisual,
  state: CanvasTextState
) => {
  const options = entry.options;
  const metrics = options?.metrics ?? DEFAULT_CHARDESK_CANVAS_METRICS;
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
    weightPolicy: face.weightPolicy,
  });
  if (font !== state.font) {
    ctx.font = font;
    state.font = font;
  }
  return {
    text,
    x: Math.round(anchor.x * state.scaleX) / state.scaleX,
    y: Math.round(
      (anchor.y + face.baselineShiftEm * metrics.fontSize * face.fontSizeScale * zoom)
        * state.scaleY
    ) / state.scaleY,
    scaleX: face.scaleX,
  };
};

const drawCellPrimitive = (
  ctx: CharDeskCanvasContext,
  entry: CharDeskCanvasCellDrawEntry,
  visual: CharDeskCanvasCellVisual,
  primitive: CharDeskCellPrimitive,
  state: CanvasTextState
) => {
  const metrics = entry.options?.metrics ?? DEFAULT_CHARDESK_CANVAS_METRICS;
  const zoom = entry.options?.zoom ?? 1;
  const width = metrics.cellWidth * zoom * visual.width;
  const height = metrics.cellHeight * zoom;
  const fill = (part: Readonly<{ x: number; y: number; width: number; height: number }>) => {
    const bounds = alignCanvasRect({
      x: entry.x + part.x * width,
      y: entry.y + part.y * height,
      width: part.width * width,
      height: part.height * height,
    }, state.transform);
    if (bounds.width > 0 && bounds.height > 0) {
      ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
    }
  };

  if (primitive.kind === "fill") {
    for (const region of primitive.regions) fill(region);
    return;
  }

  const lineWidth = Math.min(width, height, Math.max(1, Math.round(zoom)));
  const halfX = lineWidth / (2 * width);
  const halfY = lineWidth / (2 * height);
  const edges = primitive.edges;
  const adjacentPair = edges === (CHARDESK_CELL_EDGE.top | CHARDESK_CELL_EDGE.right)
    || edges === (CHARDESK_CELL_EDGE.right | CHARDESK_CELL_EDGE.bottom)
    || edges === (CHARDESK_CELL_EDGE.bottom | CHARDESK_CELL_EDGE.left)
    || edges === (CHARDESK_CELL_EDGE.left | CHARDESK_CELL_EDGE.top);

  if (primitive.join === "rounded" && adjacentPair) {
    const bounds = alignCanvasRect({ x: entry.x, y: entry.y, width, height }, state.transform);
    const left = bounds.x;
    const top = bounds.y;
    const right = left + bounds.width;
    const bottom = top + bounds.height;
    const centerX = left + bounds.width / 2;
    const centerY = top + bounds.height / 2;
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = entry.options?.color ?? visual.color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    if (edges === (CHARDESK_CELL_EDGE.right | CHARDESK_CELL_EDGE.bottom)) {
      ctx.moveTo(right, centerY);
      ctx.quadraticCurveTo(centerX, centerY, centerX, bottom);
    } else if (edges === (CHARDESK_CELL_EDGE.left | CHARDESK_CELL_EDGE.bottom)) {
      ctx.moveTo(left, centerY);
      ctx.quadraticCurveTo(centerX, centerY, centerX, bottom);
    } else if (edges === (CHARDESK_CELL_EDGE.right | CHARDESK_CELL_EDGE.top)) {
      ctx.moveTo(right, centerY);
      ctx.quadraticCurveTo(centerX, centerY, centerX, top);
    } else {
      ctx.moveTo(left, centerY);
      ctx.quadraticCurveTo(centerX, centerY, centerX, top);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (edges & CHARDESK_CELL_EDGE.top) fill({ x: 0.5 - halfX, y: 0, width: halfX * 2, height: 0.5 + halfY });
  if (edges & CHARDESK_CELL_EDGE.right) fill({ x: 0.5 - halfX, y: 0.5 - halfY, width: 0.5 + halfX, height: halfY * 2 });
  if (edges & CHARDESK_CELL_EDGE.bottom) fill({ x: 0.5 - halfX, y: 0.5 - halfY, width: halfX * 2, height: 0.5 + halfY });
  if (edges & CHARDESK_CELL_EDGE.left) fill({ x: 0, y: 0.5 - halfY, width: 0.5 + halfX, height: halfY * 2 });
};

const drawCellText = (
  ctx: CharDeskCanvasContext,
  entry: CharDeskCanvasCellDrawEntry,
  visual: CharDeskCanvasCellVisual,
  state: CanvasTextState
) => {
  const options = entry.options;
  const metrics = options?.metrics ?? DEFAULT_CHARDESK_CANVAS_METRICS;
  const zoom = options?.zoom ?? 1;
  const primitive = entry.primitive;
  const fontGlyph = primitive ? null : prepareFontGlyph(ctx, entry, visual, state);
  const attrs = visual.attrs;
  const textColor = options?.color ?? visual.color;
  if (textColor !== state.color) {
    ctx.fillStyle = textColor;
    state.color = textColor;
  }
  if (options?.clipToCell) {
    ctx.save();
    ctx.beginPath();
    const bounds = { x: entry.x, y: entry.y, width: metrics.cellWidth * zoom * visual.width, height: metrics.cellHeight * zoom };
    const aligned = alignCanvasRect(bounds, state.transform);
    ctx.rect(aligned.x, aligned.y, aligned.width, aligned.height);
    ctx.clip();
  }
  if (primitive) {
    drawCellPrimitive(ctx, entry, visual, primitive, state);
  } else if (fontGlyph) {
    if (fontGlyph.scaleX === 1) {
      ctx.fillText(fontGlyph.text, fontGlyph.x, fontGlyph.y);
    } else {
      ctx.save();
      ctx.translate(fontGlyph.x, fontGlyph.y);
      ctx.scale(fontGlyph.scaleX, 1);
      ctx.fillText(fontGlyph.text, 0, 0);
      ctx.restore();
    }
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
  if (options?.clipToCell) ctx.restore();
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
    scaleX: Math.hypot(transform?.a ?? 1, transform?.b ?? 0) || 1,
    scaleY: Math.hypot(transform?.c ?? 0, transform?.d ?? 1) || 1,
  };
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]!;
    if (entry.drawText !== false) {
      drawCellText(ctx, entry, visuals[index]!, textState);
    }
  }
  ctx.restore();
};

export const measureCharDeskCanvasDocument = (
  model: CharDeskRenderModel,
  options: Pick<CharDeskCanvasDocumentOptions, "metrics" | "padding" | "zoom"> = {}
): CharDeskCanvasDocumentLayout => {
  const metrics = options.metrics ?? DEFAULT_CHARDESK_CANVAS_METRICS;
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
    if (!grapheme) continue;
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
    const effectiveBold = bold && face.weightPolicy !== "regular";
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
  await Promise.all(Array.from(groups.values(), async (group) => {
    try {
      const faces = await document.fonts.load(
        getCharDeskCanvasFont(
          options.metrics ?? DEFAULT_CHARDESK_CANVAS_METRICS,
          1,
          {
            ...group,
            fontFamily: group.face.family,
            fontSizeScale: group.face.fontSizeScale,
            weightPolicy: group.face.weightPolicy,
          }
        ),
        Array.from(group.graphemes).join("")
      );
      availability[group.route] ||= faces.length > 0;
    } catch {
      availability[group.route] ||= false;
    }
  }));
  try {
    await document.fonts.ready;
  } catch {
    // Per-route availability already records font loading failures.
  }
  return availability;
};
