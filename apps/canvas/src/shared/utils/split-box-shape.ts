import { BOX_CHARS } from "@/shared/lib/constants";
import type { GridPoint, NodeBounds, Point } from "@/shared/types";
import { getBoxPoints } from "./shapes";

const connectionGlyph = (
  up: boolean,
  right: boolean,
  down: boolean,
  left: boolean,
  outerCorner: string | null
) => {
  if (outerCorner) return outerCorner;
  if (up && right && down && left) return "┼";
  if (up && right && down) return "├";
  if (up && down && left) return "┤";
  if (right && down && left) return "┬";
  if (up && right && left) return "┴";
  if (up && down) return BOX_CHARS.VERTICAL;
  if (left && right) return BOX_CHARS.HORIZONTAL;
  if (right && down) return "┌";
  if (down && left) return "┐";
  if (up && right) return "└";
  if (up && left) return "┘";
  return up || down ? BOX_CHARS.VERTICAL : BOX_CHARS.HORIZONTAL;
};

const renderRectGraph = (rects: NodeBounds[]): GridPoint[] => {
  const connections = new Map<string, {
    up: boolean;
    right: boolean;
    down: boolean;
    left: boolean;
  }>();
  const ensure = (x: number, y: number) => {
    const key = `${x},${y}`;
    const current = connections.get(key);
    if (current) return current;
    const next = { up: false, right: false, down: false, left: false };
    connections.set(key, next);
    return next;
  };
  const connect = (x1: number, y1: number, x2: number, y2: number) => {
    const first = ensure(x1, y1);
    const second = ensure(x2, y2);
    if (x2 > x1) { first.right = true; second.left = true; }
    else if (x2 < x1) { first.left = true; second.right = true; }
    else if (y2 > y1) { first.down = true; second.up = true; }
    else { first.up = true; second.down = true; }
  };
  rects.forEach((rect) => {
    const right = rect.x + rect.width - 1;
    const bottom = rect.y + rect.height - 1;
    for (let x = rect.x; x < right; x += 1) {
      connect(x, rect.y, x + 1, rect.y);
      connect(x, bottom, x + 1, bottom);
    }
    for (let y = rect.y; y < bottom; y += 1) {
      connect(rect.x, y, rect.x, y + 1);
      connect(right, y, right, y + 1);
    }
  });
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width - 1));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height - 1));
  return Array.from(connections, ([key, value]) => {
    const [x, y] = key.split(",").map(Number);
    const outerCorner = x === left && y === top
      ? BOX_CHARS.TOP_LEFT
      : x === right && y === top
        ? BOX_CHARS.TOP_RIGHT
        : x === left && y === bottom
          ? BOX_CHARS.BOTTOM_LEFT
          : x === right && y === bottom
            ? BOX_CHARS.BOTTOM_RIGHT
            : null;
    return { x, y, char: connectionGlyph(value.up, value.right, value.down, value.left, outerCorner) };
  });
};

export const getDefaultSplitBoxPoints = (start: Point, end: Point): GridPoint[] => {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  const width = right - left + 1;
  const height = bottom - top + 1;
  if (width < 3 || height < 3) return getBoxPoints(start, end);

  const firstSplit = Math.min(bottom - 1, Math.max(top + 1, top + Math.round((height - 1) * 0.25)));
  const secondSplit = Math.min(bottom - 1, Math.max(firstSplit + 1, top + Math.round((height - 1) * 0.75)));
  const verticalSplit = Math.min(right - 1, Math.max(left + 1, left + Math.round((width - 1) * 0.36)));
  return renderRectGraph([
    { x: left, y: top, width, height: firstSplit - top + 1 },
    { x: left, y: firstSplit, width: verticalSplit - left + 1, height: secondSplit - firstSplit + 1 },
    { x: verticalSplit, y: firstSplit, width: right - verticalSplit + 1, height: secondSplit - firstSplit + 1 },
    { x: left, y: secondSplit, width, height: bottom - secondSplit + 1 },
  ]);
};
