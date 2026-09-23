export const INDETERMINATE_PROGRESS_STEP_MS = 120;

export type ProgressVariant = "solid" | "outline";

export const resolveProgressVariant = (value: unknown): ProgressVariant =>
  value === "outline" ? "outline" : "solid";

export const progressNumberLayout = (
  value: number,
  max: number,
  width: number,
  variant: ProgressVariant,
): Readonly<{ trackWidth: number; label: string }> | null => {
  const minimumTrackWidth = variant === "outline" ? 3 : 1;
  const labelWidth = 4;
  const gap = 1;
  if (width < minimumTrackWidth + gap + labelWidth) return null;
  return {
    trackWidth: width - gap - labelWidth,
    label: `${Math.round(value / max * 100)}%`.padEnd(labelWidth, " "),
  };
};

export type ProgressRange = Readonly<{ start: number; length: number }>;

export const indeterminateProgressRanges = (
  length: number,
  animationTimeMs: number,
): readonly ProgressRange[] => {
  const trackLength = Math.max(0, Math.floor(length));
  if (trackLength === 0) return [];
  const blockLength = Math.max(1, Math.ceil(trackLength / 4));
  const step = Math.floor(Math.max(0, animationTimeMs) / INDETERMINATE_PROGRESS_STEP_MS);
  const start = step % trackLength;
  const leadingLength = Math.min(blockLength, trackLength - start);
  const wrappedLength = blockLength - leadingLength;
  return wrappedLength === 0
    ? [{ start, length: leadingLength }]
    : [{ start, length: leadingLength }, { start: 0, length: wrappedLength }];
};
