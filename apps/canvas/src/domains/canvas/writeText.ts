import { getTextCellWidth, iterateGraphemes } from "@chardesk/protocol";
import type { Point } from "@/shared/types";
import type { CanvasSurfaceReader, CellPlanePatch } from "./cell-plane/model";
import type { CanvasReadViewport } from "./readViewport";
import type { RichTextRow } from "./state/textCommandTypes";

export class CanvasWriteError extends Error {
  readonly code: "invalid_input" | "canvas_not_active" | "source_backed_canvas" | "out_of_bounds";
  constructor(code: CanvasWriteError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export type CanvasWriteMode = "patch" | "replace";

export type CanvasWriteStats = Readonly<{
  writtenCells: number;
  skippedWhitespaceCells: number;
}>;

export type CanvasMutationImpact = Readonly<{
  overwrittenCells: number;
  overwrittenBounds: CanvasReadViewport | null;
  clearedCells: number;
  clearedBounds: CanvasReadViewport | null;
  styledCells: number;
  styledBounds: CanvasReadViewport | null;
}>;

export type CanvasStrokeStyle = Readonly<Partial<Pick<RichTextRow["spans"][number], "color" | "bgColor" | "attrs" | "href">>>;

const hasVisibleWhitespaceStyle = (span: RichTextRow["spans"][number]) =>
  span.bgColor !== undefined || span.href !== undefined || Object.values(span.attrs ?? {}).some(Boolean);

const isWhitespaceGrapheme = (grapheme: string) => /^\s+$/u.test(grapheme);

const isExistingCell = (cell: { char: string } | undefined) => Boolean(cell?.char && !isWhitespaceGrapheme(cell.char));

const createImpactBounds = () => ({
  count: 0,
  left: Infinity,
  top: Infinity,
  right: -Infinity,
  bottom: -Infinity,
});

const addImpactCell = (bounds: ReturnType<typeof createImpactBounds>, x: number, y: number) => {
  bounds.count += 1;
  bounds.left = Math.min(bounds.left, x);
  bounds.top = Math.min(bounds.top, y);
  bounds.right = Math.max(bounds.right, x);
  bounds.bottom = Math.max(bounds.bottom, y);
};

const finishImpactBounds = (bounds: ReturnType<typeof createImpactBounds>): { count: number; bounds: CanvasReadViewport | null } => ({
  count: bounds.count,
  bounds: bounds.count === 0 ? null : [bounds.left, bounds.top, bounds.right - bounds.left + 1, bounds.bottom - bounds.top + 1],
});

/** Compare a prepared projection patch with the surface immediately before it
 * is committed. This is intentionally a compact impact summary: callers get
 * coordinates and counts without copying the old document into the result. */
export const measureCanvasMutationImpact = (
  surface: CanvasSurfaceReader,
  patch: CellPlanePatch,
): CanvasMutationImpact => {
  const overwritten = createImpactBounds();
  const cleared = createImpactBounds();
  for (const row of patch.rows) {
    for (const interval of row.erase) {
      for (let x = interval.from; x <= interval.to; x += 1) {
        if (isExistingCell(surface.getCell({ x, y: row.y }))) addImpactCell(cleared, x, row.y);
      }
    }
    for (const span of row.spans) {
      let x = span.x;
      for (const { segment } of iterateGraphemes(span.text)) {
        const width = getTextCellWidth(segment);
        for (let offset = 0; offset < width; offset += 1) {
          const cellX = x + offset;
          if (isExistingCell(surface.getCell({ x: cellX, y: row.y }))) {
            if (isWhitespaceGrapheme(segment)) addImpactCell(cleared, cellX, row.y);
            else addImpactCell(overwritten, cellX, row.y);
          }
        }
        x += width;
      }
    }
  }
  const overwrittenResult = finishImpactBounds(overwritten);
  const clearedResult = finishImpactBounds(cleared);
  return {
    overwrittenCells: overwrittenResult.count,
    overwrittenBounds: overwrittenResult.bounds,
    clearedCells: clearedResult.count,
    clearedBounds: clearedResult.bounds,
    styledCells: 0,
    styledBounds: null,
  };
};

/** Prepare all rows before committing; coordinates are original Cell coordinates. */
export const prepareCanvasTextWrite = (
  at: Point,
  content: string,
  color: string,
  writeMode: CanvasWriteMode = "replace",
): Readonly<{
  patch: CellPlanePatch;
  bounds: CanvasReadViewport | null;
  } & CanvasWriteStats> => {
  if (!Number.isSafeInteger(at.x) || !Number.isSafeInteger(at.y) || typeof content !== "string") {
    throw new CanvasWriteError("invalid_input", "Expected a Cell position and Unicode content.");
  }
  const text = content.replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  if (lines.some((line) => /\p{Cc}/u.test(line))) {
    throw new CanvasWriteError("invalid_input", "Content must be plain Unicode text; tabs and control characters are unsupported.");
  }
  return prepareCanvasRowsWrite(at, lines.flatMap((text, y) => text ? [{
    y, spans: [{ x: 0, text, color, width: getTextCellWidth(text) }],
  }] : []), writeMode);
};

/** Prepare a literal Projection stroke. Whitespace is transparent by design. */
export const prepareCanvasPlainTextWrite = (
  at: Point,
  content: string,
  style: CanvasStrokeStyle,
): ReturnType<typeof prepareCanvasRowsWrite> => {
  const text = content.replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  if (lines.some((line) => /\p{Cc}/u.test(line))) {
    throw new CanvasWriteError("invalid_input", "Content must be plain Unicode text; tabs and control characters are unsupported.");
  }
  return prepareCanvasRowsWrite(at, lines.flatMap((line, y) => line ? [{
    y,
    spans: [{ x: 0, text: line, color: style.color ?? "#000000", ...(style.bgColor ? { bgColor: style.bgColor } : {}), ...(style.attrs ? { attrs: style.attrs } : {}), ...(style.href ? { href: style.href } : {}), width: getTextCellWidth(line) }],
  }] : []), "patch");
};

export const prepareCanvasErase = (
  at: Point,
  size: readonly [number, number],
): Readonly<{ patch: CellPlanePatch; bounds: CanvasReadViewport; writtenCells: number; skippedWhitespaceCells: number }> => {
  if (!Number.isSafeInteger(at.x) || !Number.isSafeInteger(at.y) || size.length !== 2
    || !size.every((value) => Number.isSafeInteger(value) && value > 0)
    || !Number.isSafeInteger(at.x + size[0]!) || !Number.isSafeInteger(at.y + size[1]!)) {
    throw new CanvasWriteError("invalid_input", "Expected a Cell position and positive [width,height] size.");
  }
  return {
    patch: { rows: Array.from({ length: size[1]! }, (_, y) => ({ y: at.y + y, erase: [{ from: at.x, to: at.x + size[0]! - 1 }], spans: [] })) },
    bounds: [at.x, at.y, size[0]!, size[1]!],
    writtenCells: 0,
    skippedWhitespaceCells: 0,
  };
};

/** Translate rendered spans without coupling the Cell write port to a renderer. */
export const prepareCanvasRowsWrite = (
  at: Point,
  source: readonly RichTextRow[],
  writeMode: CanvasWriteMode = "replace",
): ReturnType<typeof prepareCanvasTextWrite> => {
  if (!Number.isSafeInteger(at.x) || !Number.isSafeInteger(at.y)) {
    throw new CanvasWriteError("invalid_input", "Expected a safe Cell position.");
  }
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  let writtenCells = 0;
  let skippedWhitespaceCells = 0;
  const rows = source.map((row) => {
    const y = at.y + row.y;
    if (!Number.isSafeInteger(row.y) || !Number.isSafeInteger(y) || !Number.isSafeInteger(y + 1)) {
      throw new CanvasWriteError("invalid_input", "Written Cell coordinates exceed the safe integer range.");
    }
    const spans = row.spans.flatMap((span) => {
      if (/\p{Cc}/u.test(span.text)) throw new CanvasWriteError("invalid_input", "Rendered spans contain unsupported control characters.");
      if (!getTextCellWidth(span.text)) return [];
      if (!Number.isSafeInteger(span.x)) throw new CanvasWriteError("invalid_input", "Written Cell coordinates exceed the safe integer range.");
      const output: Array<typeof span & { x: number; width: number; preserveTargetBackground: boolean }> = [];
      let x = span.x;
      let textX = x;
      let text = "";
      let textWidth = 0;
      const flush = () => {
        if (!text) return;
        const absoluteX = at.x + textX;
        if (!Number.isSafeInteger(absoluteX) || !Number.isSafeInteger(absoluteX + textWidth)) {
          throw new CanvasWriteError("invalid_input", "Written Cell coordinates exceed the safe integer range.");
        }
        left = Math.min(left, absoluteX); right = Math.max(right, absoluteX + textWidth);
        top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
        output.push({ x: textX, text, width: textWidth, color: span.color, bgColor: span.bgColor, attrs: span.attrs, href: span.href,
          preserveTargetBackground: span.bgColor === undefined });
        text = "";
        textWidth = 0;
      };
      for (const { segment } of iterateGraphemes(span.text)) {
        const segmentWidth = getTextCellWidth(segment);
        const skip = writeMode === "patch" && isWhitespaceGrapheme(segment) && !hasVisibleWhitespaceStyle(span);
        if (skip) {
          flush();
          skippedWhitespaceCells += segmentWidth;
        } else {
          if (!text) textX = x;
          text += segment;
          textWidth += segmentWidth;
          writtenCells += segmentWidth;
        }
        x += segmentWidth;
      }
      flush();
      return output.map((entry) => {
        const { width, ...next } = entry;
        void width;
        return { ...next, x: at.x + next.x };
      });
    });
    return { y, erase: [], spans };
  });
  const bounds: CanvasReadViewport | null = Number.isFinite(left) ? [left, top, right - left, bottom - top] : null;
  if (bounds && !bounds.every(Number.isSafeInteger)) {
    throw new CanvasWriteError("invalid_input", "Written Cell bounds exceed the safe integer range.");
  }
  return { patch: { rows }, bounds, writtenCells, skippedWhitespaceCells };
};
