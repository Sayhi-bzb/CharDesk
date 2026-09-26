import type { CellFrame, CellRect, CellSource } from "@chardesk/cell-core";
import type { CharDeskCellFrameCell } from "@chardesk/rendering";
import type { GridCell, GridCellSource } from "@/shared/types";
import { toCanvasVisual } from "./canvas-drawing";
import {
  DEFAULT_ARTIFACT_CANVAS_PALETTE,
  type CanvasArtifactPalette,
} from "@/shared/canvas-appearance/artifact-style";

const frameCellCache = new WeakMap<
  GridCell,
  WeakMap<CanvasArtifactPalette, CharDeskCellFrameCell>
>();
const frameSourceCache = new WeakMap<
  GridCellSource,
  WeakMap<CanvasArtifactPalette, CellSource<CharDeskCellFrameCell>>
>();

const toFrameCell = (
  cell: GridCell,
  palette: CanvasArtifactPalette
): CharDeskCellFrameCell => {
  const byPalette = frameCellCache.get(cell);
  const cached = byPalette?.get(palette);
  if (cached) return cached;
  const result = Object.freeze({
    visual: toCanvasVisual(cell, palette),
    // A present source cell replaces the cell beneath it, even when it uses the
    // palette background. Missing source cells remain transparent to overlays.
    drawBackground: true,
    drawText: cell.char !== " " || !!cell.attrs,
  });
  const cache = byPalette ?? new WeakMap();
  cache.set(palette, result);
  if (!byPalette) frameCellCache.set(cell, cache);
  return result;
};

const createFrameSource = (
  source: GridCellSource,
  palette: CanvasArtifactPalette
): CellSource<CharDeskCellFrameCell> => {
  const byPalette = frameSourceCache.get(source);
  const cached = byPalette?.get(palette);
  if (cached) return cached;
  const result: CellSource<CharDeskCellFrameCell> = {
    get(point) {
      const cell = source.get(point);
      return cell ? toFrameCell(cell, palette) : undefined;
    },
    visit(bounds, visitor) {
      source.visit(bounds, (x, y, cell) =>
        visitor(x, y, toFrameCell(cell, palette))
      );
    },
    getContentBounds: () => source.getContentBounds(),
  };
  const cache = byPalette ?? new WeakMap();
  cache.set(palette, result);
  if (!byPalette) frameSourceCache.set(source, cache);
  return result;
};

export const createGridCellFrame = (
  source: GridCellSource,
  viewport: CellRect,
  dirty: "full" | readonly CellRect[] = "full",
  palette: CanvasArtifactPalette = DEFAULT_ARTIFACT_CANVAS_PALETTE
): CellFrame<CharDeskCellFrameCell> => ({
  revision:
    "getRevision" in source && typeof source.getRevision === "function"
      ? source.getRevision()
      : 0,
  viewport,
  source: createFrameSource(source, palette),
  dirty,
});
