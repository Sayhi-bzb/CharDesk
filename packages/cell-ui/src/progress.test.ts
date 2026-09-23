import { describe, expect, it } from "vitest";
import { indeterminateProgressRanges, resolveProgressVariant } from "./progress.js";

describe("progress variant", () => {
  it("defaults invalid values to solid", () => {
    expect(resolveProgressVariant(undefined)).toBe("solid");
    expect(resolveProgressVariant("solid")).toBe("solid");
    expect(resolveProgressVariant("surface")).toBe("solid");
    expect(resolveProgressVariant("outline")).toBe("outline");
    expect(resolveProgressVariant("ghost")).toBe("solid");
    expect(resolveProgressVariant("line")).toBe("solid");
  });
});

describe("indeterminate progress", () => {
  it("moves a quarter-track block forward and wraps its head across the boundary", () => {
    expect(indeterminateProgressRanges(10, 0)).toEqual([{ start: 0, length: 3 }]);
    expect(indeterminateProgressRanges(10, 120)).toEqual([{ start: 1, length: 3 }]);
    expect(indeterminateProgressRanges(10, 840)).toEqual([{ start: 7, length: 3 }]);
    expect(indeterminateProgressRanges(10, 960)).toEqual([
      { start: 8, length: 2 },
      { start: 0, length: 1 },
    ]);
    expect(indeterminateProgressRanges(10, 1_080)).toEqual([
      { start: 9, length: 1 },
      { start: 0, length: 2 },
    ]);
    expect(indeterminateProgressRanges(10, 1_200)).toEqual([{ start: 0, length: 3 }]);
  });

  it("stays valid for empty and single-Cell tracks", () => {
    expect(indeterminateProgressRanges(0, 120)).toEqual([]);
    expect(indeterminateProgressRanges(1, 120)).toEqual([{ start: 0, length: 1 }]);
  });
});
