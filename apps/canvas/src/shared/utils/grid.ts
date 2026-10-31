import { GridManager as logicalGrid } from "@chardesk/cell-plane/grid";
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

  toKey: logicalGrid.toKey,
  fromKey: logicalGrid.fromKey,

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

  getGridBounds: logicalGrid.getGridBounds,

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
