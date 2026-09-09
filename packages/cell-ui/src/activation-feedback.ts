import type { WidgetCommand } from "./interaction.js";
import { confirmationCompletion } from "./primitive-behavior.js";
import { ConfirmationSequence } from "./confirmation-sequence.js";
import type { FrameSnapshot, WidgetId } from "./types.js";
import { supportsActivationFeedback } from "./widget-capabilities.js";
import {
  DEFAULT_CELL_ACTIVATION_BLINK_COUNT,
  type ActivationBlinkCount,
} from "./activation-feedback-config.js";

const validActivationFeedbackTarget = (
  frame: FrameSnapshot,
  targetId: WidgetId
): boolean => {
  const node = frame.tree.nodes.get(targetId);
  const entry = frame.scene.entries.get(targetId);
  return !!node
    && supportsActivationFeedback(node.kind)
    && !node.disabled
    && !!entry?.paintVisible;
};

export const activationFeedbackTargetForCommand = (
  frame: FrameSnapshot,
  command: WidgetCommand
): WidgetId | null => (
  command.type === "activate"
  && validActivationFeedbackTarget(frame, command.targetId)
    ? command.targetId
    : null
);

/** Owns post-activation confirmation; hosts own clocks and product commands. */
export class ActivationFeedbackManager {
  #targetId: WidgetId | null = null;
  readonly #sequence = new ConfirmationSequence();
  #completionCommand: WidgetCommand | null = null;
  #readyCompletionCommand: WidgetCommand | null = null;

  get activeId(): WidgetId | null {
    return this.#sequence.visible ? this.#targetId : null;
  }

  get targetId(): WidgetId | null {
    return this.#targetId;
  }

  get running(): boolean {
    return this.#targetId !== null;
  }

  get settling(): boolean {
    return this.#completionCommand !== null || this.#readyCompletionCommand !== null;
  }

  start(
    frame: FrameSnapshot,
    command: WidgetCommand,
    count: ActivationBlinkCount = DEFAULT_CELL_ACTIVATION_BLINK_COUNT
  ): WidgetId | null {
    const targetId = activationFeedbackTargetForCommand(frame, command);
    if (!targetId) {
      this.clear();
      return null;
    }
    this.clear();
    this.#completionCommand = confirmationCompletion(frame, targetId);
    if (count === 0) {
      this.#finish();
      return null;
    }
    this.#targetId = targetId;
    this.#sequence.start(count);
    return targetId;
  }

  restart(
    frame: FrameSnapshot,
    targetId: WidgetId,
    count: ActivationBlinkCount = DEFAULT_CELL_ACTIVATION_BLINK_COUNT
  ): WidgetId | null {
    if (!validActivationFeedbackTarget(frame, targetId)) {
      this.clear();
      return null;
    }
    this.clear();
    this.#completionCommand = confirmationCompletion(frame, targetId);
    if (count === 0) {
      this.#finish();
      return null;
    }
    this.#targetId = targetId;
    this.#sequence.start(count);
    return targetId;
  }

  advance(): boolean {
    if (this.#targetId === null) return false;
    this.#sequence.advance();
    if (!this.#sequence.running) this.#finish();
    return true;
  }

  clear(): boolean {
    const changed = this.#targetId !== null
      || this.#completionCommand !== null
      || this.#readyCompletionCommand !== null;
    this.#targetId = null;
    this.#sequence.clear();
    this.#completionCommand = null;
    this.#readyCompletionCommand = null;
    return changed;
  }

  settle(): boolean {
    if (this.#targetId === null && this.#completionCommand === null) return false;
    this.#finish();
    return true;
  }

  takeCompletionCommand(): WidgetCommand | null {
    const command = this.#readyCompletionCommand;
    this.#readyCompletionCommand = null;
    return command;
  }

  sync(frame: FrameSnapshot): boolean {
    if (
      this.#targetId === null
      || validActivationFeedbackTarget(frame, this.#targetId)
    ) return false;
    return this.settle();
  }

  #finish(): void {
    this.#targetId = null;
    this.#sequence.clear();
    this.#readyCompletionCommand = this.#completionCommand;
    this.#completionCommand = null;
  }
}
