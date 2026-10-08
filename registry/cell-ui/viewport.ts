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
