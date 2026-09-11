import type { CellSource } from "@chardesk/cell-core";

export interface Point {
  x: number;
  y: number;
}

export interface GridCell {
  char: string;
  color: string;
  bgColor?: string;
  attrs?: TextAttributes;
  href?: string;
}

export interface GridPoint extends Point {
  char: string;
  color?: string;
  bgColor?: string;
  attrs?: TextAttributes;
  href?: string;
}

export interface SelectionArea {
  start: Point;
  end: Point;
}

export type GridMap = Map<string, GridCell>;

/** Read-only cell content shared across domain boundaries. */
export type GridCellSource = CellSource<GridCell>;

export interface NodeBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextAttributes {
  bold?: true;
  italic?: true;
  underline?: true;
  strike?: true;
  inverse?: true;
}
