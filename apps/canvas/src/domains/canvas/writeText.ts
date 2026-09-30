import { getTextCellWidth } from "@chardesk/protocol";
import type { Point } from "@/shared/types";
import type { CellPlanePatch } from "./cell-plane/model";
import type { CanvasReadViewport } from "./readViewport";

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
  let width = 0;
  const rows: CellPlanePatch["rows"][number][] = [];
  for (const [offset, line] of lines.entries()) {
    const lineWidth = getTextCellWidth(line);
    if (!lineWidth) continue;
    if (!Number.isSafeInteger(at.x + lineWidth) || !Number.isSafeInteger(at.y + offset + 1)) {
      throw new CanvasWriteError("invalid_input", "Written Cell coordinates exceed the safe integer range.");
    }
    width = Math.max(width, lineWidth);
    rows.push({ y: at.y + offset, erase: [], spans: [{ x: at.x, text: line, color, preserveTargetBackground: true }] });
  }
  const top = rows[0]?.y;
  return { patch: { rows }, bounds: top !== undefined ? [at.x, top, width, rows[rows.length - 1].y - top + 1] : null };
};
