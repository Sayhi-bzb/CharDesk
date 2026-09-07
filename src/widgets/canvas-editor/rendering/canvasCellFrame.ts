import type { GridCell } from "@/shared/types";
import type { CanvasSurfaceReader } from "@/domains/canvas/public";
import { getCellOccupancy, toCanvasVisual } from "@/shared/metrics";
import type { CellFrame, CellRect, CellSource } from "@chardesk/cell-core";
import type { CharDeskCanvasFrameCell } from "@chardesk/rendering/canvas";

const frameCellCache = new WeakMap<GridCell, CharDeskCanvasFrameCell>();
const renderSourceCache = new WeakMap<
  CanvasSurfaceReader,
  CellSource<CharDeskCanvasFrameCell>
>();

const toFrameCell = (cell: GridCell): CharDeskCanvasFrameCell => {
  const cached = frameCellCache.get(cell);
  if (cached) return cached;
  const result = Object.freeze({
    visual: toCanvasVisual(cell),
    drawBackground: cell.char !== " " || !!cell.bgColor || !!cell.attrs,
    drawText: cell.char !== " " || !!cell.attrs,
  });
  frameCellCache.set(cell, result);
  return result;
};

const createCanvasRenderSource = (
  reader: CanvasSurfaceReader
): CellSource<CharDeskCanvasFrameCell> => {
  const cached = renderSourceCache.get(reader);
  if (cached) return cached;
  const source: CellSource<CharDeskCanvasFrameCell> = {
    get(point) {
      const cell = reader.get(point);
      return cell ? toFrameCell(cell) : undefined;
    },
    visit(bounds, visitor) {
      const visit = (x: number, y: number, cell: GridCell) =>
        visitor(x, y, toFrameCell(cell));
      if (typeof reader.visit === "function") {
        reader.visit(bounds, visit);
        return;
      }
      if (typeof reader.visitCells === "function") {
        reader.visitCells(bounds, visit);
        return;
      }
      for (const span of reader.query(bounds)) {
        let x = span.x;
        for (const cell of span.cells) {
          visit(x, span.y, cell);
          x += getCellOccupancy(cell.char);
        }
      }
    },
    getContentBounds: () => reader.getContentBounds(),
  };
  renderSourceCache.set(reader, source);
  return source;
};

export const createCanvasCellFrame = (
  reader: CanvasSurfaceReader,
  viewport: CellRect,
  dirty: "full" | readonly CellRect[] = "full"
): CellFrame<CharDeskCanvasFrameCell> => ({
  revision: "getRevision" in reader && typeof reader.getRevision === "function"
    ? reader.getRevision()
    : 0,
  viewport,
  source: createCanvasRenderSource(reader),
  dirty,
});
