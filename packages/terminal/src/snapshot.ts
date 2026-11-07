import { MAPLE_FONT_PROFILE } from '@chardesk/font-maple';
import { resolveSnapshotFont } from './snapshotFonts.ts';
import { createCanvas } from '@napi-rs/canvas';
import {
  captureCanvasExport,
  resolveExportRasterLayout,
  type CanvasExportSnapshot,
} from '@chardesk/editor-core/exportPlan';
import { isDefaultArtifactForeground } from '@chardesk/cell-plane/artifact-style';
import { DEFAULT_CHARDESK_CELL_METRICS, resolveCharDeskCellVisual } from '@chardesk/rendering';
import {
  drawCharDeskCanvasCells,
  type CharDeskCanvasCellDrawEntry,
  type CharDeskCanvasPalette,
} from '@chardesk/rendering/canvas';
import type { TerminalCanvas } from '../../local-runtime/src/model.ts';
import type { TerminalClipboardImage } from './clipboard.ts';

export function resolveSnapshotLayout(cols: number, rows: number) {
  const { cellWidth, cellHeight } = DEFAULT_CHARDESK_CELL_METRICS;
  const layout = resolveExportRasterLayout(cols, rows, cellWidth, cellHeight);
  return { width: layout.pixelWidth, height: layout.pixelHeight, scale: layout.scale };
}

export function captureExportSnapshot(snapshot: CanvasExportSnapshot) {
  if (snapshot.scope === 'canvas' && !snapshot.cells.size) throw new Error('empty-content');
  const { x: startX, y: startY, width, height } = snapshot.bounds;
  const padding = snapshot.scope === 'selection' ? 1 : 2;
  const layout = resolveSnapshotLayout(width + padding * 2, height + padding * 2);
  const { cellWidth, cellHeight } = DEFAULT_CHARDESK_CELL_METRICS;
  const entries: CharDeskCanvasCellDrawEntry[] = [];
  snapshot.source.visit(snapshot.bounds, (x, y, cell) => {
    entries.push({
      cell: resolveCharDeskCellVisual({
        text: cell.char,
        color: isDefaultArtifactForeground(cell) ? undefined : cell.color,
        bgColor: cell.bgColor,
        attrs: cell.attrs ? { ...cell.attrs } : undefined,
        href: cell.href,
      }),
      x: (x - startX + padding) * cellWidth,
      y: (y - startY + padding) * cellHeight,
    });
  });
  return { ...layout, entries };
}

/** Capture before awaiting Host IO; only physical selection coverage enters the image. */
export function captureSelectionSnapshot(model: TerminalCanvas) {
  if (!model.selection) throw new Error('empty-selection');
  return captureExportSnapshot(captureCanvasExport(model.plane, model.selectionRanges));
}

export function renderSelectionSnapshot(
  snapshot: ReturnType<typeof captureSelectionSnapshot>,
  palette: CharDeskCanvasPalette,
  format?: 'png'
): TerminalClipboardImage & { png?: Buffer } {
  const canvas = createCanvas(snapshot.width, snapshot.height),
    ctx = canvas.getContext('2d');
  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(snapshot.scale, 0, 0, snapshot.scale, 0, 0);
  drawCharDeskCanvasCells(
    ctx,
    snapshot.entries.map((entry) => ({
      ...entry,
      options: { palette, fontProfile: MAPLE_FONT_PROFILE, fontResolver: resolveSnapshotFont },
    }))
  );
  return {
    ...(format ? { png: canvas.toBuffer('image/png') } : {}),
    width: canvas.width,
    height: canvas.height,
    rgba: Buffer.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data),
  };
}
