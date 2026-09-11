import { getGraphemeCellWidth as getCellOccupancy } from "@chardesk/protocol";
import type { GridCell, Point } from "@/shared/types";
import { cloneTextAttributes } from "@/shared/utils/ansi";
import { GridManager } from "@/shared/utils/grid";
import type { SlideGridEntry, SlideSize } from "./model";

export const isValidSlideDimension = (value: number) =>
  Number.isSafeInteger(value) && value > 0;

export const isValidSlideSize = (size: SlideSize) =>
  isValidSlideDimension(size.columns) && isValidSlideDimension(size.rows);

export const isSlidePointInBounds = (point: Point, size: SlideSize) =>
  Number.isInteger(point.x) &&
  Number.isInteger(point.y) &&
  point.x >= 0 &&
  point.x < size.columns &&
  point.y >= 0 &&
  point.y < size.rows;

export const isSlideCellInBounds = (
  point: Point,
  cell: Pick<GridCell, "char">,
  size: SlideSize
) =>
  isSlidePointInBounds(point, size) &&
  point.x + getCellOccupancy(cell.char) <= size.columns;

const cloneCell = (cell: GridCell): GridCell => {
  const attrs = cloneTextAttributes(cell.attrs);
  const cloned = { ...cell };
  if (attrs) cloned.attrs = attrs;
  else delete cloned.attrs;
  return cloned;
};

const isCoordinateKey = (key: string) => /^-?\d+,-?\d+$/.test(key);

export const normalizeSlideGridEntries = (
  entries: ReadonlyArray<readonly [string, GridCell]>,
  size: SlideSize
): SlideGridEntry[] => {
  if (!isValidSlideSize(size)) return [];

  const normalized = new Map<string, GridCell>();
  entries.forEach(([key, cell]) => {
    if (!isCoordinateKey(key)) return;
    const point = GridManager.fromKey(key);
    if (!isSlideCellInBounds(point, cell, size)) return;
    normalized.set(GridManager.toKey(point.x, point.y), cloneCell(cell));
  });

  return [...normalized.entries()].sort(([a], [b]) => {
    const pointA = GridManager.fromKey(a);
    const pointB = GridManager.fromKey(b);
    return pointA.y - pointB.y || pointA.x - pointB.x;
  });
};
