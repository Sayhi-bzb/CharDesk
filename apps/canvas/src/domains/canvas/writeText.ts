import { getTextCellWidth, iterateGraphemes } from "@chardesk/protocol";
import type { Point } from "@/shared/types";
import type { CellPlanePatch } from "./cell-plane/model";
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

const hasVisibleWhitespaceStyle = (span: RichTextRow["spans"][number]) =>
  span.bgColor !== undefined || span.href !== undefined || Object.values(span.attrs ?? {}).some(Boolean);

const isWhitespaceGrapheme = (grapheme: string) => /^\s+$/u.test(grapheme);

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
      return output.map(({ width: _width, ...next }) => ({ ...next, x: at.x + next.x }));
    });
    return { y, erase: [], spans };
  });
  const bounds: CanvasReadViewport | null = Number.isFinite(left) ? [left, top, right - left, bottom - top] : null;
  if (bounds && !bounds.every(Number.isSafeInteger)) {
    throw new CanvasWriteError("invalid_input", "Written Cell bounds exceed the safe integer range.");
  }
  return { patch: { rows }, bounds, writtenCells, skippedWhitespaceCells };
};
