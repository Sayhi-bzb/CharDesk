import type { CellFrame, CellRect, CellSource } from "@chardesk/cell-core";
import type {
  CharDeskCanvasPalette,
} from "@chardesk/rendering/canvas";
import type { CharDeskCellFrameCell } from "@chardesk/rendering";
import type { GridCell, GridCellSource } from "@/shared/types";
import { BACKGROUND_COLOR, COLOR_PRIMARY_TEXT } from "@/shared/lib/constants";
import { toCanvasVisual } from "./canvasDrawing";

export const DEFAULT_ARTIFACT_CANVAS_PALETTE: CharDeskCanvasPalette = {
  color: COLOR_PRIMARY_TEXT,
  background: BACKGROUND_COLOR,
};

const frameCellCache = new WeakMap<GridCell, CharDeskCellFrameCell>();
const frameSourceCache = new WeakMap<
  GridCellSource,
  CellSource<CharDeskCellFrameCell>
>();

const toFrameCell = (cell: GridCell): CharDeskCellFrameCell => {
  const cached = frameCellCache.get(cell);
  if (cached) return cached;
  const result = Object.freeze({
    visual: toCanvasVisual(cell),
    // A present source cell replaces the cell beneath it, even when it uses the
    // palette background. Missing source cells remain transparent to overlays.
    drawBackground: true,
    drawText: cell.char !== " " || !!cell.attrs,
  });
  frameCellCache.set(cell, result);
  return result;
};

const createFrameSource = (
  source: GridCellSource
): CellSource<CharDeskCellFrameCell> => {
  const cached = frameSourceCache.get(source);
  if (cached) return cached;
  const result: CellSource<CharDeskCellFrameCell> = {
    get(point) {
      const cell = source.get(point);
      return cell ? toFrameCell(cell) : undefined;
    },
    visit(bounds, visitor) {
      source.visit(bounds, (x, y, cell) => visitor(x, y, toFrameCell(cell)));
    },
    getContentBounds: () => source.getContentBounds(),
  };
  frameSourceCache.set(source, result);
  return result;
};

export const createGridCellFrame = (
  source: GridCellSource,
  viewport: CellRect,
  dirty: "full" | readonly CellRect[] = "full"
): CellFrame<CharDeskCellFrameCell> => ({
  revision:
    "getRevision" in source && typeof source.getRevision === "function"
      ? source.getRevision()
      : 0,
  viewport,
  source: createFrameSource(source),
  dirty,
});
