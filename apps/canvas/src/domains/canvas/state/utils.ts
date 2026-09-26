import type { GridCell } from "@/shared/types";
import { writeCell, writeStyledCell } from "@/shared/utils/grid-ops";
import { styleStateToCell, type AnsiStyleState } from "@/shared/utils/ansi";
import { createPointGridReader, resolveGridSlot } from "@/shared/utils/grid-occupancy";

type CellWriteOptions = {
  preserveTargetBackground?: boolean;
};

const resolveTargetBackground = (
  targetGrid: GridWriter,
  x: number,
  y: number
) => {
  return resolveGridSlot(createPointGridReader(targetGrid), { x, y })?.cell.bgColor;
};

type GridWriter = {
  set(key: string, value: GridCell): void;
  delete(key: string): void;
  get(key: string): GridCell | undefined;
};

export const placeCharInMap = (
  targetMap: {
    set(key: string, value: GridCell): void;
    delete(key: string): void;
    get(key: string): GridCell | undefined;
  },
  x: number,
  y: number,
  char: string,
  color: string
) => {
  writeCell(targetMap, x, y, char, color);
};

export const placeStyledCellInYMap = (
  targetGrid: GridWriter,
  x: number,
  y: number,
  char: string,
  style: AnsiStyleState,
  options?: CellWriteOptions
) => {
  const targetBackground = options?.preserveTargetBackground
    ? resolveTargetBackground(targetGrid, x, y)
    : undefined;
  const nextStyle =
    style.bgColor === undefined && targetBackground
      ? { ...style, bgColor: targetBackground }
      : style;
  writeStyledCell(targetGrid, x, y, styleStateToCell(char, nextStyle));
};

export const placeCharInYMap = (
  targetGrid: GridWriter,
  x: number,
  y: number,
  char: string,
  color: string,
  options?: CellWriteOptions
) => {
  placeStyledCellInYMap(targetGrid, x, y, char, { color }, options);
};
