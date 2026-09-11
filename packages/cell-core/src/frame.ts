import type { CellPoint, CellRect } from "./geometry.js";

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
export const isIncrementalCellSource = <T>(source: CellSource<T>): source is IncrementalCellSource<T> =>
  "getRevision" in source && typeof source.getRevision === "function"
  && "getChangesSince" in source && typeof source.getChangesSince === "function";

export type CellTextProjection = Readonly<{ text: string; width: 1 | 2 }>;
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
  return rows.map((row) => {
    const line = row.join("");
    return options.trimEnd ? line.replace(/ +$/u, "") : line;
  }).join("\n");
};
