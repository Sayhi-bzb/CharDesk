import type { Point } from '@chardesk/cell-plane/types';

export type GridAddress = Point;

export interface GridRange {
  start: GridAddress;
  end: GridAddress;
}

export type GridBounds = GridRange;
