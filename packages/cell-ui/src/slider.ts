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
