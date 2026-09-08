import {
  CHARDESK_SYSTEM_FONT_PROFILE,
  type CharDeskFontRoute,
} from "@chardesk/fonts";
import {
  formatCellFrame,
  normalizeCellRect,
  type CellFrame,
  type CellPoint,
  type CellRect,
} from "@chardesk/cell-core";
import {
  getGraphemeCellWidth,
  isEmojiGrapheme,
  parseCharDeskText,
  type CharDeskTextAttributes,
  type CharDeskTextCell,
  type ParseCharDeskTextOptions,
  type ParsedCharDeskText,
} from "@chardesk/protocol";

export type { CharDeskNormalizedCellRect } from "./canvas-geometry.js";

export type CharDeskRenderFontRoute = CharDeskFontRoute;

export type CharDeskCellMetrics = {
  cellWidth: number;
  cellHeight: number;
  fontSize: number;
  fontFamily: string;
  /** Alphabetic baseline from the Cell top; omitted preserves middle alignment. */
  baseline?: number;
};

export const DEFAULT_CHARDESK_CELL_METRICS = Object.freeze({
  cellWidth: 9,
  cellHeight: 20,
  baseline: 15,
  fontSize: 15,
  fontFamily: CHARDESK_SYSTEM_FONT_PROFILE.families.text,
} satisfies CharDeskCellMetrics);

export type CharDeskCellCursorShape = "block" | "bar" | "underline";

export type CharDeskCellCursorPaintStyle = Readonly<{
  shape: CharDeskCellCursorShape;
  color: string;
  textColor: string;
}>;

export const DEFAULT_CHARDESK_CELL_CURSOR_BLINK_INTERVAL_MS = 600;

export type CharDeskCellRangePhase = "selecting" | "resting" | "moving";

export type CharDeskCellRangeGeometry = Readonly<{
  polygons: readonly Readonly<{
    rings: readonly (readonly CellPoint[])[];
  }>[];
}>;

export type CharDeskCellRangePaintStyle = Readonly<{
  surface: string;
  border: string;
}>;

export const createCharDeskRectRangeGeometry = (
  input: CellRect
): CharDeskCellRangeGeometry => {
  const rect = normalizeCellRect(input);
  if (rect.width === 0 || rect.height === 0) return { polygons: [] };
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return {
    polygons: [{
      rings: [[
        { x: rect.x, y: rect.y },
        { x: right, y: rect.y },
        { x: right, y: bottom },
        { x: rect.x, y: bottom },
        { x: rect.x, y: rect.y },
      ]],
    }],
  };
};

export type CharDeskCellVisualInput = {
  text: string;
  color?: string;
  bgColor?: string;
  attrs?: CharDeskTextAttributes;
  href?: string;
};

export type CharDeskCellVisual = CharDeskCellVisualInput & {
  width: 1 | 2;
  fontRoute: CharDeskRenderFontRoute;
};

export type CharDeskCellFrameCell = Readonly<{
  visual: CharDeskCellVisual;
  /** Physical background span; glyph width remains visual.width. */
  backgroundWidth?: 1 | 2;
  drawBackground?: boolean;
  drawText?: boolean;
}>;

export const formatCharDeskCellFrame = (
  frame: CellFrame<CharDeskCellFrameCell>,
  options?: Readonly<{ trimEnd?: boolean }>
) => formatCellFrame(
  frame,
  ({ visual }) => ({ text: visual.text, width: visual.width }),
  options
);

export type CharDeskRenderCell = CharDeskTextCell & {
  fontRoute: CharDeskRenderFontRoute;
};

export type CharDeskRenderSegment = {
  text: string;
  columns: number;
  fontRoute?: CharDeskRenderFontRoute;
};

export type CharDeskRenderRun = {
  text: string;
  segments?: CharDeskRenderSegment[];
  color?: string;
  bgColor?: string;
  attrs?: CharDeskTextAttributes;
  href?: string;
};

export type CharDeskRenderRow = {
  runs: CharDeskRenderRun[];
};

export type CharDeskRenderModel = {
  document: ParsedCharDeskText;
  cells: CharDeskRenderCell[];
  rows: CharDeskRenderRow[];
};

export const resolveCharDeskFontRoute = (
  grapheme: string
): CharDeskRenderFontRoute => isEmojiGrapheme(grapheme) ? "emoji" : "text";

export const getCharDeskFontFamily = (route: CharDeskRenderFontRoute) =>
  CHARDESK_SYSTEM_FONT_PROFILE.families[route];

export const getCharDeskFontFamilyForGrapheme = (grapheme: string) =>
  getCharDeskFontFamily(resolveCharDeskFontRoute(grapheme));

export const resolveCharDeskCellVisual = (
  input: CharDeskCellVisualInput
): CharDeskCellVisual => ({
  ...input,
  width: getGraphemeCellWidth(input.text),
  fontRoute: resolveCharDeskFontRoute(input.text),
});

const attrsKey = (attrs?: CharDeskTextAttributes) =>
  attrs
    ? `${attrs.bold ? 1 : 0}${attrs.italic ? 1 : 0}${
        attrs.underline ? 1 : 0
      }${attrs.strike ? 1 : 0}${attrs.inverse ? 1 : 0}`
    : "00000";

const styleKey = (cell: CharDeskTextCell) =>
  `${cell.color ?? ""}\u0000${cell.bgColor ?? ""}\u0000${attrsKey(
    cell.attrs
  )}\u0000${cell.href ?? ""}`;

const toRenderCell = (cell: CharDeskTextCell): CharDeskRenderCell => ({
  ...cell,
  fontRoute: resolveCharDeskFontRoute(cell.text),
});

const toRun = (cell: CharDeskRenderCell): CharDeskRenderRun => ({
  text: cell.text,
  segments: [{
    text: cell.text,
    columns: cell.width,
    fontRoute: cell.fontRoute,
  }],
  ...(cell.color ? { color: cell.color } : {}),
  ...(cell.bgColor ? { bgColor: cell.bgColor } : {}),
  ...(cell.attrs ? { attrs: { ...cell.attrs } } : {}),
  ...(cell.href ? { href: cell.href } : {}),
});

export const createCharDeskRenderModelFromDocument = (
  document: ParsedCharDeskText
): CharDeskRenderModel => {
  const cells = document.cells.map(toRenderCell);
  const rows: CharDeskRenderRow[] = Array.from(
    { length: document.height },
    () => ({ runs: [] })
  );
  const cursors = new Array<number>(document.height).fill(0);
  const keys = new Array<string | null>(document.height).fill(null);

  for (const cell of cells) {
    const row = rows[cell.y];
    if (!row) continue;
    const cursor = cursors[cell.y] ?? 0;
    if (cell.x > cursor) {
      const columns = cell.x - cursor;
      const text = " ".repeat(columns);
      row.runs.push({
        text,
        segments: [{ text, columns, fontRoute: "text" }],
      });
      keys[cell.y] = null;
    }

    const key = styleKey(cell);
    const previous = row.runs.at(-1);
    if (previous && keys[cell.y] === key) {
      previous.text += cell.text;
      previous.segments?.push({
        text: cell.text,
        columns: cell.width,
        fontRoute: cell.fontRoute,
      });
    } else {
      row.runs.push(toRun(cell));
      keys[cell.y] = key;
    }
    cursors[cell.y] = cell.x + cell.width;
  }

  return { document, cells, rows };
};

export const createCharDeskRenderModel = (
  source: string,
  options?: ParseCharDeskTextOptions
) => createCharDeskRenderModelFromDocument(parseCharDeskText(source, options));
