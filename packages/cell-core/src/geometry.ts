export type CellPoint = Readonly<{ x: number; y: number }>;
export type CellSize = Readonly<{ width: number; height: number }>;
export type CellRect = Readonly<{ x: number; y: number; width: number; height: number }>;

const finiteInteger = (value: number) => Number.isFinite(value) && Number.isInteger(value);

export const normalizeCellRect = (rect: CellRect): CellRect => {
  if (![rect.x, rect.y, rect.width, rect.height].every(finiteInteger)) {
    throw new RangeError("Cell rectangles must contain finite integers.");
  }
  return {
    x: rect.width < 0 ? rect.x + rect.width : rect.x,
    y: rect.height < 0 ? rect.y + rect.height : rect.y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
};

export const intersectCellRects = (leftInput: CellRect, rightInput: CellRect): CellRect | null => {
  const left = normalizeCellRect(leftInput);
  const right = normalizeCellRect(rightInput);
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const endX = Math.min(left.x + left.width, right.x + right.width);
  const endY = Math.min(left.y + left.height, right.y + right.height);
  return endX <= x || endY <= y ? null : { x, y, width: endX - x, height: endY - y };
};

export const cellRectContainsPoint = (rectInput: CellRect, point: CellPoint): boolean => {
  const rect = normalizeCellRect(rectInput);
  return point.x >= rect.x && point.y >= rect.y
    && point.x < rect.x + rect.width && point.y < rect.y + rect.height;
};
