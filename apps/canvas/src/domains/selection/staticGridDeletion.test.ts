import { describe, expect, it } from "vitest";
import { createGridMapSource } from "@/shared/utils/grid-source";
import {
  resolveStaticGridDeletePlan,
  type StaticGridInteraction,
} from "./public";

const grid = createGridMapSource(new Map([
  ["1,0", { char: "森", color: "#fff" }],
]));
const navigate = (x: number, y = 0): StaticGridInteraction => ({
  kind: "navigate",
  activeCell: { x, y },
});

describe("static grid deletion", () => {
  it("deletes the active Cell forward without moving", () => {
    expect(resolveStaticGridDeletePlan({
      interaction: navigate(1),
      direction: "forward",
      grid,
    })).toEqual({
      kind: "cell",
      target: { x: 1, y: 0 },
      nextActiveCell: { x: 1, y: 0 },
    });
  });

  it("deletes the logical Cell to the left and moves to its anchor", () => {
    expect(resolveStaticGridDeletePlan({
      interaction: navigate(3),
      direction: "backward",
      grid,
    })).toEqual({
      kind: "cell",
      target: { x: 1, y: 0 },
      nextActiveCell: { x: 1, y: 0 },
    });
  });

  it("preserves continuous input history across an automatic wrap", () => {
    expect(resolveStaticGridDeletePlan({
      interaction: {
        kind: "text-edit",
        activeCell: { x: 1, y: 1 },
        cursor: { x: 1, y: 1 },
      },
      direction: "backward",
      grid: createGridMapSource(new Map()),
      previousInputCell: { x: 2, y: 0 },
    })).toMatchObject({
      kind: "cell",
      target: { x: 2, y: 0 },
      nextActiveCell: { x: 2, y: 0 },
    });
  });

  it("stops backward deletion at a finite left boundary", () => {
    expect(resolveStaticGridDeletePlan({
      interaction: navigate(0, 1),
      direction: "backward",
      grid,
      bounds: {
        start: { x: 0, y: 0 },
        end: { x: 4, y: 2 },
      },
    })).toEqual({ kind: "noop", reason: "boundary" });
  });

  it("gives an explicit Range priority over direction", () => {
    expect(resolveStaticGridDeletePlan({
      interaction: {
        kind: "range",
        activeCell: { x: 2, y: 0 },
        geometry: {
          polygons: [],
          bounds: null,
        },
      },
      direction: "backward",
      grid,
    })).toEqual({ kind: "range" });
  });
});
