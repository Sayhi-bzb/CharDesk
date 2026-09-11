import type { GridCell, GridCellSource, Point } from "@/shared/types";
import { getGraphemeCellWidth as getCellOccupancy } from "@chardesk/protocol";
import {
  cellToViewportPoint as gridToScreen,
  getViewportCellBounds as getViewportGridBounds,
  viewportToCellPoint as screenToGrid,
} from "@chardesk/rendering";
import { DEFAULT_CANVAS_CELL_METRICS } from "@/shared/fonts/canvas-profile";
import { resolveGridAnchor } from "@/shared/utils/grid-occupancy";

export const GridManager = {
  screenToGrid(
    screenX: number,
    screenY: number,
    offsetX: number,
    offsetY: number,
    zoom: number
  ): Point {
    return screenToGrid(screenX, screenY, {
      offset: { x: offsetX, y: offsetY },
      zoom,
    }, DEFAULT_CANVAS_CELL_METRICS);
  },

  gridToScreen(
    gridX: number,
    gridY: number,
    offsetX: number,
    offsetY: number,
    zoom: number
  ): Point {
    return gridToScreen(gridX, gridY, {
      offset: { x: offsetX, y: offsetY },
      zoom,
    }, DEFAULT_CANVAS_CELL_METRICS);
  },

  toKey(x: number, y: number): string {
    return `${x},${y}`;
  },

  fromKey(key: string): Point {
    const [x, y] = key.split(",").map(Number);
    return { x, y };
  },

  iterate(
    source: GridCellSource,
    callback: (value: GridCell, x: number, y: number) => void
  ): void {
    const bounds = source.getContentBounds();
    if (bounds) source.visit(bounds, (x, y, value) => callback(value, x, y));
  },

  getCharWidth(char: string): number {
    return getCellOccupancy(char);
  },

  isWideChar(char: string): boolean {
    return this.getCharWidth(char) === 2;
  },

  snapToCharStart(pos: Point, grid: Pick<GridCellSource, "get">): Point {
    return resolveGridAnchor(grid, pos);
  },

  getGridBounds(source: GridCellSource) {
    const bounds = source.getContentBounds();
    return bounds
      ? {
          minX: bounds.x,
          maxX: bounds.x + bounds.width - 1,
          minY: bounds.y,
          maxY: bounds.y + bounds.height - 1,
        }
      : { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  },

  getViewportGridBounds(
    width: number,
    height: number,
    offsetX: number,
    offsetY: number,
    zoom: number
  ) {
    return getViewportGridBounds(width, height, {
      offset: { x: offsetX, y: offsetY },
      zoom,
    }, DEFAULT_CANVAS_CELL_METRICS);
  },
};
