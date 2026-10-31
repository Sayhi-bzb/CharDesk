export type CanvasReadViewport = readonly [x: number, y: number, width: number, height: number];
export const isCanvasReadViewport = (value: unknown): value is CanvasReadViewport =>
  Array.isArray(value) &&
  value.length === 4 &&
  value.every(Number.isSafeInteger) &&
  value[2] > 0 &&
  value[3] > 0 &&
  Number.isSafeInteger(value[0] + value[2]) &&
  Number.isSafeInteger(value[1] + value[3]);
