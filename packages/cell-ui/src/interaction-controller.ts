import { ActivationFeedbackManager } from "./activation-feedback.js";
import { CELL_ACTIVATION_BLINK_PHASE_MS, type ActivationBlinkCount } from "./activation-feedback-config.js";
import { FocusManager, commandForInput, type WidgetCommand } from "./interaction.js";
import { GestureManager, type GestureCandidate } from "./gestures.js";
import { PressManager } from "./press.js";
import { isCellKeyPress } from "./keyboard.js";
import type { KeyInput } from "@chardesk/keyboard";
import type { CellPoint, FrameSnapshot, WidgetId } from "./types.js";
import { resolvePointerAppearance } from "./pointer.js";

export type InteractionClock = Readonly<{
  schedule: (callback: () => void, delay: number) => () => void;
}>;
const defaultClock: InteractionClock = {
  schedule(callback, delay) {
    const timer = globalThis.setTimeout(callback, delay);
    return () => globalThis.clearTimeout(timer);
  },
};

/** Host-independent ownership of interaction mechanisms and confirmation ordering. */
export class CellInteractionController {
  readonly focus = new FocusManager();
  readonly gestures = new GestureManager();
  readonly press = new PressManager();
  readonly feedback = new ActivationFeedbackManager();
  #cancelTimer: (() => void) | null = null;
  #inputSource: "keyboard" | "pointer" = "keyboard";
  #hoveredId: WidgetId | null = null;
  #frame: FrameSnapshot | null = null;
  constructor(
    readonly notify: () => void,
    readonly emit: (command: WidgetCommand) => void,
    readonly clock: InteractionClock = defaultClock,
  ) {}

  get snapshot() {
    return Object.freeze({
      focusedId: this.focus.focusedId,
      pressActiveId: this.press.activeId,
      activationFlashId: this.feedback.activeId,
      activationTargetId: this.feedback.targetId,
      focusVisible: this.#inputSource === "keyboard",
      hoveredId: this.#inputSource === "pointer" && !this.feedback.settling ? this.#hoveredId : null,
    });
  }

  setInputSource(source: "keyboard" | "pointer"): void {
    this.#inputSource = source;
  }

  hover(frame: FrameSnapshot, point: CellPoint): void {
    this.#inputSource = "pointer";
    this.setHovered(frame, resolvePointerAppearance(frame, point).hoveredId);
  }

  setHovered(frame: FrameSnapshot, targetId: WidgetId | null): void {
    this.#hoveredId = targetId;
    if (this.#inputSource !== "pointer" || this.feedback.settling || targetId === this.focus.focusedId) return;
    if (targetId && frame.tree.nodes.get(targetId)?.kind === "select-item") {
      const command = { type: "focus", targetId } as const;
      this.focus.apply(command);
      this.emit(command);
      this.notify();
    }
  }

  key(frame: FrameSnapshot, input: KeyInput, count: ActivationBlinkCount): boolean {
    this.#inputSource = "keyboard";
    if (this.feedback.settling && input.phase === "down") {
      const command = commandForInput(input, frame, this.focus);
      this.commit(command, frame, count);
      return !!command;
    }
    let released: WidgetId | null = null;
    let changed = false;
    if (input.phase === "down") {
      if (isCellKeyPress(input, "Enter") || isCellKeyPress(input, " ")) changed = this.cancel();
      changed = this.press.beginKey(frame, input, this.focus.focusedId) || changed;
    } else {
      released = this.press.activeId;
      changed = this.press.endKey(input);
    }
    const command = commandForInput(input, frame, this.focus);
    if (command) this.commit(command, frame, count);
    else if (changed) this.notify();
    if (changed && released) this.restart(frame, released, count);
    return !!command;
  }

  beginPointer(frame: FrameSnapshot, pointerId: number, point: CellPoint, candidates: readonly GestureCandidate[], precisePoint?: CellPoint): void {
    this.hover(frame, point);
    this.gestures.begin(pointerId, point, candidates, precisePoint);
    this.press.beginPointer(frame, pointerId, point);
    this.notify();
  }

  movePointer(frame: FrameSnapshot, pointerId: number, point: CellPoint, precisePoint?: CellPoint) {
    this.hover(frame, point);
    const signals = this.gestures.move(pointerId, point, precisePoint);
    if (signals.some((signal) => signal.kind === "tap" && signal.phase === "cancel")) this.press.cancelPointer(pointerId);
    else this.press.movePointer(frame, pointerId, point);
    this.notify();
    return signals;
  }

  endPointer(pointerId: number, point: CellPoint, precisePoint?: CellPoint) {
    const signals = this.gestures.end(pointerId, point, precisePoint);
    this.press.endPointer(pointerId);
    this.notify();
    return signals;
  }

  commit(command: WidgetCommand | null, frame: FrameSnapshot, count: ActivationBlinkCount): void {
    this.#frame = frame;
    if (!command) return;
    if (this.feedback.settling) {
      if (command.type !== "dismiss") return;
      this.cancel();
    }
    this.feedback.start(frame, command, count);
    this.focus.apply(command);
    this.emit(command);
    this.notify();
    this.schedule();
    if (!this.feedback.running) this.flush();
  }

  restart(frame: FrameSnapshot, targetId: WidgetId, count: ActivationBlinkCount): void {
    this.#frame = frame;
    this.feedback.restart(frame, targetId, count);
    this.notify();
    this.schedule();
    if (!this.feedback.running) this.flush();
  }

  stopClock(): void {
    this.#cancelTimer?.();
    this.#cancelTimer = null;
  }

  schedule(): void {
    this.stopClock();
    if (!this.feedback.running || (this.feedback.settling && this.press.activeId !== null)) return;
    this.#cancelTimer = this.clock.schedule(() => {
      this.#cancelTimer = null;
      if (!this.feedback.advance()) return;
      this.notify();
      if (this.feedback.running) this.schedule();
      else this.flush();
    }, CELL_ACTIVATION_BLINK_PHASE_MS);
  }

  flush(): void {
    const command = this.feedback.takeCompletionCommand();
    if (!command || !this.#frame?.tree.nodes.has(command.targetId)) return;
    this.focus.apply(command);
    this.emit(command);
    this.notify();
  }

  settle(): void {
    this.stopClock();
    if (this.feedback.settle()) this.notify();
    this.flush();
  }

  sync(frame: FrameSnapshot): boolean {
    this.#frame = frame;
    const changed = this.feedback.sync(frame);
    if (changed) this.stopClock();
    return changed;
  }

  cancel(): boolean {
    this.stopClock();
    return this.feedback.clear();
  }
}
