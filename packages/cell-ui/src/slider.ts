import type { WidgetNode, WidgetTree } from "./types.js";

export type CellSliderRange = Readonly<{
  min: number;
  max: number;
  step: number;
}>;

const finiteOr = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) ? value! : fallback;

const precisionFor = (...values: number[]) => Math.min(
  12,
  Math.max(...values.map((value) => {
    const [coefficient = "", exponent = "0"] = String(value).toLowerCase().split("e");
    const fraction = coefficient.split(".")[1] ?? "";
    return Math.max(0, fraction.length - Number(exponent));
  }))
);

const roundFor = (range: CellSliderRange, value: number) => {
  const scale = 10 ** precisionFor(range.min, range.max, range.step);
  return Math.round(value * scale) / scale;
};

export const resolveCellSliderRange = (
  min?: number,
  max?: number,
  step?: number
): CellSliderRange => {
  const resolvedMin = finiteOr(min, 0);
  const resolvedStep = step !== undefined && Number.isFinite(step) && step > 0 ? step : 1;
  const proposedMax = finiteOr(max, 100);
  return {
    min: resolvedMin,
    max: proposedMax > resolvedMin ? proposedMax : resolvedMin + resolvedStep,
    step: resolvedStep,
  };
};

export const normalizeCellSliderValue = (
  value: number,
  range: CellSliderRange
): number => {
  const finiteValue = finiteOr(value, range.min);
  if (finiteValue <= range.min) return range.min;
  if (finiteValue >= range.max) return range.max;
  const lowerIndex = Math.floor((finiteValue - range.min) / range.step);
  const lower = roundFor(range, range.min + lowerIndex * range.step);
  const upper = Math.min(range.max, roundFor(range, lower + range.step));
  return finiteValue - lower < upper - finiteValue ? lower : upper;
};

export const stepCellSliderValue = (
  value: number,
  range: CellSliderRange,
  direction: -1 | 1,
  count = 1
): number => {
  let current = normalizeCellSliderValue(value, range);
  for (let index = 0; index < Math.max(1, Math.trunc(count)); index += 1) {
    if (direction > 0) {
      if (current >= range.max) return range.max;
      const nextIndex = Math.floor((current - range.min) / range.step + 1e-12) + 1;
      current = Math.min(range.max, roundFor(range, range.min + nextIndex * range.step));
    } else {
      if (current <= range.min) return range.min;
      const previousIndex = Math.ceil((current - range.min) / range.step - 1e-12) - 1;
      current = Math.max(range.min, roundFor(range, range.min + previousIndex * range.step));
    }
  }
  return current;
};

export const cellSliderValueAtCoordinate = (
  coordinate: number,
  trackStart: number,
  trackLength: number,
  range: CellSliderRange
): number => {
  if (trackLength <= 1) return range.min;
  const ratio = Math.max(
    0,
    Math.min(1, (coordinate - trackStart - 0.5) / (trackLength - 1))
  );
  return normalizeCellSliderValue(range.min + ratio * (range.max - range.min), range);
};

export const cellSliderThumbOffset = (
  value: number,
  trackLength: number,
  range: CellSliderRange
): number => {
  if (trackLength <= 1) return 0;
  const normalized = normalizeCellSliderValue(value, range);
  return Math.round((normalized - range.min) * (trackLength - 1) / (range.max - range.min));
};

export const normalizeCellRangeSliderValues = (
  first: number,
  second: number,
  range: CellSliderRange
): readonly [number, number] => {
  const left = normalizeCellSliderValue(first, range);
  const right = normalizeCellSliderValue(second, range);
  return left <= right ? [left, right] : [right, left];
};

export const constrainCellRangeSliderThumbValue = (
  value: number,
  thumbIndex: 0 | 1,
  values: readonly [number, number],
  range: CellSliderRange
): number => {
  const normalized = normalizeCellSliderValue(value, range);
  return thumbIndex === 0
    ? Math.min(normalized, values[1])
    : Math.max(normalized, values[0]);
};

export const cellRangeSliderThumbIndexAtCoordinate = (
  coordinate: number,
  trackStart: number,
  trackLength: number,
  values: readonly [number, number],
  range: CellSliderRange,
  focusedIndex: 0 | 1 | null = null
): 0 | 1 => {
  const first = trackStart + cellSliderThumbOffset(values[0], trackLength, range) + 0.5;
  const second = trackStart + cellSliderThumbOffset(values[1], trackLength, range) + 0.5;
  const firstDistance = Math.abs(coordinate - first);
  const secondDistance = Math.abs(coordinate - second);
  if (firstDistance === secondDistance) return focusedIndex ?? 0;
  return firstDistance < secondDistance ? 0 : 1;
};

export type CellRangeSliderThumbContext = Readonly<{
  parent: WidgetNode;
  thumbs: readonly [WidgetNode, WidgetNode];
  thumbIndex: 0 | 1;
  values: readonly [number, number];
  range: CellSliderRange;
}>;

export const resolveCellRangeSliderThumbContext = (
  tree: WidgetTree,
  thumbId: string
): CellRangeSliderThumbContext | null => {
  const thumb = tree.nodes.get(thumbId);
  const parent = thumb?.kind === "range-slider-thumb" && thumb.parentId
    ? tree.nodes.get(thumb.parentId)
    : undefined;
  if (parent?.kind !== "range-slider" || parent.children.length !== 2) return null;
  const first = tree.nodes.get(parent.children[0]!);
  const second = tree.nodes.get(parent.children[1]!);
  if (first?.kind !== "range-slider-thumb" || second?.kind !== "range-slider-thumb") return null;
  const thumbIndex = first.id === thumbId ? 0 : second.id === thumbId ? 1 : null;
  if (thumbIndex === null) return null;
  return {
    parent,
    thumbs: [first, second],
    thumbIndex,
    values: [first.sliderValue, second.sliderValue],
    range: resolveCellSliderRange(parent.sliderMin, parent.sliderMax, parent.sliderStep),
  };
};
