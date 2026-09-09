import { ActivationFeedbackManager } from "./activation-feedback.js";
import { CELL_ACTIVATION_BLINK_PHASE_MS, type ActivationBlinkCount } from "./activation-feedback-config.js";
import { FocusManager, commandForInput, type WidgetCommand } from "./interaction.js";
import { GestureManager, type GestureCandidate } from "./gestures.js";
import { PressManager } from "./press.js";
import { isCellKeyPress } from "./keyboard.js";
import type { KeyInput } from "@chardesk/keyboard";
import type { CellPoint, ConfirmationColors, ConfirmationPresentation, FrameSnapshot, WidgetId } from "./types.js";
import { resolvePointerAppearance } from "./pointer.js";
import { menuScopeId } from "./primitive-behavior.js";

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
  #acknowledged: string | null = null;
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
      activationTargetId: this.feedback.waiting ? null : this.feedback.targetId,
      confirmation: this.feedback.presentation,
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
    const kind = targetId ? frame.tree.nodes.get(targetId)?.kind : undefined;
    if (targetId && (kind === "select-item" || kind === "menu-item" || kind === "combobox-item")) {
      const command = kind === "combobox-item"
        ? { type: "set-active", targetId } as const
        : { type: "focus", targetId } as const;
      this.focus.apply(command);
      this.emit(command);
      this.notify();
    }
  }

  key(frame: FrameSnapshot, input: KeyInput, count: ActivationBlinkCount): boolean {
    const sourceChanged = this.#inputSource !== "keyboard";
    this.#inputSource = "keyboard";
    if (this.feedback.settling && input.phase === "down") {
      if (this.feedback.defersActivation && isCellKeyPress(input, "Escape")) {
        this.cancel();
        this.notify();
        this.commit(commandForInput(input, frame, this.focus), frame, count);
        return true;
      }
      const command = commandForInput(input, frame, this.focus);
      this.commit(command, frame, count);
      return !!command;
    }
    let released: WidgetId | null = null;
    let releaseReference: ConfirmationColors | null = null;
    let changed = sourceChanged;
    if (input.phase === "down") {
      if (isCellKeyPress(input, "Enter") || isCellKeyPress(input, " ")) changed = this.cancel() || changed;
      changed = this.press.beginKey(frame, input, this.focus.focusedId) || changed;
    } else {
      released = this.press.activeId;
      if (released) releaseReference = this.reference(frame, released);
      const ended = this.press.endKey(input);
      if (!ended) released = null;
      changed = ended || changed;
    }
    if (released && releaseReference && this.feedback.waiting && this.feedback.targetId === released) {
      this.feedback.release(releaseReference);
    }
    const command = commandForInput(input, frame, this.focus);
    if (command) this.commit(command, frame, count);
    else if (changed) this.notify();
    return !!command;
  }

  beginPointer(frame: FrameSnapshot, pointerId: number, point: CellPoint, candidates: readonly GestureCandidate[], precisePoint?: CellPoint): void {
    this.hover(frame, point);
    this.gestures.begin(pointerId, point, candidates, precisePoint);
    this.press.beginPointer(frame, pointerId, point);
    this.notify();
  }

  /** A deferred menu locks its own rectangle; outside input cancels, then proceeds. */
  interceptPointer(frame: FrameSnapshot, point: CellPoint): boolean {
    if (!this.feedback.settling) return false;
    if (!this.feedback.defersActivation) return true;
    const scope = menuScopeId(frame, this.feedback.targetId ?? "");
    const entry = scope ? frame.scene.entries.get(scope) : undefined;
    const contains = (rect: { x: number; y: number; width: number; height: number }) =>
      point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height;
    if (entry && contains(entry.layoutBounds) && contains(entry.outerClip)) return true;
    this.cancel();
    this.notify();
    return false;
  }

  movePointer(frame: FrameSnapshot, pointerId: number, point: CellPoint, precisePoint?: CellPoint) {
    this.hover(frame, point);
    const signals = this.gestures.move(pointerId, point, precisePoint);
    if (signals.some((signal) => signal.kind === "tap" && signal.phase === "cancel")) this.press.cancelPointer(pointerId);
    else this.press.movePointer(frame, pointerId, point);
    this.notify();
    return signals;
  }

  endPointer(frame: FrameSnapshot, pointerId: number, point: CellPoint, precisePoint?: CellPoint) {
    this.hover(frame, point);
    const signals = this.gestures.end(pointerId, point, precisePoint);
    this.press.endPointer(pointerId);
    this.notify();
    return signals;
  }

  commit(command: WidgetCommand | null, frame: FrameSnapshot, count: ActivationBlinkCount): void {
    this.#frame = frame;
    if (!command) return;
    if (this.feedback.settling) {
      const outsideMenu = this.feedback.defersActivation
        && menuScopeId(frame, command.targetId) !== menuScopeId(frame, this.feedback.targetId ?? "");
      if (command.type !== "dismiss" && !outsideMenu) return;
      this.cancel();
    }
    this.stopClock();
    const reference = this.reference(frame, command.targetId);
    this.feedback.start(frame, command, count, {
      reference,
      waitForRelease: this.press.activeId === command.targetId,
    });
    this.focus.apply(command);
    if (!this.feedback.defersActivation) this.emit(command);
    this.notify();
    if (!this.feedback.running) this.flush();
  }

  private reference(frame: FrameSnapshot, targetId: WidgetId): ConfirmationColors {
    const entry = frame.scene.entries.get(targetId);
    const rect = entry?.decorationBounds;
    const style = rect ? frame.buffer.get(rect.x, rect.y)?.style : undefined;
    return { color: style?.color ?? frame.colors.color, backgroundColor: style?.backgroundColor ?? frame.colors.backgroundColor };
  }

  stopClock(): void {
    this.#cancelTimer?.();
    this.#cancelTimer = null;
  }

  presented(presentation: ConfirmationPresentation | undefined): void {
    const current = this.feedback.presentation;
    if (!presentation || !current || presentation.sessionId !== current.sessionId || presentation.phase !== current.phase) return;
    const key = `${current.sessionId}:${current.phase}`;
    if (this.#acknowledged === key) return;
    this.#acknowledged = key;
    this.stopClock();
    this.#cancelTimer = this.clock.schedule(() => {
      const active = this.feedback.presentation;
      if (!active || active.sessionId !== current.sessionId || active.phase !== current.phase) return;
      this.#cancelTimer = null;
      if (!this.feedback.advance()) return;
      this.notify();
      if (!this.feedback.running) this.flush();
    }, CELL_ACTIVATION_BLINK_PHASE_MS);
  }

  flush(): void {
    const command = this.feedback.takeCompletionCommand();
    const target = command ? this.#frame?.tree.nodes.get(command.targetId) : undefined;
    if (!command || !target || target.disabled) return;
    if (command.type === "activate" && (target.kind !== "menu-item" || !this.#frame?.scene.entries.get(target.id)?.paintVisible)) return;
    this.focus.apply(command);
    this.emit(command);
    this.notify();
  }

  settle(): void {
    this.stopClock();
    if (this.feedback.settle()) this.notify();
    this.flush();
  }

  deactivate(): void {
    const pressed = this.press.cancel();
    this.settle();
    if (pressed) this.notify();
  }

  sync(frame: FrameSnapshot): boolean {
    this.#frame = frame;
    const changed = this.feedback.sync(frame)
      || (this.feedback.waiting && this.press.activeId !== this.feedback.targetId && this.feedback.settle());
    if (changed) this.stopClock();
    return changed;
  }

  cancel(): boolean {
    this.stopClock();
    return this.feedback.clear();
  }
}
