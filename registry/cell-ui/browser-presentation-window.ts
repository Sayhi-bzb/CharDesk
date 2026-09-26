import type { CharDeskCellMetrics } from "@chardesk/rendering";
import type { CellRect, CellSize } from "./types.js";
import { CELL_SURFACE_GUARD_CELLS } from "./browser-presentation.js";

const clipsVertically = (value: string): boolean =>
  value === "auto" || value === "scroll" || value === "hidden" || value === "clip";

/** A bounded paint window in full-document Cell coordinates; null means paint the whole Surface. */
export const resolveCellPresentationWindow = (
  surface: HTMLElement,
  viewport: CellSize,
  metrics: Pick<CharDeskCellMetrics, "cellHeight">,
  previous: CellRect | null,
): CellRect | null => {
  const view = surface.ownerDocument.defaultView;
  const bounds = surface.getBoundingClientRect();
  if (!view || !view.innerHeight || !bounds.height || !metrics.cellHeight || viewport.height <= 0) return null;
  let clipTop = 0;
  let clipBottom = view.innerHeight;
  for (let ancestor = surface.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const style = view.getComputedStyle(ancestor);
    if (!clipsVertically(style.overflowY)) continue;
    const rect = ancestor.getBoundingClientRect();
    clipTop = Math.max(clipTop, rect.top);
    clipBottom = Math.min(clipBottom, rect.bottom);
  }
  const top = Math.max(bounds.top, clipTop);
  const bottom = Math.min(bounds.bottom, clipBottom);
  const origin = bounds.top + CELL_SURFACE_GUARD_CELLS * metrics.cellHeight;
  const visibleStart = bottom > top
    ? Math.max(0, Math.min(viewport.height, Math.floor((top - origin) / metrics.cellHeight))) : 0;
  const visibleEnd = bottom > top
    ? Math.max(visibleStart, Math.min(viewport.height, Math.ceil((bottom - origin) / metrics.cellHeight)))
    : Math.min(viewport.height, Math.ceil(view.innerHeight / metrics.cellHeight));
  const visibleRows = Math.max(1, visibleEnd - visibleStart);
  const overscan = Math.max(2, Math.ceil(visibleRows / 4));
  if (viewport.height <= visibleRows + 2 * overscan) return null;
  if (previous?.width === viewport.width && previous.y <= visibleStart
    && previous.y + previous.height >= visibleEnd
    && previous.y + previous.height <= viewport.height) return previous;
  const start = Math.max(0, visibleStart - overscan);
  const end = Math.min(viewport.height, visibleEnd + overscan);
  return { x: 0, y: start, width: viewport.width, height: end - start };
};
