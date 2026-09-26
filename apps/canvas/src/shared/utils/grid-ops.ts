import { GridManager } from "@/shared/utils/grid";
import type { GridCell } from "@/shared/types";
import {
  getGridCellWidth,
  getIntersectingGridAnchors,
  resolveGridSlot,
  createPointGridReader,
} from "@/shared/utils/grid-occupancy";

type GridTarget = {
  set(key: string, value: GridCell): void;
  delete(key: string): void;
  get(key: string): GridCell | undefined;
};

type WriteResult = {
  wrote: boolean;
  removedLeftAnchor: boolean;
  removedRightFollower: boolean;
};

type RemoveResult = {
  removedAnchors: number;
  removedFollowers: number;
};

export const writeCell = (
  target: GridTarget,
  x: number,
  y: number,
  char: string,
  color: string
): WriteResult => {
  return writeStyledCell(target, x, y, { char, color });
};

export const writeStyledCell = (
  target: GridTarget,
  x: number,
  y: number,
  cell: GridCell
): WriteResult => {
  const { char } = cell;
  if (!char) {
    return {
      wrote: false,
      removedLeftAnchor: false,
      removedRightFollower: false,
    };
  }

  const width = getGridCellWidth(cell);
  const intersecting = getIntersectingGridAnchors(
    createPointGridReader(target),
    { x, y },
    width
  );
  const removedLeftAnchor = intersecting.some((anchor) => anchor.x < x);
  const removedRightFollower = width === 2;
  intersecting.forEach((anchor) =>
    target.delete(GridManager.toKey(anchor.x, anchor.y))
  );
  target.set(GridManager.toKey(x, y), cell);

  return {
    wrote: true,
    removedLeftAnchor,
    removedRightFollower,
  };
};

export const deleteCellAt = (
  target: GridTarget,
  x: number,
  y: number
): RemoveResult => {
  const reader = createPointGridReader(target);
  const anchors = getIntersectingGridAnchors(reader, { x, y }, 1);
  if (anchors.length === 0) return { removedAnchors: 0, removedFollowers: 0 };
  const selectedSlot = resolveGridSlot(reader, { x, y });
  anchors.forEach((anchor) => target.delete(GridManager.toKey(anchor.x, anchor.y)));
  return {
    removedAnchors: anchors.length,
    removedFollowers: selectedSlot?.offset === 1 ? 1 : 0,
  };
};

export const deleteRect = (
  target: GridTarget,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): RemoveResult => {
  let removedAnchors = 0;
  let removedFollowers = 0;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const result = deleteCellAt(target, x, y);
      removedAnchors += result.removedAnchors;
      removedFollowers += result.removedFollowers;
    }
  }

  return { removedAnchors, removedFollowers };
};
