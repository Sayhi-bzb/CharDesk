import { captureCanvasExport, resolveExportRasterLayout } from "@chardesk/editor-core/exportPlan";
import {
  drawCellBatch,
  drawGridLines,
  type CanvasCellDrawEntry,
} from "@/shared/cell-rendering/canvas-drawing";
import { loadCharDeskCanvasFonts } from "@chardesk/rendering/canvas";
import {
  DEFAULT_ARTIFACT_CANVAS_PALETTE,
  type CanvasArtifactPalette,
} from "@/shared/canvas-appearance/artifact-style";
import type { GridCell, GridCellSource, SelectionArea } from "@/shared/types";
import { GridManager } from "@/shared/utils/grid";
import { ExportPipelineError } from "../core/types";
import type { CharDeskFontProfile } from "@chardesk/fonts";
import {
  DEFAULT_CANVAS_CELL_METRICS,
  DEFAULT_CANVAS_FONT_PROFILE,
} from "@/shared/fonts/canvas-profile";

type RasterLayout = {
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  dpr: 1 | 2;
};

export const resolveRasterLayout = (cols: number, rows: number): RasterLayout => {
  const { cellWidth, cellHeight } = DEFAULT_CANVAS_CELL_METRICS;
  try {
    const {
      width,
      height,
      pixelWidth,
      pixelHeight,
      scale: dpr,
    } = resolveExportRasterLayout(cols, rows, cellWidth, cellHeight);
    return { width, height, pixelWidth, pixelHeight, dpr };
  } catch {
    throw new ExportPipelineError("image-too-large");
  }
};

const getFontSamples = (cells: Iterable<GridCell>) =>
  Array.from(cells, (cell) => ({
    grapheme: cell.char,
    bold: cell.attrs?.bold,
    italic: cell.attrs?.italic,
  }));

const resolveRasterCell = (
  cell: GridCell,
  includeColor: boolean,
  palette: CanvasArtifactPalette
): GridCell => {
  if (includeColor) return cell;
  if (cell.attrs?.inverse) {
    return {
      ...cell,
      color: palette.color,
      bgColor: palette.background,
    };
  }
  return {
    ...cell,
    color: palette.color,
    bgColor: cell.bgColor ? palette.background : undefined,
  };
};

const encodePng = (
  entries: readonly CanvasCellDrawEntry[],
  cols: number,
  rows: number,
  showGrid: boolean,
  fontProfile: CharDeskFontProfile,
  palette: CanvasArtifactPalette
) => {
  const layout = resolveRasterLayout(cols, rows);
  const canvas = document.createElement("canvas");
  canvas.width = layout.pixelWidth;
  canvas.height = layout.pixelHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ExportPipelineError("canvas-unavailable");

  ctx.setTransform(layout.dpr, 0, 0, layout.dpr, 0, 0);
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, layout.width, layout.height);

  if (showGrid) {
    drawGridLines(ctx, {
      startX: 0,
      endX: cols,
      startY: 0,
      endY: rows,
      width: layout.width,
      height: layout.height,
      color: palette.grid,
      lineWidth: 0.5,
    });
  }

  drawCellBatch(ctx, entries, { fontProfile, palette });

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new ExportPipelineError("encoding-failed"));
      },
      "image/png",
      1
    );
  });
};

export const createSelectionPngBlob = async (
  grid: GridCellSource,
  selections: SelectionArea[],
  showGrid = true,
  includeColor = true,
  fontProfile: CharDeskFontProfile = DEFAULT_CANVAS_FONT_PROFILE,
  palette: CanvasArtifactPalette = DEFAULT_ARTIFACT_CANVAS_PALETTE
): Promise<Blob> => {
  if (selections.length === 0) throw new ExportPipelineError("empty-content");
  const snapshot = captureCanvasExport(grid, selections, "envelope");
  const { x: minX, y: minY, width, height } = snapshot.bounds;
  const padding = 1;
  const cols = width + padding * 2,
    rows = height + padding * 2;
  resolveRasterLayout(cols, rows);
  const entries: CanvasCellDrawEntry[] = [];
  snapshot.source.visit(snapshot.bounds, (x, y, cell) => {
    entries.push({
      cell: resolveRasterCell(cell, includeColor, palette),
      x: (x - minX + padding) * DEFAULT_CANVAS_CELL_METRICS.cellWidth,
      y: (y - minY + padding) * DEFAULT_CANVAS_CELL_METRICS.cellHeight,
    });
  });

  await loadCharDeskCanvasFonts(getFontSamples(entries.map(({ cell }) => cell)), { fontProfile });
  return encodePng(entries, cols, rows, showGrid, fontProfile, palette);
};

export const createPngBlobFromGrid = async (
  grid: GridCellSource,
  showGrid = false,
  includeColor = true,
  fontProfile: CharDeskFontProfile = DEFAULT_CANVAS_FONT_PROFILE,
  palette: CanvasArtifactPalette = DEFAULT_ARTIFACT_CANVAS_PALETTE
): Promise<Blob> => {
  if (!grid.getContentBounds()) throw new ExportPipelineError("empty-content");
  const snapshot = captureCanvasExport(grid);
  const { minX, maxX, minY, maxY } = GridManager.getGridBounds(snapshot.source);
  const padding = 2;
  const cols = maxX - minX + 1 + padding * 2;
  const rows = maxY - minY + 1 + padding * 2;
  resolveRasterLayout(cols, rows);

  const entries: CanvasCellDrawEntry[] = [];
  GridManager.iterate(snapshot.source, (cell, x, y) => {
    entries.push({
      cell: resolveRasterCell(cell, includeColor, palette),
      x: (x - minX + padding) * DEFAULT_CANVAS_CELL_METRICS.cellWidth,
      y: (y - minY + padding) * DEFAULT_CANVAS_CELL_METRICS.cellHeight,
    });
  });

  await loadCharDeskCanvasFonts(getFontSamples(entries.map(({ cell }) => cell)), { fontProfile });
  return encodePng(entries, cols, rows, showGrid, fontProfile, palette);
};
