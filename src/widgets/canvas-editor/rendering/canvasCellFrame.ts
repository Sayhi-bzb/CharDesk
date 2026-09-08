import type { GridCell, GridCellSource } from "@/shared/types";
import type { CanvasSurfaceReader } from "@/domains/canvas/public";
import { getCellOccupancy, toCanvasVisual } from "@/shared/metrics";
import type { CellFrame, CellRect, CellSource } from "@chardesk/cell-core";
import type { CharDeskCellFrameCell } from "@chardesk/rendering";

export type CanvasCellFrameProjection = Readonly<{
  hiddenSpans: readonly Readonly<{
    y: number;
    minX: number;
    maxX: number;
  }>[];
  overlay: GridCellSource;
}>;

const frameCellCache = new WeakMap<GridCell, CharDeskCellFrameCell>();
const renderSourceCache = new WeakMap<
  CanvasSurfaceReader,
  CellSource<CharDeskCellFrameCell>
>();

const toFrameCell = (cell: GridCell): CharDeskCellFrameCell => {
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
  reader: CanvasSurfaceReader,
  projection?: CanvasCellFrameProjection
): CellSource<CharDeskCellFrameCell> => {
  if (!projection) {
    const cached = renderSourceCache.get(reader);
    if (cached) return cached;
  }
  const hiddenByRow = projection
    ? new Map<number, readonly Readonly<{ minX: number; maxX: number }>[]>()
    : null;
  if (hiddenByRow && projection) {
    for (const span of projection.hiddenSpans) {
      const row = hiddenByRow.get(span.y) ?? [];
      hiddenByRow.set(span.y, [...row, span]);
    }
  }
  const isHidden = (x: number, y: number) =>
    hiddenByRow?.get(y)?.some((span) => x >= span.minX && x <= span.maxX) ?? false;
  const visitReader = (
    source: CanvasSurfaceReader,
    bounds: CellRect,
    visitor: (x: number, y: number, cell: GridCell) => void
  ) => {
    if (typeof source.visit === "function") {
      source.visit(bounds, visitor);
      return;
    }
    if (typeof source.visitCells === "function") {
      source.visitCells(bounds, visitor);
      return;
    }
    for (const span of source.query(bounds)) {
      let x = span.x;
      for (const cell of span.cells) {
        visitor(x, span.y, cell);
        x += getCellOccupancy(cell.char);
      }
    }
  };
  const source: CellSource<CharDeskCellFrameCell> = {
    get(point) {
      const overlayCell = projection?.overlay.get(point);
      if (overlayCell) return toFrameCell(overlayCell);
      if (isHidden(point.x, point.y)) return undefined;
      const cell = reader.get(point);
      return cell ? toFrameCell(cell) : undefined;
    },
    visit(bounds, visitor) {
      const visit = (x: number, y: number, cell: GridCell) =>
        visitor(x, y, toFrameCell(cell));
      if (projection) {
        visitReader(reader, bounds, (x, y, cell) => {
          if (!isHidden(x, y)) visit(x, y, cell);
        });
        projection.overlay.visit(bounds, visit);
      } else {
        visitReader(reader, bounds, visit);
      }
    },
    getContentBounds: () => reader.getContentBounds(),
  };
  if (!projection) renderSourceCache.set(reader, source);
  return source;
};

export const createCanvasCellFrame = (
  reader: CanvasSurfaceReader,
  viewport: CellRect,
  dirty: "full" | readonly CellRect[] = "full",
  projection?: CanvasCellFrameProjection
): CellFrame<CharDeskCellFrameCell> => ({
  revision: "getRevision" in reader && typeof reader.getRevision === "function"
    ? reader.getRevision()
    : 0,
  viewport,
  source: createCanvasRenderSource(reader, projection),
  dirty,
});
