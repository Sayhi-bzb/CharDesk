import { describe, expect, it } from "vitest";
import type { GridCell, GridMap } from "@/shared/types";
import {
  createGridMapSource,
  materializeGridSource,
} from "./grid-source";

describe("grid snapshot source", () => {
  it("copies an owned Map into the point-based read contract", () => {
    const grid: GridMap = new Map([
      ["2,3", { char: "你", color: "#fff" }],
    ]);
    const source = createGridMapSource(grid);

    grid.set("0,0", { char: "X", color: "#fff" });

    expect(source.get({ x: 2, y: 3 })?.char).toBe("你");
    expect(source.get({ x: 0, y: 0 })).toBeUndefined();
    expect(source.getContentBounds()).toEqual({ x: 2, y: 3, width: 2, height: 1 });
  });

  it("materializes only cells visited by the requested bounds", () => {
    const source = createGridMapSource(new Map<string, GridCell>([
      ["0,0", { char: "A", color: "#fff" }],
      ["4,2", { char: "B", color: "#fff" }],
    ]));

    expect(materializeGridSource(source, { x: 0, y: 0, width: 1, height: 1 }))
      .toEqual(new Map([["0,0", { char: "A", color: "#fff" }]]));
  });
});
