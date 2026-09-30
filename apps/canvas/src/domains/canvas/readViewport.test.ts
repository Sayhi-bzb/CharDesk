import { describe, expect, it } from "vitest";
import { getTextCellWidth } from "@chardesk/protocol";
import { CellPlaneIndex, cellPlanePatchToOperation, createGridSurfaceReader } from "./cell-plane/model";
import { isCanvasReadViewport, readCanvasViewport } from "./readViewport";

const surface = (entries: Array<[number, number, string, string?]>) => createGridSurfaceReader(new Map(
  entries.map(([x, y, char, bgColor]) => [`${x},${y}`, { char, color: "#000", ...(bgColor ? { bgColor } : {}) }]),
));
const lines = (content: string) => content.split("\n").filter((line) => line.includes("│")).map((line) => line.split("│")[1]);

describe("Canvas viewport reading", () => {
  it("preserves coordinates, whitespace, CJK, and graphemes in exact text", () => {
    const view = readCanvasViewport(surface([[-2, -1, "A"], [-1, -1, "你"], [1, -1, "é"]]), [-3, -2, 7, 3]);
    expect(view).toMatchObject({ viewport: [-3, -2, 7, 3], step: 1, mode: "text" });
    expect(lines(view.content)).toEqual(["       ", " A你é  ", "       "]);
    expect(lines(view.content).every((line) => getTextCellWidth(line) === 7)).toBe(true);
    expect(view.content).toContain("-1 │");
  });

  it("leaves clipped wide characters blank without changing the viewport", () => {
    const reader = surface([[0, 0, "你"], [2, 0, "B"]]);
    expect(lines(readCanvasViewport(reader, [1, 0, 2, 1]).content)).toEqual([" B"]);
    expect(lines(readCanvasViewport(reader, [0, 0, 1, 1]).content)).toEqual([" "]);
  });

  it("samples quadrant positions without interpreting content", () => {
    const view = readCanvasViewport(surface([[0, 0, "a"], [3, 1, "b"]]), [0, 0, 160, 48]);
    expect(view).toMatchObject({ step: 2, mode: "projection" });
    expect(lines(view.content)[0].slice(0, 2)).toBe("▘▗");
    expect(lines(view.content)).toHaveLength(24);
  });

  it("keeps isolated content and background-only cells in density maps", () => {
    const entries: Array<[number, number, string, string?]> = [[0, 0, "x"], [10, 0, " ", "#f00"]];
    for (let y = 0; y < 10; y++) for (let x = 20; x < 30; x++) entries.push([x, y, "x"]);
    const view = readCanvasViewport(surface(entries), [0, 0, 800, 240]);
    expect(view).toMatchObject({ step: 10, mode: "density" });
    expect(lines(view.content)[0].slice(0, 4)).toBe("░░█·");
  });

  it("fits rectangular views without stretching or expanding partial edge buckets", () => {
    const view = readCanvasViewport(surface([[80, 24, "x"]]), [0, 0, 81, 25]);
    expect(view.step).toBe(2);
    expect(lines(view.content)).toHaveLength(13);
    expect(lines(view.content)[12]).toHaveLength(41);
    expect(lines(view.content)[12][40]).toBe("▘");
  });

  it("distinguishes empty documents from explicit blank views and excludes unstyled spaces", () => {
    const reader = surface([[0, 0, " "]]);
    expect(readCanvasViewport(reader)).toEqual({ viewport: null, step: 1, mode: "text", content: "" });
    expect(readCanvasViewport(reader, [-10, 2, 4, 1]).viewport).toEqual([-10, 2, 4, 1]);
    expect(lines(readCanvasViewport(reader, [-10, 2, 4, 1]).content)).toEqual(["    "]);
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
});
