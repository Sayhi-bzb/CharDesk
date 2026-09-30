import { describe, expect, it } from "vitest";
import { CellPlaneIndex, cellPlanePatchToOperation } from "./cell-plane/model";
import { searchCanvasSurface } from "./searchSurface";

const surface = (rows: Array<{ x: number; y: number; text: string; color?: string }>) => new CellPlaneIndex([
  cellPlanePatchToOperation("search-fixture", { rows: rows.map(({ x, y, text, color }) => ({ y, erase: [], spans: [{ x, text, color: color ?? "#000" }] })) })!,
]);

describe("Canvas surface search", () => {
  it("finds case-sensitive literal, non-overlapping matches in y/x order", () => {
    const reader = surface([{ x: 5, y: 2, text: "[hi]* hi" }, { x: -10, y: -2, text: "HI hi hi" }, { x: 0, y: 5, text: "aaaaa" }]);
    expect(searchCanvasSurface(reader, "hi").matches.map(({ bounds }) => bounds)).toEqual([
      [-7, -2, 2, 1], [-4, -2, 2, 1], [6, 2, 2, 1], [11, 2, 2, 1],
    ]);
    expect(searchCanvasSurface(reader, "[hi]*").matches[0]).toEqual({ bounds: [5, 2, 5, 1], text: "[hi]* hi" });
    expect(searchCanvasSurface(reader, "aa").matches.map(({ bounds }) => bounds)).toEqual([[0, 5, 2, 1], [2, 5, 2, 1]]);
    expect(searchCanvasSurface(reader, "absent")).toEqual({ matches: [], next: null });
  });

  it("maps CJK, emoji, and combining sequences to complete Cell glyphs", () => {
    const reader = surface([{ x: -5, y: -10, text: "你é😀好" }]);
    expect(searchCanvasSurface(reader, "é😀").matches[0]).toMatchObject({ bounds: [-3, -10, 3, 1] });
    expect(searchCanvasSurface(reader, "e").matches).toEqual([]);
    expect(searchCanvasSurface(reader, "́").matches).toEqual([]);
    expect(searchCanvasSurface(reader, "\ud83d").matches).toEqual([]);
    expect(searchCanvasSurface(reader, "你", { viewport: [-4, -10, 5, 1] }).matches).toEqual([]);
    expect(searchCanvasSurface(reader, "你", { viewport: [-5, -10, 1, 1] }).matches).toEqual([]);
    expect(searchCanvasSurface(reader, "好", { viewport: [0, -10, 2, 1] }).matches[0].bounds).toEqual([0, -10, 2, 1]);
  });

  it("joins adjacent styles and short missing spaces, but never joins rows or huge gaps", () => {
    const reader = surface([{ x: 0, y: 0, text: "Hel", color: "#f00" }, { x: 3, y: 0, text: "lo", color: "#00f" },
      { x: 6, y: 0, text: "World" }, { x: 0, y: 1, text: "again" }, { x: 1000000, y: 0, text: "Hello" }]);
    expect(searchCanvasSurface(reader, "Hello World").matches).toEqual([{ bounds: [0, 0, 11, 1], text: "Hello World" }]);
    expect(searchCanvasSurface(reader, "Hello").matches.map(({ bounds }) => bounds)).toEqual([[0, 0, 5, 1], [1000000, 0, 5, 1]]);
    expect(searchCanvasSurface(reader, "Worldagain").matches).toEqual([]);
    expect(searchCanvasSurface(reader, "World Hello").matches).toEqual([]);
  });

  it("filters the region and paginates without skipping or repeating matches", () => {
    const reader = surface(Array.from({ length: 45 }, (_, index) => ({ x: index % 5 * 3 - 6, y: Math.floor(index / 5) - 4, text: "X" })));
    const first = searchCanvasSurface(reader, "X");
    const second = searchCanvasSurface(reader, "X", { after: first.next! });
    const third = searchCanvasSurface(reader, "X", { after: second.next! });
    expect(first.matches).toHaveLength(20);
    expect(second.matches).toHaveLength(20);
    expect(third.matches).toHaveLength(5);
    expect(third.next).toBeNull();
    expect(new Set([...first.matches, ...second.matches, ...third.matches].map(({ bounds }) => bounds.join(","))).size).toBe(45);
    expect(searchCanvasSurface(reader, "X", { viewport: [-3, -2, 7, 2] }).matches).toHaveLength(6);
    expect(searchCanvasSurface(surface(Array.from({ length: 20 }, (_, y) => ({ x: 0, y, text: "X" }))), "X").next).toBeNull();
    const repeated = surface([{ x: 0, y: 0, text: "aa ".repeat(25) }]);
    const page = searchCanvasSurface(repeated, "aa");
    expect(searchCanvasSurface(repeated, "aa", { after: page.next! }).matches.map(({ bounds }) => bounds[0])).toEqual([60, 63, 66, 69, 72]);
  });

  it("bounds context in Cells without cutting graphemes", () => {
    const reader = surface([{ x: 0, y: 0, text: `${"你".repeat(30)}X${"好".repeat(30)}` }]);
    expect(searchCanvasSurface(reader, "X").matches).toEqual([{ bounds: [60, 0, 1, 1], text: `${"你".repeat(10)}X${"好".repeat(10)}` }]);
  });

  it("rejects blank, multiline, control, and malformed coordinate inputs", () => {
    const reader = surface([{ x: 0, y: 0, text: "A" }]);
    for (const query of ["", "  ", "A\nB", "A\tB", "A\u2028B", "A\u2029B", "\x1b[31mA"]) expect(() => searchCanvasSurface(reader, query)).toThrow();
    expect(() => searchCanvasSurface(reader, "A", { viewport: [0, 0, 0, 1] })).toThrow();
    expect(() => searchCanvasSurface(reader, "A", { after: [0.5, 0] })).toThrow();
    expect(searchCanvasSurface(new CellPlaneIndex(), "A")).toEqual({ matches: [], next: null });
  });
});
