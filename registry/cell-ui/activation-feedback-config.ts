export type ActivationBlinkCount = 0 | 1 | 2 | 3;

export const DEFAULT_CELL_ACTIVATION_BLINK_COUNT: ActivationBlinkCount = 2;
export const CELL_ACTIVATION_BLINK_PHASE_MS = 80;

export const resolveActivationBlinkCount = (value: unknown): ActivationBlinkCount =>
  value === 0 || value === 1 || value === 2 || value === 3
    ? value
    : DEFAULT_CELL_ACTIVATION_BLINK_COUNT;
