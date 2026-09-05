import { describe, expect, it } from "vitest";
import { FixedVirtualGrid } from "./index.js";

const rows = (count: number, offset = 0) => Array.from(
  { length: count },
  (_, index) => ({ id: `row-${index + offset}` })
);

describe("FixedVirtualGrid", () => {
  it("keeps a 100k-row two-dimensional mount window bounded", () => {
    const grid = new FixedVirtualGrid({
      rows: rows(100_000),
      columnCount: 1_000,
      getRowKey: (row) => row.id,
      viewport: { width: 40, height: 10 },
      rowHeight: 1,
      columnWidth: 1,
      overscanRows: 2,
      overscanColumns: 2,
    });

    const snapshot = grid.scrollTo({ x: 500, y: 50_000 });
    expect(snapshot.visibleRows).toEqual({ start: 50_000, end: 50_010 });
    expect(snapshot.visibleColumns).toEqual({ start: 500, end: 540 });
    expect(snapshot.cacheRows).toEqual({ start: 49_998, end: 50_012 });
    expect(snapshot.cacheColumns).toEqual({ start: 498, end: 542 });
    expect(snapshot.mountedCount).toBe(14 * 44);
    expect(snapshot.mountedCount).toBeLessThan(700);
    grid.dispose();
  });

  it("preserves a stable row-key anchor when rows are inserted above it", () => {
    const original = rows(100);
    const grid = new FixedVirtualGrid({
      rows: original,
      columnCount: 1,
      getRowKey: (row) => row.id,
      viewport: { width: 1, height: 10 },
      rowHeight: 2,
    });
    grid.scrollTo({ x: 0, y: 81 });
    expect(grid.snapshot().anchor).toMatchObject({
      rowKey: "row-40",
      rowOffset: 1,
    });

    grid.setRows([{ id: "inserted-a" }, { id: "inserted-b" }, ...original]);
    expect(grid.snapshot()).toMatchObject({
      scrollOffset: { x: 0, y: 85 },
      anchor: { rowKey: "row-40", rowOffset: 1 },
    });
    grid.dispose();
  });

  it("reveals rows and columns with nearest and centered alignment", () => {
    const grid = new FixedVirtualGrid({
      rows: rows(1_000),
      columnCount: 100,
      getRowKey: (row) => row.id,
      viewport: { width: 20, height: 10 },
      rowHeight: 2,
      columnWidth: 3,
    });

    expect(grid.reveal("row-50", 30).scrollOffset).toEqual({ x: 73, y: 92 });
    expect(grid.reveal("row-100", 50, "center").scrollOffset)
      .toEqual({ x: 142, y: 196 });
    grid.dispose();
  });

  it("keeps offscreen cells alive within an LRU bound", () => {
    const grid = new FixedVirtualGrid({
      rows: rows(100),
      columnCount: 10,
      getRowKey: (row) => row.id,
      viewport: { width: 2, height: 2 },
      overscanRows: 0,
      overscanColumns: 0,
      keepAliveLimit: 2,
    });
    grid.keepAlive("row-50", 5);
    grid.keepAlive("row-60", 6);
    grid.keepAlive("row-70", 7);

    const keptAlive = grid.snapshot().cells.filter((cell) => cell.keptAlive);
    expect(keptAlive.map(({ rowKey, columnIndex }) => [rowKey, columnIndex]))
      .toEqual([["row-60", 6], ["row-70", 7]]);
    expect(grid.snapshot().mountedCount).toBe(6);
    grid.dispose();
  });

  it("rejects duplicate stable keys and use after dispose", () => {
    expect(() => new FixedVirtualGrid({
      rows: [{ id: "same" }, { id: "same" }],
      columnCount: 1,
      getRowKey: (row) => row.id,
      viewport: { width: 1, height: 1 },
    })).toThrow("Duplicate virtual row key: same");

    const grid = new FixedVirtualGrid({
      rows: rows(1),
      columnCount: 1,
      getRowKey: (row) => row.id,
      viewport: { width: 1, height: 1 },
    });
    grid.dispose();
    expect(() => grid.snapshot()).toThrow("FixedVirtualGrid has been disposed");
  });
});
