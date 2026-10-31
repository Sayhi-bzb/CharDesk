import { getGraphemeCellWidth } from '@chardesk/protocol';
import type { GridCellSource } from './types.js';
export const GridManager = {
  getCharWidth: getGraphemeCellWidth,
  iterate(
    source: GridCellSource,
    callback: (cell: import('./types.js').GridCell, x: number, y: number) => void
  ) {
    const bounds = source.getContentBounds();
    if (bounds) source.visit(bounds, (x, y, cell) => callback(cell, x, y));
  },
  toKey: (x: number, y: number) => `${x},${y}`,
  fromKey: (key: string) => {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  },
  getGridBounds(source: GridCellSource) {
    const b = source.getContentBounds();
    return b
      ? { minX: b.x, minY: b.y, maxX: b.x + b.width - 1, maxY: b.y + b.height - 1 }
      : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  },
};
