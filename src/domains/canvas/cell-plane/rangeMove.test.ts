import { describe, expect, it } from "vitest";
import {
  createStaticGridRangeMovePlan,
  isPointInStaticGridRange,
} from "./rangeMove";
import type { GridCell } from "@/shared/types";
import { GridSnapshotSource } from "@/shared/utils/grid-source";

const cell = (char: string, color = "#fff") => ({ char, color });
const source = (entries: Array<readonly [string, GridCell]>) =>
  new GridSnapshotSource(entries);

describe("static grid range move planning", () => {
  it("moves styled and wide cells while blank source cells erase the target", () => {
    const plan = createStaticGridRangeMovePlan({
      source: source([
        ["0,0", { char: "你", color: "#fff", bgColor: "#123", href: "https://example.com" }],
        ["2,0", cell("A")],
        ["4,0", cell("X")],
      ]),
      range: { start: { x: 0, y: 0 }, end: { x: 2, y: 0 } },
      requestedDelta: { x: 2, y: 0 },
    });

    expect(plan?.delta).toEqual({ x: 2, y: 0 });
    expect(plan?.previewSource.get({ x: 2, y: 0 })).toMatchObject({
      char: "你",
      bgColor: "#123",
      href: "https://example.com",
    });
    expect(plan?.previewSource.get({ x: 4, y: 0 })?.char).toBe("A");
    expect(plan?.hiddenSpans).toEqual([{ y: 0, minX: 0, maxX: 4 }]);
    expect(plan?.patch.rows).toEqual([
      {
        y: 0,
        erase: [
          { from: 0, to: 2 },
          { from: 2, to: 4 },
        ],
        spans: [
          expect.objectContaining({ x: 2, text: "你" }),
          expect.objectContaining({ x: 4, text: "A" }),
        ],
      },
    ]);
  });

  it("clamps the whole effective range to slide bounds", () => {
    const plan = createStaticGridRangeMovePlan({
      source: source([["1,0", cell("你")]]),
      range: { start: { x: 1, y: 0 }, end: { x: 1, y: 0 } },
      requestedDelta: { x: 10, y: 10 },
      bounds: { start: { x: 0, y: 0 }, end: { x: 3, y: 2 } },
    });

    expect(plan?.delta).toEqual({ x: 1, y: 2 });
    expect(plan?.targetRange).toEqual({
      start: { x: 2, y: 2 },
      end: { x: 2, y: 2 },
    });
  });

  it("returns no plan for a zero effective delta", () => {
    expect(
      createStaticGridRangeMovePlan({
        source: source([["0,0", cell("A")]]),
        range: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
        requestedDelta: { x: -1, y: 0 },
        bounds: { start: { x: 0, y: 0 }, end: { x: 3, y: 2 } },
      })
    ).toBeNull();
  });

  it("includes the follower half of a wide boundary cell in hit testing", () => {
    const grid = source([["1,1", cell("你")]]);
    const range = { start: { x: 1, y: 1 }, end: { x: 1, y: 1 } };
    expect(isPointInStaticGridRange(grid, range, { x: 2, y: 1 })).toBe(true);
    expect(isPointInStaticGridRange(grid, range, { x: 3, y: 1 })).toBe(false);
  });

  it("hides a whole destination glyph when the drop overlaps its follower", () => {
    const plan = createStaticGridRangeMovePlan({
      source: source([
        ["0,0", cell("A")],
        ["2,0", cell("你")],
      ]),
      range: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
      requestedDelta: { x: 3, y: 0 },
    });

    expect(plan?.hiddenSpans).toEqual([
      { y: 0, minX: 0, maxX: 0 },
      { y: 0, minX: 2, maxX: 3 },
    ]);
  });
});
