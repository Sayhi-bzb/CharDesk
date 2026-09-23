export const SPINNER_STEP_MS = 120;

export type SpinnerVariant = "wheel" | "dots";

export const resolveSpinnerVariant = (value: unknown): SpinnerVariant =>
  value === "dots" ? "dots" : "wheel";

export const spinnerGlyph = (
  glyphs: readonly string[],
  animationTimeMs: number,
): string => glyphs[Math.floor(Math.max(0, animationTimeMs) / SPINNER_STEP_MS) % glyphs.length] ?? " ";
