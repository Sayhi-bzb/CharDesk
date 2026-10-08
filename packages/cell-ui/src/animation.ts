export type CellAnimationClock = Readonly<{
  elapsedMs: number;
  frame: number;
  fps: number;
  playing: boolean;
  reducedMotion: boolean;
}>;

export type CellAnimationFramePolicy = Readonly<{
  fps: number;
  reducedMotion: boolean;
}>;

export const resolveCellAnimationFramePolicy = (
  options: Readonly<{ fps?: number; reducedMotion?: boolean }> = {},
): CellAnimationFramePolicy => ({
  fps: Number.isFinite(options.fps) && options.fps! > 0 ? Math.min(120, Math.max(1, Math.trunc(options.fps!))) : 30,
  reducedMotion: options.reducedMotion === true,
});

export const cellAnimationFrameAt = (elapsedMs: number, fps: number): number =>
  Math.max(0, Math.floor(Math.max(0, elapsedMs) * fps / 1000));
