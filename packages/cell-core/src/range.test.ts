import { describe, expect, it } from "vitest";
import {
  getCellRangeBounds,
  normalizeCellRangeEndpoints,
  resolveCellRangeBounds,
  resolveCellRangeSpans,
  type CellPoint,
  type CellRect,
} from "./index.js";

const wide = new Map<string, CellRect>([
  ["1,0", { x: 1, y: 0, width: 2, height: 1 }],
  ["2,0", { x: 1, y: 0, width: 2, height: 1 }],
  ["3,1", { x: 3, y: 1, width: 2, height: 1 }],
  ["4,1", { x: 3, y: 1, width: 2, height: 1 }],
]);
const getFootprint = ({ x, y }: CellPoint) => wide.get(`${x},${y}`) ?? null;

describe("Cell ranges", () => {
  it("normalizes inclusive endpoints", () => {
    expect(normalizeCellRangeEndpoints({
      anchor: { x: 4, y: 3 },
      focus: { x: -2, y: 1 },
    })).toEqual({ anchor: { x: -2, y: 1 }, focus: { x: 4, y: 3 } });
  });

  it("clamps a rectangular range and expands complete footprints", () => {
    expect(resolveCellRangeBounds({
      anchor: { x: 20, y: 3 },
      focus: { x: 2, y: 0 },
    }, {
      clip: { x: 0, y: 0, width: 5, height: 2 },
      getFootprint,
    })).toEqual({ x: 1, y: 0, width: 4, height: 2 });
  });

  it("keeps per-row spans precise and merges adjacent ranges", () => {
    const spans = resolveCellRangeSpans([
      { anchor: { x: 2, y: 0 }, focus: { x: 2, y: 0 } },
      { anchor: { x: 3, y: 1 }, focus: { x: 4, y: 1 } },
      { anchor: { x: 5, y: 1 }, focus: { x: 5, y: 1 } },
    ], { getFootprint });
    expect(spans).toEqual([
      { x: 1, y: 0, width: 2 },
      { x: 3, y: 1, width: 3 },
    ]);
    expect(getCellRangeBounds(spans)).toEqual({ x: 1, y: 0, width: 5, height: 2 });
  });

  it("returns empty results for an empty clip", () => {
    const range = { anchor: { x: 0, y: 0 }, focus: { x: 1, y: 1 } };
    expect(resolveCellRangeBounds(range, { clip: { x: 0, y: 0, width: 0, height: 0 } })).toBeNull();
    expect(resolveCellRangeSpans([range], { clip: { x: 0, y: 0, width: 0, height: 0 } })).toEqual([]);
  });
});
