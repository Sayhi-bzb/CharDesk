import type { CellBuffer } from "./buffer.js";
import type { CellPoint, CellRect } from "./types.js";
import { resolveCellRangeBounds } from "@chardesk/cell-core";

type CellRangeBase = Readonly<{
  anchor: CellPoint;
  head: CellPoint;
  bounds: CellRect;
  text: string;
}>;

export type CellRangeSnapshot = CellRangeBase & (
  | Readonly<{ shape?: "rectangle"; spans?: never }>
  | Readonly<{ shape: "linear"; spans: readonly CellRect[] }>
);

export type CellRangeCommand =
  | Readonly<{ type: "set"; snapshot: CellRangeSnapshot }>
  | Readonly<{ type: "clear" }>;

const clamp = (value: number, maximum: number) =>
  Math.max(0, Math.min(maximum, Math.trunc(value)));

const getFootprint = (buffer: CellBuffer, point: CellPoint): CellRect | null => {
  const cell = buffer.get(point.x, point.y);
  if (!cell) return null;
  if (cell.continuation) {
    const owner = buffer.get(point.x - 1, point.y);
    return owner?.width === 2
      ? { x: point.x - 1, y: point.y, width: 2, height: 1 }
      : null;
  }
  return { x: point.x, y: point.y, width: cell.width, height: 1 };
};

export const normalizeCellRange = (
  buffer: CellBuffer,
  anchor: CellPoint,
  head: CellPoint
): CellRect => {
  if (buffer.width === 0 || buffer.height === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return resolveCellRangeBounds({
    anchor: {
      x: clamp(anchor.x, buffer.width - 1),
      y: clamp(anchor.y, buffer.height - 1),
    },
    focus: {
      x: clamp(head.x, buffer.width - 1),
      y: clamp(head.y, buffer.height - 1),
    },
  }, {
    clip: { x: 0, y: 0, width: buffer.width, height: buffer.height },
    getFootprint: (point) => getFootprint(buffer, point),
  })!;
};

export const extractCellRange = (
  buffer: CellBuffer,
  bounds: CellRect,
  options: Readonly<{ trimEnd?: boolean; sourceAware?: boolean }> = {}
): string => {
  if (!options.sourceAware) return buffer.toText({ region: bounds, trimEnd: options.trimEnd });
  const lines: string[] = [];
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    let line = "";
    let trailingLayoutSpaces = 0;
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      const cell = buffer.get(x, y);
      if (!cell) continue;
      if (cell.continuation) {
        if (x === bounds.x && cell.copyText === undefined) {
          line += " ";
          trailingLayoutSpaces++;
        }
        continue;
      }
      const copied = cell.width === 2 && x + 1 >= bounds.x + bounds.width
        ? cell.copyText ?? " " : cell.copyText ?? cell.text;
      line += copied;
      if (copied && cell.copyText === undefined && /^ +$/u.test(copied)) trailingLayoutSpaces += copied.length;
      else if (copied) trailingLayoutSpaces = 0;
    }
    lines.push(options.trimEnd ? line.slice(0, line.length - trailingLayoutSpaces) : line);
  }
  return lines.join("\n");
};

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
    text: extractCellRange(buffer, bounds, { trimEnd: true, sourceAware: true }),
  };
};

export const createCellLinearRangeSnapshot = (
  buffer: CellBuffer,
  anchor: CellPoint,
  head: CellPoint,
): CellRangeSnapshot | null => {
  if (buffer.width === 0 || buffer.height === 0) return null;
  const clampPoint = (point: CellPoint): CellPoint => ({
    x: clamp(point.x, buffer.width - 1), y: clamp(point.y, buffer.height - 1),
  });
  const selectedAnchor = clampPoint(anchor);
  const selectedHead = clampPoint(head);
  const forward = selectedAnchor.y < selectedHead.y
    || (selectedAnchor.y === selectedHead.y && selectedAnchor.x <= selectedHead.x);
  const start = forward ? selectedAnchor : selectedHead;
  const end = forward ? selectedHead : selectedAnchor;
  const spans: CellRect[] = [];
  let left = buffer.width;
  let right = 0;
  for (let y = start.y; y <= end.y; y += 1) {
    const first = y === start.y ? start.x : 0;
    const last = y === end.y ? end.x : buffer.width - 1;
    const firstCell = getFootprint(buffer, { x: first, y });
    const lastCell = getFootprint(buffer, { x: last, y });
    const x = firstCell?.x ?? first;
    const spanRight = lastCell ? lastCell.x + lastCell.width : last + 1;
    spans.push({ x, y, width: spanRight - x, height: 1 });
    left = Math.min(left, x);
    right = Math.max(right, spanRight);
  }
  return {
    shape: "linear",
    anchor: selectedAnchor,
    head: selectedHead,
    spans,
    bounds: { x: left, y: start.y, width: right - left, height: end.y - start.y + 1 },
    text: spans.map((span) => extractCellRange(buffer, span, { trimEnd: true, sourceAware: true })).join("\n"),
  };
};

export const equalCellRangeSnapshot = (
  left: CellRangeSnapshot | null,
  right: CellRangeSnapshot | null
): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;
  if ((left.shape ?? "rectangle") !== (right.shape ?? "rectangle")) return false;
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
