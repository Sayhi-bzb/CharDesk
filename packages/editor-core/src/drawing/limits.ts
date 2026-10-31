import type { Point } from '@chardesk/cell-plane/types';

export const DRAWING_POINT_LIMIT = 100_000;
export const DRAWING_WORK_LIMIT = 200_000;
// Keep room for wide followers and the projection halo at either integer edge.
export const DRAWING_COORDINATE_LIMIT = Number.MAX_SAFE_INTEGER - 2;
export class DrawingLimitError extends Error {
  constructor() {
    super('Drawing exceeds the supported coordinate or cell limit.');
    this.name = 'DrawingLimitError';
  }
}
export function validateDrawingPoints(...points: Point[]) {
  for (const point of points)
    if (
      !Number.isSafeInteger(point.x) ||
      !Number.isSafeInteger(point.y) ||
      Math.abs(point.x) > DRAWING_COORDINATE_LIMIT ||
      Math.abs(point.y) > DRAWING_COORDINATE_LIMIT
    )
      throw new DrawingLimitError();
}
export function validateDrawingWork(work: number, limit = DRAWING_POINT_LIMIT) {
  if (!Number.isSafeInteger(work) || work < 0 || work > limit) throw new DrawingLimitError();
}
export function validateDrawingLine(start: Point, end: Point) {
  validateDrawingPoints(start, end);
  validateDrawingWork(Math.abs(end.x - start.x) + Math.abs(end.y - start.y) + 1);
}
