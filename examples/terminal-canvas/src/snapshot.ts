import { MAPLE_FONT_PROFILE } from '@chardesk/font-maple';
import { resolveSnapshotFont } from './snapshotFonts.ts';
import { createCanvas } from '@napi-rs/canvas';
import { resolveGridSlot } from '@chardesk/cell-plane/grid-occupancy';
import { isDefaultArtifactForeground } from '@chardesk/cell-plane/artifact-style';
import { DEFAULT_CHARDESK_CELL_METRICS, resolveCharDeskCellVisual } from '@chardesk/rendering';
import {
  drawCharDeskCanvasCells,
  type CharDeskCanvasCellDrawEntry,
  type CharDeskCanvasPalette,
} from '@chardesk/rendering/canvas';
import type { TerminalCanvas } from './model.ts';
import type { TerminalClipboardImage } from './clipboard.ts';

// Same raster budget and one-cell padding as the Web selection snapshot.
export function resolveSnapshotLayout(cols: number, rows: number) {
  const { cellWidth, cellHeight } = DEFAULT_CHARDESK_CELL_METRICS;
  for (const scale of [2, 1]) {
    const width = cols * cellWidth * scale,
      height = rows * cellHeight * scale;
    if (
      Number.isSafeInteger(width) &&
      Number.isSafeInteger(height) &&
      width > 0 &&
      height > 0 &&
      width <= 8192 &&
      height <= 8192 &&
      width * height <= 16_777_216
    )
      return { width, height, scale };
  }
  throw new RangeError('image-too-large');
}

/** Capture before awaiting Host IO; only physical selection coverage enters the image. */
export function captureSelectionSnapshot(model: TerminalCanvas) {
  const coverage = model.selectionPresentation.coverage;
  if (!coverage.bounds) throw new Error('empty-selection');
  const { start, end } = coverage.bounds;
  const layout = resolveSnapshotLayout(end.x - start.x + 3, end.y - start.y + 3);
  const { cellWidth, cellHeight } = DEFAULT_CHARDESK_CELL_METRICS;
  const entries: CharDeskCanvasCellDrawEntry[] = [];
  for (const { y, minX, maxX } of coverage.spans) {
    for (let x = minX; x <= maxX; x++) {
      const slot = resolveGridSlot(model.plane, { x, y });
      if (!slot || slot.offset !== 0) continue;
      const cell = slot.cell;
      entries.push({
        cell: resolveCharDeskCellVisual({
          text: cell.char,
          color: isDefaultArtifactForeground(cell) ? undefined : cell.color,
          bgColor: cell.bgColor,
          attrs: cell.attrs ? { ...cell.attrs } : undefined,
          href: cell.href,
        }),
        x: (x - start.x + 1) * cellWidth,
        y: (y - start.y + 1) * cellHeight,
      });
    }
  }
  return { ...layout, entries };
}

export function renderSelectionSnapshot(
  snapshot: ReturnType<typeof captureSelectionSnapshot>,
  palette: CharDeskCanvasPalette
): TerminalClipboardImage {
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
    width: canvas.width,
    height: canvas.height,
    rgba: Buffer.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data),
  };
}
