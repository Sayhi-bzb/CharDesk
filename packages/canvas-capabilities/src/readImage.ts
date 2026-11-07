import type { CanvasSurfaceReader } from '@chardesk/cell-plane';
import { isDefaultArtifactForeground } from '@chardesk/cell-plane/artifact-style';
import { DEFAULT_CHARDESK_CELL_METRICS, resolveCharDeskCellVisual } from '@chardesk/rendering';
import {
  drawCharDeskCanvasCells,
  type CharDeskCellCanvasContext,
  type CharDeskCanvasCellDrawEntry,
  type CharDeskCanvasCellDrawOptions,
  type CharDeskCanvasPalette,
} from '@chardesk/rendering/canvas';
import type { CanvasReadViewport, CanvasReadImageDetail } from './readViewport';

export const CANVAS_READ_IMAGE_LIMITS = Object.freeze({
  edge: 2048,
  pixels: 2_000_000,
  bytes: 700 * 1024,
  responseBytes: 1_000_000,
});

export type CanvasReadImagePlan = Readonly<{
  width: number;
  height: number;
  scale: number;
  palette: CharDeskCanvasPalette;
  entries: readonly CharDeskCanvasCellDrawEntry[];
}>;
export type CanvasReadImageRenderer = (plan: CanvasReadImagePlan) => Promise<Uint8Array | null>;

/** Capture Cells before Host IO; a read never changes the editor's camera or selection. */
export function captureCanvasReadImage(
  surface: CanvasSurfaceReader,
  [x, y, width, height]: CanvasReadViewport,
  detail: CanvasReadImageDetail,
  palette: CharDeskCanvasPalette
): CanvasReadImagePlan {
  const metrics = DEFAULT_CHARDESK_CELL_METRICS;
  const logicalWidth = width * metrics.cellWidth,
    logicalHeight = height * metrics.cellHeight;
  const requestedScale = { low: 1, auto: 1.25, high: 1.5, original: 2 }[detail];
  const scale = Math.min(
    requestedScale,
    CANVAS_READ_IMAGE_LIMITS.edge / logicalWidth,
    CANVAS_READ_IMAGE_LIMITS.edge / logicalHeight,
    Math.sqrt(CANVAS_READ_IMAGE_LIMITS.pixels / (logicalWidth * logicalHeight))
  );
  const entries: CharDeskCanvasCellDrawEntry[] = [];
  // Include the owner of a wide Cell whose trailing column crosses the left edge.
  const left = x > Number.MIN_SAFE_INTEGER ? x - 1 : x;
  surface.visit({ x: left, y, width: width + (x - left), height }, (cellX, cellY, cell) => {
    const visual = resolveCharDeskCellVisual({
      text: cell.char,
      color: isDefaultArtifactForeground(cell) ? undefined : cell.color,
      bgColor: cell.bgColor,
      attrs: cell.attrs ? { ...cell.attrs } : undefined,
      href: cell.href,
    });
    if (cellX + visual.width <= x) return;
    entries.push({
      cell: visual,
      x: (cellX - x) * metrics.cellWidth,
      y: (cellY - y) * metrics.cellHeight,
    });
  });
  return {
    width: Math.max(1, Math.floor(logicalWidth * scale)),
    height: Math.max(1, Math.floor(logicalHeight * scale)),
    scale,
    palette: { ...palette },
    entries,
  };
}

/** Browser and native Hosts use the same glyph, background, attribute and wide-Cell painter. */
export function paintCanvasReadImage(
  context: CharDeskCellCanvasContext,
  plan: CanvasReadImagePlan,
  fonts: Pick<CharDeskCanvasCellDrawOptions, 'fontProfile' | 'fontResolver'>
) {
  context.fillStyle = plan.palette.background;
  context.fillRect(0, 0, plan.width, plan.height);
  context.setTransform(plan.scale, 0, 0, plan.scale, 0, 0);
  drawCharDeskCanvasCells(
    context,
    plan.entries.map((entry) => ({
      ...entry,
      options: { ...fonts, palette: plan.palette },
    }))
  );
}
