import { getGraphemeCellWidth } from "@chardesk/protocol";
import type { GridCell, NodeBounds } from "@/shared/types";
import type { CanvasSurfaceReader } from "./cell-plane/model";

export type CanvasReadViewport = readonly [x: number, y: number, width: number, height: number];
export type CanvasReadProjection = Readonly<{
  viewport: CanvasReadViewport | null;
  step: number;
  mode: "text" | "projection" | "density";
  content: string;
}>;

const occupied = (cell: GridCell) => /\S/u.test(cell.char) || cell.bgColor !== undefined;
const quadrants = [" ", "▘", "▝", "▀", "▖", "▌", "▞", "▛", "▗", "▚", "▐", "▜", "▄", "▙", "▟", "█"];

export const isCanvasReadViewport = (value: unknown): value is CanvasReadViewport =>
  Array.isArray(value) && value.length === 4 && value.every(Number.isSafeInteger)
  && value[2] > 0 && value[3] > 0
  && Number.isSafeInteger(value[0] + value[2]) && Number.isSafeInteger(value[1] + value[3]);

export const readCanvasViewport = (
  surface: CanvasSurfaceReader,
  requested?: CanvasReadViewport,
): CanvasReadProjection => {
  if (requested !== undefined && !isCanvasReadViewport(requested)) throw new Error("Invalid viewport: expected [x,y,width,height] with safe integer coordinates and positive sizes.");
  const storedBounds = surface.getContentBounds();
  let bounds: NodeBounds | null = requested
    ? { x: requested[0], y: requested[1], width: requested[2], height: requested[3] }
    : null;
  if (!requested && storedBounds) {
    for (const row of surface.rows(storedBounds)) for (const span of row.spans) {
      let x = span.x;
      for (const cell of span.cells) {
        const width = getGraphemeCellWidth(cell.char);
        if (occupied(cell) && width > 0) {
          const right = Math.max(bounds ? bounds.x + bounds.width : x + width, x + width);
          const bottom = Math.max(bounds ? bounds.y + bounds.height : row.y + 1, row.y + 1);
          const left = Math.min(bounds?.x ?? x, x);
          const top = Math.min(bounds?.y ?? row.y, row.y);
          bounds = { x: left, y: top, width: right - left, height: bottom - top };
        }
        x += width;
      }
    }
  }
  if (!bounds) return { viewport: null, step: 1, mode: "text", content: "" };
  const { x, y, width, height } = bounds;
  const step = Math.max(1, Math.ceil(width / 80), Math.ceil(height / 24));
  const columns = Math.ceil(width / step);
  const rows = Math.ceil(height / step);
  const mode = step === 1 ? "text" : step <= 4 ? "projection" : "density";
  const text = Array.from({ length: rows }, () => Array<string>(columns).fill(" "));
  const counts = new Float64Array(rows * columns);
  const masks = new Uint8Array(rows * columns);
  const query = { x: x - 1, y, width: width + 1, height };
  if (storedBounds) for (const row of surface.rows(query)) for (const span of row.spans) {
    let cellX = span.x;
    for (const cell of span.cells) {
      const cellWidth = getGraphemeCellWidth(cell.char);
      const localY = row.y - y;
      if (occupied(cell) && localY >= 0 && localY < height) {
        if (mode === "text") {
          if (cellX >= x && cellX + cellWidth <= x + width) {
            text[localY][cellX - x] = cell.char;
            for (let offset = 1; offset < cellWidth; offset++) text[localY][cellX - x + offset] = "";
          }
        } else for (let offset = 0; offset < cellWidth; offset++) {
          const localX = cellX + offset - x;
          if (localX < 0 || localX >= width) continue;
          const column = Math.floor(localX / step);
          const outputRow = Math.floor(localY / step);
          const index = outputRow * columns + column;
          counts[index]++;
          const quadrantX = Math.floor((localX % step) * 2 / step);
          const quadrantY = Math.floor((localY % step) * 2 / step);
          masks[index] |= 1 << (quadrantY * 2 + quadrantX);
        }
      }
      cellX += cellWidth;
    }
  }
  if (mode !== "text") for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const index = row * columns + column;
    const area = Math.min(step, width - column * step) * Math.min(step, height - row * step);
    const density = counts[index] / area;
    text[row][column] = mode === "projection" ? quadrants[masks[index]]
      : density === 0 ? "·" : density <= 1 / 16 ? "░" : density <= 1 / 4 ? "▒" : density <= 1 / 2 ? "▓" : "█";
  }
  const labelWidth = Math.max(String(y).length, String(y + height - 1).length);
  const tickEvery = Math.max(1, Math.ceil(12 / step));
  const ruler = Array<string>(columns).fill(" ");
  let previousEnd = -1;
  for (let column = 0; column < columns; column += tickEvery) {
    const label = String(x + column * step);
    if (column > previousEnd && column + label.length <= columns) {
      [...label].forEach((char, offset) => { ruler[column + offset] = char; });
      previousEnd = column + label.length;
    }
  }
  const content = [
    `viewport=[${x},${y},${width},${height}] step=${step} mode=${mode}`,
    `${" ".repeat(labelWidth + 3)}${ruler.join("").trimEnd()}`,
    `${" ".repeat(labelWidth + 1)}┌${"─".repeat(columns)}┐`,
    ...text.map((line, row) => `${String(y + row * step).padStart(labelWidth)} │${line.join("")}│`),
    `${" ".repeat(labelWidth + 1)}└${"─".repeat(columns)}┘`,
  ].join("\n");
  return { viewport: [x, y, width, height], step, mode, content };
};
