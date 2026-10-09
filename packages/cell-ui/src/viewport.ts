import type { CellPoint, CellRect } from "./types.js";

export type CellViewportState = Readonly<{
  viewport: CellRect;
  scrollX: number;
  scrollY: number;
  zoom: number;
}>;

export type CellAutoScrollRequest = Readonly<{
  axis: "x" | "y" | "both";
  direction: "negative" | "positive";
  velocity: number;
  pointer: CellPoint;
  /** Signed Cell velocities; preserves both directions at corners. */
  velocityX?: number;
  velocityY?: number;
}>;

export type CellVisibleRange = Readonly<{ start: number; end: number }>;

export const cellVisibleRange = (
  offset: number, extent: number, itemSize: number, overscan = 0,
): CellVisibleRange => {
  if (!(itemSize > 0) || !(extent > 0)) return { start: 0, end: 0 };
  const start = Math.max(0, Math.floor(offset / itemSize) - Math.max(0, Math.trunc(overscan)));
  const end = Math.max(start, Math.ceil((offset + extent) / itemSize) + Math.max(0, Math.trunc(overscan)));
  return { start, end };
};

export const createCellViewportState = (
  viewport: CellRect,
  options: Readonly<{ scrollX?: number; scrollY?: number; zoom?: number }> = {},
): CellViewportState => ({
  viewport,
  scrollX: Math.max(0, Math.trunc(options.scrollX ?? 0)),
  scrollY: Math.max(0, Math.trunc(options.scrollY ?? 0)),
  zoom: Number.isFinite(options.zoom) && (options.zoom ?? 1) > 0 ? options.zoom ?? 1 : 1,
});

export const cellPointToViewport = (state: CellViewportState, point: CellPoint): CellPoint => ({
  x: Math.round((point.x - state.viewport.x) * state.zoom) - state.scrollX,
  y: Math.round((point.y - state.viewport.y) * state.zoom) - state.scrollY,
});

/** Edge requests are scoped to a Cell viewport; the host owns scroll state. */
export const cellAutoScrollRequest = (viewport: CellRect, pointer: CellPoint, edge = 3): CellAutoScrollRequest | null => {
  if (!(viewport.width > 0) || !(viewport.height > 0) || !(edge > 0)) return null;
  const speed = (point: number, start: number, extent: number): number => {
    const left = point - start, right = start + extent - 1 - point;
    if (left >= edge && right >= edge) return 0;
    return left <= right ? -Math.max(1, Math.min(edge, edge - left)) : Math.max(1, Math.min(edge, edge - right));
  };
  const velocityX = speed(pointer.x, viewport.x, viewport.width), velocityY = speed(pointer.y, viewport.y, viewport.height);
  if (!velocityX && !velocityY) return null;
  return { axis: velocityX && velocityY ? "both" : velocityX ? "x" : "y",
    direction: (velocityX || velocityY) < 0 ? "negative" : "positive",
    velocity: Math.max(Math.abs(velocityX), Math.abs(velocityY)), pointer, velocityX, velocityY };
};
