import { getGraphemeCellWidth, type CharDeskStyleNoteCell } from "@chardesk/protocol";
import type { GridCell, NodeBounds } from "@/shared/types";
import type { CanvasSurfaceReader } from "./cell-plane/model";

export const isCanvasCellOccupied = (cell: GridCell) => /\S/u.test(cell.char) || cell.bgColor !== undefined
  || cell.attrs?.inverse === true || cell.attrs?.underline === true || cell.attrs?.strike === true;

/** Exact Cell clipping, independent of rulers, borders, and style-note formatting. */
export const readCanvasTextRegion = (surface: CanvasSurfaceReader, bounds: NodeBounds) => {
  const text = Array.from({ length: bounds.height }, () => Array<string>(bounds.width).fill(" "));
  const cells: CharDeskStyleNoteCell[] = [];
  for (const row of surface.rows(bounds)) for (const span of row.spans) {
    let x = span.x;
    for (const cell of span.cells) {
      const width = getGraphemeCellWidth(cell.char);
      const localY = row.y - bounds.y;
      if (width > 0 && localY >= 0 && localY < bounds.height && x >= bounds.x && x + width <= bounds.x + bounds.width) {
        cells.push({ ...cell, x, y: row.y, width });
        if (isCanvasCellOccupied(cell)) {
          text[localY][x - bounds.x] = cell.char;
          for (let offset = 1; offset < width; offset++) text[localY][x - bounds.x + offset] = "";
        }
      }
      x += width;
    }
  }
  return { text, cells };
};
