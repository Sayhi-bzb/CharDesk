import type { GridCellSource, Point } from "@/shared/types";
import { GridManager } from "@/shared/utils/grid";
import { getGridFootprint } from "@/shared/utils/grid-occupancy";

export interface CanvasLinkHit {
  y: number;
  startX: number;
  endX: number;
  href: string;
}

const getLinkedCellWidth = (source: GridCellSource, x: number, y: number, href: string) => {
  const footprint = getGridFootprint(source, { x, y });
  return footprint?.anchor.x === x && footprint.cell.href === href
    ? footprint.width
    : 0;
};

const resolveLinkedRun = (source: GridCellSource, point: Point, href: string) => {
  let startX = point.x;
  while (startX > Number.MIN_SAFE_INTEGER) {
    const leftX = startX - 1;
    const leftAnchor = GridManager.snapToCharStart({ x: leftX, y: point.y }, source);
    if (leftAnchor.x >= startX) break;
    const width = getLinkedCellWidth(source, leftAnchor.x, point.y, href);
    if (width === 0 || leftAnchor.x + width !== startX) break;
    startX = leftAnchor.x;
  }

  let endX = getGridFootprint(source, point)?.end.x ?? point.x;
  while (endX < Number.MAX_SAFE_INTEGER) {
    const nextX = endX + 1;
    const width = getLinkedCellWidth(source, nextX, point.y, href);
    if (width === 0) break;
    endX = nextX + width - 1;
  }

  return { y: point.y, startX, endX, href };
};

export const resolveCanvasLinkHit = (input: {
  clientX: number;
  clientY: number;
  rect: Pick<DOMRect, "left" | "top">;
  offset: Point;
  zoom: number;
  source: GridCellSource;
}): CanvasLinkHit | null => {
  const raw = GridManager.screenToGrid(
    input.clientX - input.rect.left,
    input.clientY - input.rect.top,
    input.offset.x,
    input.offset.y,
    input.zoom
  );
  const point = GridManager.snapToCharStart(raw, input.source);
  const footprint = getGridFootprint(input.source, point);
  return footprint?.cell.href
    ? resolveLinkedRun(input.source, footprint.anchor, footprint.cell.href)
    : null;
};
