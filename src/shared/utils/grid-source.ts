import type { GridCell, GridCellSource, GridMap, NodeBounds } from "@/shared/types";
import { getCellOccupancy } from "@/shared/metrics";

const keyOf = (x: number, y: number) => `${x},${y}`;

/** Point-based reader over an owned, immutable-by-convention grid snapshot. */
export class GridSnapshotSource implements GridCellSource {
  readonly #grid: ReadonlyMap<string, GridCell>;

  constructor(
    entries: Iterable<readonly [string, GridCell]> | ReadonlyMap<string, GridCell> = []
  ) {
    this.#grid = new Map(entries);
  }

  get({ x, y }: Readonly<{ x: number; y: number }>) {
    return this.#grid.get(keyOf(x, y));
  }

  visit(
    bounds: NodeBounds,
    visitor: (x: number, y: number, cell: GridCell) => void
  ) {
    this.#grid.forEach((cell, key) => {
      const [x, y] = key.split(",").map(Number);
      if (
        x >= bounds.x &&
        x < bounds.x + bounds.width &&
        y >= bounds.y &&
        y < bounds.y + bounds.height
      ) visitor(x, y, cell);
    });
  }

  getContentBounds() {
    let result: NodeBounds | null = null;
    this.#grid.forEach((cell, key) => {
      const [x, y] = key.split(",").map(Number);
      const right = x + getCellOccupancy(cell.char);
      if (!result) {
        result = { x, y, width: right - x, height: 1 };
        return;
      }
      const left = Math.min(result.x, x);
      const top = Math.min(result.y, y);
      const maxX = Math.max(result.x + result.width, right);
      const maxY = Math.max(result.y + result.height, y + 1);
      result = { x: left, y: top, width: maxX - left, height: maxY - top };
    });
    return result;
  }
}

/** Adapts an owned grid snapshot to the shared point-based read contract. */
export const createGridMapSource = (grid: ReadonlyMap<string, GridCell>): GridCellSource =>
  new GridSnapshotSource(grid);

export const materializeGridSource = (
  source: GridCellSource,
  bounds = source.getContentBounds()
): GridMap => {
  const grid: GridMap = new Map();
  if (!bounds) return grid;
  source.visit(bounds, (x, y, cell) => grid.set(keyOf(x, y), cell));
  return grid;
};
