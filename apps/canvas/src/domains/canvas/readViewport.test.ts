import { describe, expect, it } from "vitest";
import { getTextCellWidth } from "@chardesk/protocol";
import { CellPlaneIndex, cellPlanePatchToOperation, createGridSurfaceReader } from "./cell-plane/model";
import { isCanvasReadViewport, readCanvasViewport } from "./readViewport";
import type { GridCell } from "@/shared/types";

const surface = (entries: Array<[number, number, string, string?]>) => createGridSurfaceReader(new Map(
  entries.map(([x, y, char, bgColor]) => [`${x},${y}`, { char, color: "#000", ...(bgColor ? { bgColor } : {}) }]),
));
const lines = (content: string) => content.split("\n").flatMap((line) => {
  const match = /[│┤](.*)$/u.exec(line);
  return match ? [match[1]] : [];
});

describe("Canvas viewport reading", () => {
  it("preserves coordinates, whitespace, CJK, and graphemes in exact text", () => {
    const view = readCanvasViewport(surface([[-2, -1, "A"], [-1, -1, "你"], [1, -1, "é"]]), [-3, -2, 7, 3]);
    expect(view).toMatchObject({ viewport: [-3, -2, 7, 3], sampleSize: 1, mode: "text", overviewOnly: false });
    expect(lines(view.content)).toEqual(["", " A你é", ""]);
    expect(lines(view.content).every((line) => getTextCellWidth(line) <= 7)).toBe(true);
    expect(view.content).toContain("0 ┤");
    expect(view.content).not.toContain("7890123");
  });

  it("adds absolute style notes for visible glyphs and styled spaces, with sparse ticks", () => {
    const grid = new Map<string, GridCell>([
      ["10,20", { char: "你", color: "#f00", attrs: { bold: true } }],
      ["12,20", { char: "A", color: "#f00", attrs: { bold: true } }],
      ["13,20", { char: " ", color: "#000", bgColor: "#fff", attrs: { inverse: true } }],
      ["10,21", { char: "你", color: "#f00", attrs: { bold: true } }],
      ["12,21", { char: "B", color: "#f00", attrs: { bold: true } }],
      ["14,21", { char: "L", color: "#00f", attrs: { underline: true }, href: "https://example.com" }],
    ]);
    const view = readCanvasViewport(createGridSurfaceReader(grid), [10, 20, 8, 2]);
    expect(view.content).toContain("┬────┬──");
    expect(view.content).not.toContain("01234567");
    expect(lines(view.content)).toEqual(["你A", "你B L"]);
    expect(view.content).toContain("y=20..21 x=10..12{fg:#f00;bold}");
    expect(view.content).toContain("y=20 x=13{fg:#000;bg:#fff;inverse}");
    expect(view.content).toContain('y=21 x=14{fg:#00f;underline;link:"https://example.com"}');
    expect(readCanvasViewport(createGridSurfaceReader(grid), [11, 20, 2, 1]).content).not.toContain("x=10");
    expect(readCanvasViewport(createGridSurfaceReader(grid), [10, 20, 1, 1]).content).not.toContain("styles:");
  });

  it("does not attach source styles to navigation symbols or empty regions", () => {
    const reader = surface([[10, 20, "A"]]);
    for (const viewport of [[0, 0, 160, 48], [0, 0, 800, 240]] as const) {
      const view = readCanvasViewport(reader, viewport);
      expect(view.content).not.toContain("styles:");
      expect(view.content).toContain("Styles omitted:");
      expect(view.content).not.toContain("0123456789");
    }
    expect(readCanvasViewport(reader, [0, 0, 2, 1]).content).not.toContain("styles:");
  });

  it("retains visually styled whitespace in automatic bounds and style notes", () => {
    const reader = createGridSurfaceReader(new Map([
      ["-10,-20", { char: " ", color: "#fff", attrs: { inverse: true as const } }],
    ]));
    const view = readCanvasViewport(reader);
    expect(view.viewport).toEqual([-10, -20, 1, 1]);
    expect(view.content).toContain("y=-20 x=-10{fg:#fff;inverse}");
  });

  it("leaves clipped wide characters blank without changing the viewport", () => {
    const reader = surface([[0, 0, "你"], [2, 0, "B"]]);
    expect(lines(readCanvasViewport(reader, [1, 0, 2, 1]).content)).toEqual([" B"]);
    expect(lines(readCanvasViewport(reader, [0, 0, 1, 1]).content)).toEqual([""]);
  });

  it("samples quadrant positions without interpreting content", () => {
    const view = readCanvasViewport(surface([[0, 0, "a"], [3, 1, "b"]]), [0, 0, 160, 48]);
    expect(view).toMatchObject({ sampleSize: 2, mode: "projection", overviewOnly: true });
    expect(lines(view.content)[0].slice(0, 2)).toBe("▘▗");
    expect(lines(view.content)).toHaveLength(24);
  });

  it("keeps isolated content and background-only cells in density maps", () => {
    const entries: Array<[number, number, string, string?]> = [[0, 0, "x"], [10, 0, " ", "#f00"]];
    for (let y = 0; y < 10; y++) for (let x = 20; x < 30; x++) entries.push([x, y, "x"]);
    const view = readCanvasViewport(surface(entries), [0, 0, 800, 240]);
    expect(view).toMatchObject({ sampleSize: 10, mode: "density", overviewOnly: true });
    expect(lines(view.content)[0].slice(0, 4)).toBe("░░█·");
  });

  it("fits rectangular views without stretching or expanding partial edge buckets", () => {
    const view = readCanvasViewport(surface([[80, 24, "x"]]), [0, 0, 81, 25]);
    expect(view.sampleSize).toBe(2);
    expect(lines(view.content)).toHaveLength(13);
    expect(lines(view.content)[12]).toHaveLength(41);
    expect(lines(view.content)[12][40]).toBe("▘");
  });

  it("distinguishes empty documents from explicit blank views and excludes unstyled spaces", () => {
    const reader = surface([[0, 0, " "]]);
    expect(readCanvasViewport(reader)).toEqual({ viewport: null, sampleSize: 1, mode: "text", overviewOnly: false, content: "" });
    expect(readCanvasViewport(reader, [-10, 2, 4, 1]).viewport).toEqual([-10, 2, 4, 1]);
    expect(lines(readCanvasViewport(reader, [-10, 2, 4, 1]).content)).toEqual([""]);
  });

  it("reads sparse content millions of Cells apart after an erase invalidates bounds", () => {
    const index = new CellPlaneIndex([
      cellPlanePatchToOperation("left", { rows: [{ y: 0, erase: [], spans: [{ x: 0, text: "A", color: "#000" }] }] })!,
      cellPlanePatchToOperation("right", { rows: [{ y: 1000000, erase: [], spans: [{ x: 1000000, text: "B", color: "#000" }] }] })!,
      cellPlanePatchToOperation("erase", { rows: [{ y: 0, erase: [{ from: 0, to: 1 }], spans: [] }] })!,
    ]);
    expect(readCanvasViewport(index).viewport).toEqual([1000000, 1000000, 1, 1]);
    const view = readCanvasViewport(index, [0, 0, 1000001, 1000001]);
    expect(view.mode).toBe("density");
    expect(lines(view.content).join("")).toContain("░");
    expect(lines(view.content).length).toBeLessThanOrEqual(24);
  });

  it("rejects invalid sizes and unsafe endpoints", () => {
    for (const value of [[0, 0, 0, 1], [0, 0, 1.5, 2], [Number.MAX_SAFE_INTEGER, 0, 1, 1], [0, 0, 1], null]) {
      expect(isCanvasReadViewport(value)).toBe(false);
    }
  });

  it("centres signed labels on absolute ticks across zero and leaves other rows unlabelled", () => {
    const view = readCanvasViewport(surface([]), [-12, -7, 28, 14]);
    const output = view.content.split("\n");
    const bodyOrigin = output.find((line) => line.includes("┤"))!.indexOf("┤") + 1;
    const labels = output[1];
    for (const coordinate of [-10, 0, 10]) {
      const label = String(coordinate);
      expect(labels.slice(bodyOrigin + coordinate + 12 - Math.floor(label.length / 2), bodyOrigin + coordinate + 12 - Math.floor(label.length / 2) + label.length)).toBe(label);
    }
    const ruler = output.find((line) => line.includes("┬"))!;
    for (const coordinate of [-10, -5, 0, 5, 10, 15]) expect(ruler[bodyOrigin + coordinate + 12]).toBe("┬");
    const body = output.filter((line) => /[│┤]/u.test(line));
    expect(body.map((line) => line.slice(0, bodyOrigin - 1).trim()).filter(Boolean)).toEqual(["-5", "0", "5"]);
    expect(lines(view.content)).toHaveLength(14);
  });

  it("aligns narrow edge labels without clipping negative coordinates or the content", () => {
    const view = readCanvasViewport(surface([[-1000, 0, "你"]]), [-1000, 0, 2, 1]);
    const output = view.content.split("\n");
    const origin = output.find((line) => line.includes("┤"))!.indexOf("┤") + 1;
    expect(output[1].indexOf("-1000") + 2).toBe(origin);
    expect(lines(view.content)).toEqual(["你"]);
    expect(view.content).toContain("y=0 x=-1000..-999{fg:#000}");
  });

  it("adapts coarse ticks to absolute coordinates even when buckets start between ticks", () => {
    const view = readCanvasViewport(surface([]), [-13, -7, 240, 60]);
    expect(view.sampleSize).toBe(3);
    const output = view.content.split("\n");
    const origin = output.find((line) => line.includes("┤"))!.indexOf("┤") + 1;
    const ruler = output.find((line) => line.includes("┬"))!;
    expect(output[1][origin + 4]).toBe("0"); // [-1,2) contains the zero tick.
    expect(ruler[origin + 4]).toBe("┬");
    expect(ruler[origin + 11]).toBe("┬"); // [20,23) contains the minor tick at 20.
    expect(lines(view.content)).toHaveLength(20);
    expect(output.filter((line) => /[│┤]/u.test(line)).map((line) => line.slice(0, origin - 1).trim()).filter(Boolean)).toEqual(["0", "20", "40"]);
  });

  it("keeps very large coordinate labels separated and endpoints safe", () => {
    const start = Number.MAX_SAFE_INTEGER - 80;
    const view = readCanvasViewport(surface([]), [start, -Number.MAX_SAFE_INTEGER, 80, 24]);
    expect(lines(view.content).every((line) => getTextCellWidth(line) <= 80)).toBe(true);
    const labels = view.content.split("\n")[1].trim().split(/\s+/u);
    expect(labels.length).toBeGreaterThan(1);
    expect(labels.every((label) => /^\d{16}$/u.test(label))).toBe(true);
  });
});
