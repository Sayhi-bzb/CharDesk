import type { WidgetCommand } from "./interaction.js";
import type { FrameSnapshot, WidgetId } from "./types.js";
import { supportsActivationFeedback } from "./widget-capabilities.js";

export const CELL_ACTIVATION_FLASH_DURATION_MS = 120;

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
  (command.type === "activate" || command.type === "set-expanded")
  && validActivationFeedbackTarget(frame, command.targetId)
    ? command.targetId
    : null
);

/** Owns post-activation confirmation; hosts own clocks and product commands. */
export class ActivationFeedbackManager {
  #activeId: WidgetId | null = null;

  get activeId(): WidgetId | null {
    return this.#activeId;
  }

  start(frame: FrameSnapshot, command: WidgetCommand): WidgetId | null {
    const targetId = activationFeedbackTargetForCommand(frame, command);
    if (!targetId) return null;
    this.#activeId = targetId;
    return targetId;
  }

  restart(frame: FrameSnapshot, targetId: WidgetId): WidgetId | null {
    if (!validActivationFeedbackTarget(frame, targetId)) return null;
    this.#activeId = targetId;
    return targetId;
  }

  clear(): boolean {
    if (this.#activeId === null) return false;
    this.#activeId = null;
    return true;
  }

  sync(frame: FrameSnapshot): boolean {
    if (
      this.#activeId === null
      || validActivationFeedbackTarget(frame, this.#activeId)
    ) return false;
    this.#activeId = null;
    return true;
  }
}
