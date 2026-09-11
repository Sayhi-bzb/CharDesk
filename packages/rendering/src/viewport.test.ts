import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHARDESK_CELL_METRICS,
  cellToViewportPoint,
  getCellViewportRect,
  getViewportCellBounds,
  resolveCellFrameViewportLayout,
  viewportToCellPoint,
} from "./index.js";

describe("Cell viewport geometry", () => {
  it("converts points through one metrics contract", () => {
    const viewport = { offset: { x: 10, y: 20 }, zoom: 2 };
    const point = cellToViewportPoint(3, 4, viewport);
    expect(point).toEqual({
      x: 10 + 3 * DEFAULT_CHARDESK_CELL_METRICS.cellWidth * 2,
      y: 20 + 4 * DEFAULT_CHARDESK_CELL_METRICS.cellHeight * 2,
    });
    expect(viewportToCellPoint(point.x, point.y, viewport)).toEqual({ x: 3, y: 4 });
  });

  it("projects cell rectangles and visible bounds at fractional zoom", () => {
    const viewport = { offset: { x: -4, y: 7 }, zoom: 1.5 };
    expect(getCellViewportRect({ x: 2, y: 3 }, viewport)).toEqual({
      x: -4 + 2 * DEFAULT_CHARDESK_CELL_METRICS.cellWidth * 1.5,
      y: 7 + 3 * DEFAULT_CHARDESK_CELL_METRICS.cellHeight * 1.5,
      width: DEFAULT_CHARDESK_CELL_METRICS.cellWidth * 1.5,
      height: DEFAULT_CHARDESK_CELL_METRICS.cellHeight * 1.5,
    });
    expect(getViewportCellBounds(90, 60, viewport)).toEqual({
      startX: 0,
      endX: 7,
      startY: -1,
      endY: 2,
    });
  });

  it("fits a frame without changing its logical viewport", () => {
    expect(resolveCellFrameViewportLayout({
      viewportWidth: 200,
      viewportHeight: 100,
      frameViewport: { x: -2, y: 1, width: 10, height: 4 },
      metrics: DEFAULT_CHARDESK_CELL_METRICS,
      padding: 0,
      maxScale: 1,
    })).toEqual({ offset: { x: 73, y: -10 }, width: 90, height: 80, scale: 1 });
  });
});
