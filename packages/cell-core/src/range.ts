import {
  intersectCellRects,
  normalizeCellRect,
  type CellPoint,
  type CellRect,
} from "./geometry.js";

export type CellRange = Readonly<{
  anchor: CellPoint;
  focus: CellPoint;
}>;

export type CellRowSpan = Readonly<{
  y: number;
  x: number;
  width: number;
}>;

export type CellRangeTopology = Readonly<{
  clip?: CellRect;
  getFootprint?: (point: CellPoint) => CellRect | null;
}>;

const assertPoint = (point: CellPoint) => {
  if (![point.x, point.y].every((value) => Number.isFinite(value) && Number.isInteger(value))) {
    throw new RangeError("Cell range points must contain finite integers.");
  }
};

export const normalizeCellRangeEndpoints = (range: CellRange): CellRange => {
  assertPoint(range.anchor);
  assertPoint(range.focus);
  return {
    anchor: {
      x: Math.min(range.anchor.x, range.focus.x),
      y: Math.min(range.anchor.y, range.focus.y),
    },
    focus: {
      x: Math.max(range.anchor.x, range.focus.x),
      y: Math.max(range.anchor.y, range.focus.y),
    },
  };
};

const clampPoint = (point: CellPoint, clip: CellRect): CellPoint => ({
  x: Math.max(clip.x, Math.min(clip.x + clip.width - 1, point.x)),
  y: Math.max(clip.y, Math.min(clip.y + clip.height - 1, point.y)),
});

const clippedRange = (range: CellRange, clip?: CellRect): CellRange | null => {
  const normalized = normalizeCellRangeEndpoints(range);
  if (!clip) return normalized;
  const bounds = normalizeCellRect(clip);
  if (bounds.width === 0 || bounds.height === 0) return null;
  return normalizeCellRangeEndpoints({
    anchor: clampPoint(normalized.anchor, bounds),
    focus: clampPoint(normalized.focus, bounds),
  });
};

const footprintAt = (
  point: CellPoint,
  topology: CellRangeTopology
): CellRect => {
  const fallback = { x: point.x, y: point.y, width: 1, height: 1 };
  const footprint = topology.getFootprint?.(point);
  if (!footprint) return fallback;
  const normalized = normalizeCellRect(footprint);
  const clipped = topology.clip
    ? intersectCellRects(normalized, topology.clip)
    : normalized;
  return clipped ?? fallback;
};

const expandRow = (
  y: number,
  initialLeft: number,
  initialRight: number,
  topology: CellRangeTopology
): CellRowSpan => {
  let left = initialLeft;
  let right = initialRight;
  let stable = false;
  while (!stable) {
    stable = true;
    const leftFootprint = footprintAt({ x: left, y }, topology);
    const rightFootprint = footprintAt({ x: right, y }, topology);
    const nextLeft = Math.min(left, leftFootprint.x, rightFootprint.x);
    const nextRight = Math.max(
      right,
      leftFootprint.x + leftFootprint.width - 1,
      rightFootprint.x + rightFootprint.width - 1
    );
    if (nextLeft !== left || nextRight !== right) {
      left = nextLeft;
      right = nextRight;
      stable = false;
    }
  }
  return { y, x: left, width: right - left + 1 };
};

const mergeRowSpans = (spans: readonly CellRowSpan[]): CellRowSpan[] => {
  const result: CellRowSpan[] = [];
  const sorted = [...spans].sort((left, right) =>
    left.y - right.y || left.x - right.x || left.width - right.width
  );
  for (const span of sorted) {
    const previous = result[result.length - 1];
    const end = span.x + span.width;
    if (previous && previous.y === span.y && span.x <= previous.x + previous.width) {
      result[result.length - 1] = {
        y: previous.y,
        x: previous.x,
        width: Math.max(previous.x + previous.width, end) - previous.x,
      };
    } else {
      result.push(span);
    }
  }
  return result;
};

export const resolveCellRangeSpans = (
  ranges: readonly CellRange[],
  topology: CellRangeTopology = {}
): readonly CellRowSpan[] => mergeRowSpans(ranges.flatMap((input) => {
  const range = clippedRange(input, topology.clip);
  if (!range) return [];
  const spans: CellRowSpan[] = [];
  for (let y = range.anchor.y; y <= range.focus.y; y += 1) {
    spans.push(expandRow(y, range.anchor.x, range.focus.x, topology));
  }
  return spans;
}));

export const getCellRangeBounds = (
  spans: readonly CellRowSpan[]
): CellRect | null => {
  if (spans.length === 0) return null;
  const left = Math.min(...spans.map((span) => span.x));
  const top = Math.min(...spans.map((span) => span.y));
  const right = Math.max(...spans.map((span) => span.x + span.width));
  const bottom = Math.max(...spans.map((span) => span.y + 1));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

export const resolveCellRangeBounds = (
  input: CellRange,
  topology: CellRangeTopology = {}
): CellRect | null => {
  const range = clippedRange(input, topology.clip);
  if (!range) return null;
  let left = range.anchor.x;
  let right = range.focus.x;
  let stable = false;
  while (!stable) {
    stable = true;
    for (let y = range.anchor.y; y <= range.focus.y; y += 1) {
      const span = expandRow(y, left, right, topology);
      const nextRight = span.x + span.width - 1;
      if (span.x !== left || nextRight !== right) {
        left = Math.min(left, span.x);
        right = Math.max(right, nextRight);
        stable = false;
      }
    }
  }
  return {
    x: left,
    y: range.anchor.y,
    width: right - left + 1,
    height: range.focus.y - range.anchor.y + 1,
  };
};
