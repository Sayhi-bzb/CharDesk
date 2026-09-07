export type CellPoint = Readonly<{ x: number; y: number }>;
export type CellSize = Readonly<{ width: number; height: number }>;
export type CellRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type CellVisitor<T> = (x: number, y: number, cell: T) => void;

export interface CellSource<T> {
  get(point: CellPoint): T | undefined;
  visit(bounds: CellRect, visitor: CellVisitor<T>): void;
  getContentBounds(): CellRect | null;
}

export type CellChanges =
  | Readonly<{ revision: number; full: true }>
  | Readonly<{ revision: number; full: false; bounds: readonly CellRect[] }>;

export interface IncrementalCellSource<T> extends CellSource<T> {
  getRevision(): number;
  getChangesSince(revision: number): CellChanges;
}

export type CellFrame<T> = Readonly<{
  revision: number;
  viewport: CellRect;
  source: CellSource<T>;
  dirty: "full" | readonly CellRect[];
}>;

export const isIncrementalCellSource = <T>(
  source: CellSource<T>
): source is IncrementalCellSource<T> =>
  "getRevision" in source &&
  typeof source.getRevision === "function" &&
  "getChangesSince" in source &&
  typeof source.getChangesSince === "function";

const finiteInteger = (value: number) => Number.isFinite(value) && Number.isInteger(value);

export const normalizeCellRect = (rect: CellRect): CellRect => {
  if (![rect.x, rect.y, rect.width, rect.height].every(finiteInteger)) {
    throw new RangeError("Cell rectangles must contain finite integers.");
  }
  const x = rect.width < 0 ? rect.x + rect.width : rect.x;
  const y = rect.height < 0 ? rect.y + rect.height : rect.y;
  return {
    x,
    y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height),
  };
};

export const intersectCellRects = (
  leftInput: CellRect,
  rightInput: CellRect
): CellRect | null => {
  const left = normalizeCellRect(leftInput);
  const right = normalizeCellRect(rightInput);
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const endX = Math.min(left.x + left.width, right.x + right.width);
  const endY = Math.min(left.y + left.height, right.y + right.height);
  if (endX <= x || endY <= y) return null;
  return { x, y, width: endX - x, height: endY - y };
};

export const cellRectContainsPoint = (
  rectInput: CellRect,
  point: CellPoint
): boolean => {
  const rect = normalizeCellRect(rectInput);
  return point.x >= rect.x
    && point.y >= rect.y
    && point.x < rect.x + rect.width
    && point.y < rect.y + rect.height;
};

export type CellTextProjection = Readonly<{
  text: string;
  width: 1 | 2;
}>;

export const formatCellFrame = <T>(
  frame: CellFrame<T>,
  project: (cell: T) => CellTextProjection | null,
  options: Readonly<{ trimEnd?: boolean }> = {}
): string => {
  const rows = Array.from(
    { length: frame.viewport.height },
    () => new Array<string>(frame.viewport.width).fill(" ")
  );
  frame.source.visit(frame.viewport, (x, y, cell) => {
    const projected = project(cell);
    if (!projected) return;
    const row = rows[y - frame.viewport.y];
    const column = x - frame.viewport.x;
    if (!row || column < 0 || column >= row.length) return;
    row[column] = projected.text;
    if (projected.width === 2 && column + 1 < row.length) row[column + 1] = "";
  });
  return rows
    .map((row) => {
      const line = row.join("");
      return options.trimEnd ? line.replace(/ +$/u, "") : line;
    })
    .join("\n");
};
