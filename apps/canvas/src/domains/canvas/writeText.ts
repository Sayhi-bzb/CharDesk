import { getTextCellWidth } from "@chardesk/protocol";
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

/** Prepare all rows before committing; coordinates are original Cell coordinates. */
export const prepareCanvasTextWrite = (at: Point, content: string, color: string): Readonly<{
  patch: CellPlanePatch;
  bounds: CanvasReadViewport | null;
}> => {
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
  }] : []));
};

/** Translate rendered spans without coupling the Cell write port to a renderer. */
export const prepareCanvasRowsWrite = (at: Point, source: readonly RichTextRow[]): ReturnType<typeof prepareCanvasTextWrite> => {
  if (!Number.isSafeInteger(at.x) || !Number.isSafeInteger(at.y)) {
    throw new CanvasWriteError("invalid_input", "Expected a safe Cell position.");
  }
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  const rows = source.map((row) => {
    const y = at.y + row.y;
    if (!Number.isSafeInteger(row.y) || !Number.isSafeInteger(y) || !Number.isSafeInteger(y + 1)) {
      throw new CanvasWriteError("invalid_input", "Written Cell coordinates exceed the safe integer range.");
    }
    const spans = row.spans.flatMap((span) => {
      const width = getTextCellWidth(span.text);
      if (/\p{Cc}/u.test(span.text)) throw new CanvasWriteError("invalid_input", "Rendered spans contain unsupported control characters.");
      if (!width) return [];
      const x = at.x + span.x;
      if (!Number.isSafeInteger(span.x) || !Number.isSafeInteger(x) || !Number.isSafeInteger(x + width)) {
        throw new CanvasWriteError("invalid_input", "Written Cell coordinates exceed the safe integer range.");
      }
      left = Math.min(left, x); right = Math.max(right, x + width);
      top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
      return [{ x, text: span.text, color: span.color, bgColor: span.bgColor, attrs: span.attrs, href: span.href,
        preserveTargetBackground: span.bgColor === undefined }];
    });
    return { y, erase: [], spans };
  });
  const bounds: CanvasReadViewport | null = Number.isFinite(left) ? [left, top, right - left, bottom - top] : null;
  if (bounds && !bounds.every(Number.isSafeInteger)) {
    throw new CanvasWriteError("invalid_input", "Written Cell bounds exceed the safe integer range.");
  }
  return { patch: { rows }, bounds };
};
