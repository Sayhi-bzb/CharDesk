import type { Point } from "@/shared/types";

export type GridAddress = Point;

export interface GridRange {
  start: GridAddress;
  end: GridAddress;
}

export type GridBounds = GridRange;
