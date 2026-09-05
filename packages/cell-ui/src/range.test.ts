import { describe, expect, it } from "vitest";
import { CellBuffer } from "./buffer.js";
import {
  createCellRangeSnapshot,
  extractCellRange,
  normalizeCellRange,
} from "./range.js";

describe("Cell Range", () => {
  it("extracts rendered borders and removes only trailing spaces per row", () => {
    const buffer = new CellBuffer({ width: 6, height: 3 });
    buffer.writeText(0, 0, "┌──┐  ", "panel");
    buffer.writeText(0, 1, "│中│  ", "panel");
    expect(extractCellRange(buffer, { x: 0, y: 0, width: 6, height: 3 }, { trimEnd: true }))
      .toBe("┌──┐\n│中│\n");
  });

  it("normalizes reverse and out-of-viewport selections", () => {
    const buffer = new CellBuffer({ width: 8, height: 4 });
    expect(normalizeCellRange(buffer, { x: 20, y: 3 }, { x: -4, y: 1 }))
      .toEqual({ x: 0, y: 1, width: 8, height: 3 });
    expect(createCellRangeSnapshot(buffer, { x: 20, y: 3 }, { x: -4, y: 1 }))
      .toMatchObject({ anchor: { x: 7, y: 3 }, head: { x: 0, y: 1 } });
  });

  it("expands a half-selected wide grapheme to its complete Cells", () => {
    const buffer = new CellBuffer({ width: 5, height: 1 });
    buffer.writeText(1, 0, "中", "text");
    const bounds = normalizeCellRange(buffer, { x: 2, y: 0 }, { x: 2, y: 0 });
    expect(bounds).toEqual({ x: 1, y: 0, width: 2, height: 1 });
    expect(extractCellRange(buffer, bounds)).toBe("中");
  });

  it("computes the fixed-point rectangle for staggered wide graphemes", () => {
    const left = new CellBuffer({ width: 5, height: 2 });
    left.writeText(0, 0, "中", "row-0");
    left.writeText(1, 1, "中", "row-1");
    const leftBounds = normalizeCellRange(left, { x: 2, y: 1 }, { x: 2, y: 0 });
    expect(leftBounds).toEqual({ x: 0, y: 0, width: 3, height: 2 });
    expect(extractCellRange(left, leftBounds)).toBe("中 \n 中");

    const right = new CellBuffer({ width: 5, height: 2 });
    right.writeText(3, 0, "中", "row-0");
    right.writeText(2, 1, "中", "row-1");
    const rightBounds = normalizeCellRange(right, { x: 2, y: 0 }, { x: 2, y: 1 });
    expect(rightBounds).toEqual({ x: 2, y: 0, width: 3, height: 2 });
    expect(extractCellRange(right, rightBounds)).toBe(" 中\n中 ");
  });

  it("preserves internal spaces and supports strict rectangular output", () => {
    const buffer = new CellBuffer({ width: 5, height: 1 });
    buffer.writeText(0, 0, "A B", "text");
    expect(extractCellRange(buffer, { x: 0, y: 0, width: 5, height: 1 }))
      .toBe("A B  ");
    expect(extractCellRange(
      buffer,
      { x: 0, y: 0, width: 5, height: 1 },
      { trimEnd: true }
    )).toBe("A B");
  });

  it("preserves trailing Unicode spaces when trimming Cell padding", () => {
    const buffer = new CellBuffer({ width: 7, height: 1 });
    buffer.writeText(0, 0, "X\u00a0\u3000", "text");
    expect(extractCellRange(
      buffer,
      { x: 0, y: 0, width: 7, height: 1 },
      { trimEnd: true }
    )).toBe("X\u00a0\u3000");
  });
});
