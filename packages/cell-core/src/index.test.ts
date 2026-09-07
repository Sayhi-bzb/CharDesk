import { describe, expect, it } from "vitest";
import {
  cellRectContainsPoint,
  intersectCellRects,
  formatCellFrame,
  isIncrementalCellSource,
  normalizeCellRect,
  type CellSource,
} from "./index.js";

describe("Cell Core contracts", () => {
  it("normalizes negative extents and intersects half-open rectangles", () => {
    expect(normalizeCellRect({ x: 5, y: 4, width: -3, height: -2 })).toEqual({
      x: 2,
      y: 2,
      width: 3,
      height: 2,
    });
    expect(intersectCellRects(
      { x: -2, y: -1, width: 4, height: 3 },
      { x: 0, y: 0, width: 3, height: 3 }
    )).toEqual({ x: 0, y: 0, width: 2, height: 2 });
    expect(intersectCellRects(
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 1, y: 0, width: 1, height: 1 }
    )).toBeNull();
  });

  it("recognizes incremental sources without prescribing storage", () => {
    const source: CellSource<string> = {
      get: () => undefined,
      visit: () => undefined,
      getContentBounds: () => null,
    };
    expect(isIncrementalCellSource(source)).toBe(false);
    expect(isIncrementalCellSource({
      ...source,
      getRevision: () => 2,
      getChangesSince: () => ({ revision: 2, full: false, bounds: [] }),
    })).toBe(true);
  });

  it("tests points against normalized half-open rectangles", () => {
    const rect = { x: 4, y: 5, width: -3, height: -2 };
    expect(cellRectContainsPoint(rect, { x: 1, y: 3 })).toBe(true);
    expect(cellRectContainsPoint(rect, { x: 3, y: 4 })).toBe(true);
    expect(cellRectContainsPoint(rect, { x: 4, y: 4 })).toBe(false);
    expect(cellRectContainsPoint(rect, { x: 3, y: 5 })).toBe(false);
  });

  it("rejects fractional geometry", () => {
    expect(() => normalizeCellRect({ x: 0.5, y: 0, width: 1, height: 1 }))
      .toThrow("finite integers");
  });

  it("formats dense or sparse frames without duplicating wide Cells", () => {
    const cells = new Map([
      ["-1,0", { text: "界", width: 2 as const }],
      ["1,1", { text: "x", width: 1 as const }],
    ]);
    const source: CellSource<{ text: string; width: 1 | 2 }> = {
      get: ({ x, y }) => cells.get(`${x},${y}`),
      visit(bounds, visitor) {
        for (const [key, cell] of cells) {
          const [x, y] = key.split(",").map(Number) as [number, number];
          if (x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height) {
            visitor(x, y, cell);
          }
        }
      },
      getContentBounds: () => ({ x: -1, y: 0, width: 3, height: 2 }),
    };
    expect(formatCellFrame({
      revision: 1,
      viewport: { x: -1, y: 0, width: 3, height: 2 },
      source,
      dirty: "full",
    }, (cell) => cell, { trimEnd: true })).toBe("界\n  x");
  });
});
