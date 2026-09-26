import { describe, expect, it } from "vitest";
import type { GridCell, GridMap } from "@/shared/types";
import {
  deleteCellAt,
  writeStyledCell,
} from "./grid-ops";

const cell = (char: string): GridCell => ({ char, color: "#fff" });

describe("atomic grid operations", () => {
  it("replaces the whole wide cell when writing into its follower", () => {
    const grid: GridMap = new Map([["0,0", cell("你")]]);
    writeStyledCell(grid, 1, 0, cell("A"));
    expect(grid).toEqual(new Map([["1,0", cell("A")]]));
  });

  it("clears every anchor intersecting a new wide footprint", () => {
    const grid: GridMap = new Map([
      ["0,0", cell("A")],
      ["1,0", cell("B")],
    ]);
    writeStyledCell(grid, 0, 0, cell("你"));
    expect(grid).toEqual(new Map([["0,0", cell("你")]]));
  });

  it("deletes a wide cell from either visual column", () => {
    const grid: GridMap = new Map([["2,0", cell("你")]]);
    expect(deleteCellAt(grid, 3, 0)).toEqual({
      removedAnchors: 1,
      removedFollowers: 1,
    });
    expect(grid.size).toBe(0);
  });
});
