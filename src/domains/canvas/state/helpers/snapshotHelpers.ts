import type { GridCell } from "@/shared/types";
import {
  isSameTextAttributes,
} from "@/shared/utils/ansi";
import {
  createGridMap,
  decodeGridEntries,
} from "@/shared/utils/grid-codec";

export const serializeGrid = (grid: Map<string, GridCell>) => {
  return Array.from(grid.entries());
};

export const normalizeGridEntries = decodeGridEntries;
export const createMapFromEntries = createGridMap;

export const isSameCell = (a?: GridCell, b?: GridCell) => {
  if (!a || !b) return false;
  return (
    a.char === b.char &&
    a.color === b.color &&
    a.bgColor === b.bgColor &&
    a.href === b.href &&
    isSameTextAttributes(a.attrs, b.attrs)
  );
};
