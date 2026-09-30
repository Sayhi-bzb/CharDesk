import { describe, expect, it } from "vitest";
import { CellPlaneIndex, cellPlanePatchToOperation, createGridSurfaceReader } from "./cell-plane/model";
import { searchCanvasSurface } from "./searchSurface";
import { getTextCellWidth } from "@chardesk/protocol";
import { readCanvasViewport, isCanvasReadViewport } from "./readViewport";

const windowAt = (x: number, y: number) => [x - 8, y - 2, 32, 5];

const surface = (rows: Array<{ x: number; y: number; text: string; color?: string }>) => new CellPlaneIndex([
  cellPlanePatchToOperation("search-fixture", { rows: rows.map(({ x, y, text, color }) => ({ y, erase: [], spans: [{ x, text, color: color ?? "#000" }] })) })!,
]);

describe("Canvas surface search", () => {
  it("finds case-sensitive literal, non-overlapping matches in y/x order", () => {
    const reader = surface([{ x: 5, y: 2, text: "[hi]* hi" }, { x: -10, y: -2, text: "HI hi hi" }, { x: 0, y: 5, text: "aaaaa" }]);
    expect(searchCanvasSurface(reader, "hi").matches.map(({ viewport }) => viewport)).toEqual([
      windowAt(-7, -2), windowAt(-4, -2), windowAt(6, 2), windowAt(11, 2),
    ]);
    expect(searchCanvasSurface(reader, "[hi]*").matches[0]).toMatchObject({ viewport: windowAt(5, 2), content: expect.stringContaining("[hi]* hi") });
    expect(searchCanvasSurface(reader, "aa").matches.map(({ viewport }) => viewport)).toEqual([windowAt(0, 5), windowAt(2, 5)]);
    expect(searchCanvasSurface(reader, "absent")).toEqual({ matches: [], next: null });
  });

  it("maps CJK, emoji, and combining sequences to complete Cell glyphs", () => {
    const reader = surface([{ x: -5, y: -10, text: "你é😀好" }]);
    expect(searchCanvasSurface(reader, "é😀").matches[0]).toMatchObject({ viewport: windowAt(-3, -10), content: expect.stringContaining("你é😀好") });
    expect(searchCanvasSurface(reader, "e").matches).toEqual([]);
    expect(searchCanvasSurface(reader, "́").matches).toEqual([]);
    expect(searchCanvasSurface(reader, "\ud83d").matches).toEqual([]);
    expect(searchCanvasSurface(reader, "你", { viewport: [-4, -10, 5, 1] }).matches).toEqual([]);
    expect(searchCanvasSurface(reader, "你", { viewport: [-5, -10, 1, 1] }).matches).toEqual([]);
    expect(searchCanvasSurface(reader, "好", { viewport: [0, -10, 2, 1] }).matches[0].viewport).toEqual(windowAt(0, -10));
  });

  it("joins adjacent styles and short missing spaces, but never joins rows or huge gaps", () => {
    const reader = surface([{ x: 0, y: 0, text: "Hel", color: "#f00" }, { x: 3, y: 0, text: "lo", color: "#00f" },
      { x: 6, y: 0, text: "World" }, { x: 0, y: 1, text: "again" }, { x: 1000000, y: 0, text: "Hello" }]);
    expect(searchCanvasSurface(reader, "Hello World").matches).toMatchObject([{ viewport: windowAt(0, 0), content: expect.stringContaining("Hello World") }]);
    expect(searchCanvasSurface(reader, "Hello").matches.map(({ viewport }) => viewport)).toEqual([windowAt(0, 0), windowAt(1000000, 0)]);
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
    expect(first.next).toEqual([6, -1]);
    expect(new Set([...first.matches, ...second.matches, ...third.matches].map(({ viewport }) => viewport.join(","))).size).toBe(45);
    expect(searchCanvasSurface(reader, "X", { viewport: [-3, -2, 7, 2] }).matches).toHaveLength(6);
    expect(searchCanvasSurface(surface(Array.from({ length: 20 }, (_, y) => ({ x: 0, y, text: "X" }))), "X").next).toBeNull();
    const repeated = surface([{ x: 0, y: 0, text: "aa ".repeat(25) }]);
    const page = searchCanvasSurface(repeated, "aa");
    expect(searchCanvasSurface(repeated, "aa", { after: page.next! }).matches.map(({ viewport }) => viewport[0])).toEqual([52, 55, 58, 61, 64]);
  });

  it("clips rectangular content at Cell boundaries, leaving partial wide glyphs blank", () => {
    const reader = surface([{ x: 0, y: 0, text: `${"你".repeat(30)}X${"好".repeat(30)}` }]);
    const preview = searchCanvasSurface(reader, "X").matches[0];
    expect(preview.viewport).toEqual([52, -2, 32, 5]);
    expect(preview.content.split("\n")[2]).toBe(`${"你".repeat(4)}X${"好".repeat(11)} `);
    expect(preview.content.split("\n").every((line) => getTextCellWidth(line) === 32)).toBe(true);
    const exact = readCanvasViewport(reader, preview.viewport).content.split("\n").flatMap((line) => {
      const match = /[│┤](.*)│$/u.exec(line);
      return match ? [match[1]] : [];
    }).join("\n");
    expect(preview.content).toBe(exact);
    const leftClipped = searchCanvasSurface(surface([{ x: 0, y: 0, text: `${"你".repeat(30)}aX` }]), "X").matches[0];
    expect(leftClipped.content.split("\n")[2]).toBe(` ${"你".repeat(3)}aX${" ".repeat(23)}`);
  });

  it("returns surrounding rows and crops words without boxes, rulers, or extra fields", () => {
    const reader = surface([{ x: 10, y: 20, text: `Hello ${"w".repeat(50)}` }, { x: 10, y: 21, text: "Welcome" }]);
    const preview = searchCanvasSurface(reader, "Hello", { viewport: [10, 20, 5, 1] }).matches[0];
    expect(preview).toEqual({ viewport: [2, 18, 32, 5], content: [" ".repeat(32), " ".repeat(32),
      `${" ".repeat(8)}Hello ${"w".repeat(18)}`, `${" ".repeat(8)}Welcome${" ".repeat(17)}`, " ".repeat(32)].join("\n") });
    expect(Object.keys(preview)).toEqual(["viewport", "content"]);
    const longQuery = searchCanvasSurface(reader, `Hello ${"w".repeat(50)}`).matches[0];
    expect(longQuery.content).toBe(preview.content);
  });

  it("shifts previews at safe coordinate limits without confusing continuation positions", () => {
    const reader = createGridSurfaceReader(new Map([
      [`${-Number.MAX_SAFE_INTEGER},${-Number.MAX_SAFE_INTEGER}`, { char: "X", color: "#000" }],
      [`${Number.MAX_SAFE_INTEGER - 1},${Number.MAX_SAFE_INTEGER - 1}`, { char: "X", color: "#000" }],
    ]));
    const result = searchCanvasSurface(reader, "X");
    expect(result.matches).toHaveLength(2);
    expect(result.matches.every(({ viewport }) => isCanvasReadViewport(viewport))).toBe(true);
    expect(result.matches[0].viewport).toEqual([-Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, 32, 5]);
    expect(result.matches[1].viewport).toEqual([Number.MAX_SAFE_INTEGER - 32, Number.MAX_SAFE_INTEGER - 5, 32, 5]);
  });

  it("rejects blank, multiline, control, and malformed coordinate inputs", () => {
    const reader = surface([{ x: 0, y: 0, text: "A" }]);
    for (const query of ["", "  ", "A\nB", "A\tB", "A\u2028B", "A\u2029B", "\x1b[31mA"]) expect(() => searchCanvasSurface(reader, query)).toThrow();
    expect(() => searchCanvasSurface(reader, "A", { viewport: [0, 0, 0, 1] })).toThrow();
    expect(() => searchCanvasSurface(reader, "A", { after: [0.5, 0] })).toThrow();
    expect(searchCanvasSurface(new CellPlaneIndex(), "A")).toEqual({ matches: [], next: null });
  });
});
