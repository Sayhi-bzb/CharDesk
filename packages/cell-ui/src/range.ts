import type { CellBuffer } from "./buffer.js";
import type { CellPoint, CellRect } from "./types.js";

export type CellRangeSnapshot = Readonly<{
  anchor: CellPoint;
  head: CellPoint;
  bounds: CellRect;
  text: string;
}>;

export type CellRangeCommand =
  | Readonly<{ type: "set"; snapshot: CellRangeSnapshot }>
  | Readonly<{ type: "clear" }>;

const clamp = (value: number, maximum: number) =>
  Math.max(0, Math.min(maximum, Math.trunc(value)));

export const normalizeCellRange = (
  buffer: CellBuffer,
  anchor: CellPoint,
  head: CellPoint
): CellRect => {
  if (buffer.width === 0 || buffer.height === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let left = Math.min(
    clamp(anchor.x, buffer.width - 1),
    clamp(head.x, buffer.width - 1)
  );
  let right = Math.max(
    clamp(anchor.x, buffer.width - 1),
    clamp(head.x, buffer.width - 1)
  );
  const top = Math.min(
    clamp(anchor.y, buffer.height - 1),
    clamp(head.y, buffer.height - 1)
  );
  const bottom = Math.max(
    clamp(anchor.y, buffer.height - 1),
    clamp(head.y, buffer.height - 1)
  );

  // A boundary expansion on a later row can expose another half-grapheme on
  // an earlier row. Iterate to the smallest rectangle whose vertical edges
  // contain complete wide graphemes on every selected row.
  let stable = false;
  while (!stable) {
    stable = true;
    for (let y = top; y <= bottom; y += 1) {
      if (buffer.get(left, y)?.continuation && left > 0) {
        left -= 1;
        stable = false;
      }
      if (buffer.get(right, y)?.width === 2 && right < buffer.width - 1) {
        right += 1;
        stable = false;
      }
    }
  }

  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
};

export const extractCellRange = (
  buffer: CellBuffer,
  bounds: CellRect,
  options: Readonly<{ trimEnd?: boolean }> = {}
): string => buffer.toText({ region: bounds, trimEnd: options.trimEnd });

export const createCellRangeSnapshot = (
  buffer: CellBuffer,
  anchor: CellPoint,
  head: CellPoint
): CellRangeSnapshot | null => {
  if (buffer.width === 0 || buffer.height === 0) return null;
  const bounds = normalizeCellRange(buffer, anchor, head);
  return {
    anchor: {
      x: clamp(anchor.x, buffer.width - 1),
      y: clamp(anchor.y, buffer.height - 1),
    },
    head: {
      x: clamp(head.x, buffer.width - 1),
      y: clamp(head.y, buffer.height - 1),
    },
    bounds,
    text: extractCellRange(buffer, bounds, { trimEnd: true }),
  };
};

export const equalCellRangeSnapshot = (
  left: CellRangeSnapshot | null,
  right: CellRangeSnapshot | null
): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.anchor.x === right.anchor.x
    && left.anchor.y === right.anchor.y
    && left.head.x === right.head.x
    && left.head.y === right.head.y
    && left.bounds.x === right.bounds.x
    && left.bounds.y === right.bounds.y
    && left.bounds.width === right.bounds.width
    && left.bounds.height === right.bounds.height
    && left.text === right.text;
};
