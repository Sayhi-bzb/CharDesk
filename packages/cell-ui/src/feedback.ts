import { resolveActivationBlinkCount, type ActivationBlinkCount } from "./activation-feedback-config.js";

export type CellFeedbackConfig = Readonly<{
  activationBlinkCount: ActivationBlinkCount;
}>;

export const CLASSIC_CELL_FEEDBACK: CellFeedbackConfig = Object.freeze({ activationBlinkCount: 2 });
export const INSTANT_CELL_FEEDBACK: CellFeedbackConfig = Object.freeze({ activationBlinkCount: 0 });

export const resolveCellFeedback = (feedback?: Partial<CellFeedbackConfig>): CellFeedbackConfig => ({
  activationBlinkCount: resolveActivationBlinkCount(feedback?.activationBlinkCount),
});
