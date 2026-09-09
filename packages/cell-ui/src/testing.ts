import type { ReactElement } from "react";
import { CellBuffer } from "./buffer.js";
import { GestureManager, type GestureSignal } from "./gestures.js";
import { PressManager } from "./press.js";
import {
  ActivationFeedbackManager,
  CELL_ACTIVATION_FLASH_DURATION_MS,
} from "./activation-feedback.js";
import {
  FocusManager,
  commandForInput,
  type EngineInput,
  type WidgetCommand,
} from "./interaction.js";
import {
  createKeyInput,
  type KeyInputInit,
} from "@chardesk/keyboard";
import type { RootProps } from "./react.js";
import { captureCellProbe, inspectCell } from "./probe.js";
import {
  commandForGestureSignal,
  gestureCandidatesForFrame,
  validGestureCandidate,
} from "./pointer.js";
import { CellUiRuntime } from "./runtime.js";
import { textViewportCommands } from "./text-viewport.js";
import { scrollCommandForOffset, scrollOffsetFor } from "./scroll.js";
import { getEventPath, hitTest } from "./scene.js";
import { isCellKeyPress } from "./keyboard.js";
import type {
  CellPoint,
  CellRect,
  CellSize,
  FrameSnapshot,
  SceneEntry,
  SceneSnapshot,
  SemanticAction,
  SemanticNode,
  SemanticSnapshot,
  WidgetId,
} from "./types.js";
import type { CellInspection, CellProbeSnapshot } from "./probe.js";

export type SemanticQuery = Readonly<{
  name?: string | RegExp;
}>;

export type TestPilotOptions = Readonly<{
  viewport: CellSize;
  render: () => ReactElement<RootProps> | null;
  onCommand?: (command: WidgetCommand) => void;
}>;

export type TestKeyOptions = Omit<KeyInputInit, "key" | "phase">;

const matchesName = (label: string, name: string | RegExp | undefined) =>
  name === undefined || (typeof name === "string" ? label === name : name.test(label));

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export class TestPilot {
  readonly #focus = new FocusManager();
  readonly #gestures = new GestureManager();
  readonly #press = new PressManager();
  readonly #activationFeedback = new ActivationFeedbackManager();
  readonly #render: () => ReactElement<RootProps> | null;
  readonly #onCommand: (command: WidgetCommand) => void;
  readonly #runtime: CellUiRuntime;
  #frame: FrameSnapshot;
  #activationFeedbackTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  #disposed = false;

  constructor(options: TestPilotOptions) {
    this.#render = options.render;
    this.#onCommand = options.onCommand ?? (() => undefined);
    this.#runtime = new CellUiRuntime({ viewport: options.viewport });
    this.#frame = this.#runtime.render(this.#render());
    this.#focus.sync(this.#frame.tree, this.#frame.semantics.focusedId);
    this.#syncTextViewports();
  }

  get frame(): FrameSnapshot {
    return this.#frame;
  }

  async press(...keys: string[]): Promise<void> {
    for (const key of keys) await this.pressKey(key);
  }

  async keyDown(key: string, options: TestKeyOptions = {}): Promise<void> {
    await this.input(createKeyInput({ ...options, key, phase: "down" }));
  }

  async keyUp(key: string, options: TestKeyOptions = {}): Promise<void> {
    await this.input(createKeyInput({ ...options, key, phase: "up" }));
  }

  async pressKey(key: string, options: TestKeyOptions = {}): Promise<void> {
    await this.keyDown(key, options);
    await this.keyUp(key, options);
  }

  async click(point: CellPoint): Promise<void> {
    await this.pointerDown(point);
    await this.pointerUp(point);
  }

  async pointerDown(point: CellPoint, pointerId = 1, precisePoint?: CellPoint): Promise<void> {
    this.#assertActive();
    const feedbackChanged = this.#cancelActivationFeedback();
    this.#commit(commandForInput(
      { type: "pointer", phase: "down", point, button: 0 },
      this.#frame,
      this.#focus
    ));
    const targetId = hitTest(this.#frame.scene, point)[0];
    const path = targetId ? getEventPath(this.#frame.scene, targetId) : [];
    this.#gestures.begin(pointerId, point, gestureCandidatesForFrame(this.#frame, path, point, precisePoint), precisePoint);
    if (this.#press.beginPointer(this.#frame, pointerId, point) || feedbackChanged) this.#renderFrame();
    await this.pause();
  }

  async pointerMove(point: CellPoint, pointerId = 1, precisePoint?: CellPoint): Promise<void> {
    this.#assertActive();
    const signals = this.#gestures.move(pointerId, point, precisePoint);
    const changed = signals.some((signal) => signal.kind === "tap" && signal.phase === "cancel")
      ? this.#press.cancelPointer(pointerId)
      : this.#press.movePointer(this.#frame, pointerId, point);
    if (changed) this.#renderFrame();
    this.#applyGestureSignals(signals);
    await this.pause();
  }

  async pointerUp(point: CellPoint, pointerId = 1, precisePoint?: CellPoint): Promise<void> {
    this.#assertActive();
    const signals = this.#gestures.end(pointerId, point, precisePoint);
    if (this.#press.endPointer(pointerId)) this.#renderFrame();
    this.#applyGestureSignals(signals);
    await this.pause();
  }

  async semanticAction(targetId: WidgetId, action: SemanticAction): Promise<void> {
    await this.input({ type: "semantic", targetId, action });
  }

  async input(input: EngineInput): Promise<void> {
    this.#assertActive();
    let feedbackChanged = false;
    let releasedTargetId: WidgetId | null = null;
    let pressChanged = false;
    if (input.type === "key") {
      if (input.phase === "down") {
        if (isCellKeyPress(input, "Enter") || isCellKeyPress(input, " ")) {
          feedbackChanged = this.#cancelActivationFeedback();
        }
        pressChanged = this.#press.beginKey(this.#frame, input, this.#focus.focusedId);
      } else {
        releasedTargetId = this.#press.activeId;
        pressChanged = this.#press.endKey(input);
      }
    }
    const command = commandForInput(input, this.#frame, this.#focus);
    if (command) this.#commit(command);
    else if (pressChanged || feedbackChanged) this.#renderFrame();
    if (pressChanged && releasedTargetId) {
      this.#restartActivationFeedback(releasedTargetId);
    }
    await this.pause();
  }

  async scroll(targetId: WidgetId, delta: CellPoint): Promise<void> {
    this.#assertActive();
    const node = this.#frame.tree.nodes.get(targetId);
    if (node) {
      const offset = scrollOffsetFor(node);
      this.#commit(scrollCommandForOffset(this.#frame, targetId, { x: offset.x + delta.x, y: offset.y + delta.y }));
    }
    await this.pause();
  }

  async resize(size: CellSize): Promise<void> {
    this.#assertActive();
    this.#runtime.resize(size);
    this.#renderFrame();
    await this.pause();
  }

  async pause(): Promise<void> {
    await Promise.resolve();
  }

  cells(region: CellRect = this.#frame.scene.viewport): CellBuffer {
    const left = clamp(region.x, 0, this.#frame.buffer.width);
    const top = clamp(region.y, 0, this.#frame.buffer.height);
    const right = clamp(region.x + region.width, left, this.#frame.buffer.width);
    const bottom = clamp(region.y + region.height, top, this.#frame.buffer.height);
    const result = new CellBuffer({ width: right - left, height: bottom - top });
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const cell = this.#frame.buffer.get(x, y);
        if (!cell || cell.continuation || cell.ownerId === null) continue;
        result.writeGrapheme(
          x - left,
          y - top,
          cell.text,
          cell.ownerId,
          cell.style,
          undefined,
          "replace"
        );
      }
    }
    return result;
  }

  text(region?: CellRect): string {
    return this.probe(region).text;
  }

  probe(region?: CellRect): CellProbeSnapshot {
    return captureCellProbe(this.#frame, { region });
  }

  inspect(point: CellPoint): CellInspection {
    return inspectCell(this.#frame, point);
  }

  scene(): SceneSnapshot;
  scene(id: WidgetId): SceneEntry;
  scene(id?: WidgetId): SceneSnapshot | SceneEntry {
    if (id === undefined) return this.#frame.scene;
    const entry = this.#frame.scene.entries.get(id);
    if (!entry) throw new Error(`No SceneEntry found for ${JSON.stringify(id)}.`);
    return entry;
  }

  semantics(): SemanticSnapshot {
    return this.#frame.semantics;
  }

  getByRole(role: SemanticNode["role"], query: SemanticQuery = {}): SemanticNode {
    const matches = [...this.#frame.semantics.nodes.values()].filter(
      (node) => !node.hidden && node.role === role && matchesName(node.label, query.name)
    );
    if (matches.length !== 1) {
      const detail = query.name === undefined ? role : `${role} named ${String(query.name)}`;
      throw new Error(`Expected one semantic ${detail}; found ${matches.length}.`);
    }
    return matches[0]!;
  }

  hit(point: CellPoint): readonly WidgetId[] {
    return hitTest(this.#frame.scene, point);
  }

  focus(): WidgetId | null {
    return this.#frame.semantics.focusedId;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#cancelActivationFeedback();
    this.#runtime.dispose();
    this.#disposed = true;
  }

  #commit(command: WidgetCommand | null): void {
    if (!command) return;
    this.#focus.apply(command);
    const feedbackTargetId = this.#activationFeedback.start(this.#frame, command);
    this.#onCommand(command);
    this.#renderFrame();
    if (feedbackTargetId && this.#activationFeedback.activeId === feedbackTargetId) {
      this.#scheduleActivationFeedbackClear();
    }
  }

  #restartActivationFeedback(targetId: WidgetId): void {
    if (!this.#activationFeedback.restart(this.#frame, targetId)) return;
    this.#renderFrame();
    this.#scheduleActivationFeedbackClear();
  }

  #scheduleActivationFeedbackClear(): void {
    if (this.#activationFeedbackTimer !== null) {
      globalThis.clearTimeout(this.#activationFeedbackTimer);
    }
    this.#activationFeedbackTimer = globalThis.setTimeout(() => {
      this.#activationFeedbackTimer = null;
      if (this.#disposed || !this.#activationFeedback.clear()) return;
      this.#renderFrame();
    }, CELL_ACTIVATION_FLASH_DURATION_MS);
  }

  #cancelActivationFeedback(): boolean {
    if (this.#activationFeedbackTimer !== null) {
      globalThis.clearTimeout(this.#activationFeedbackTimer);
      this.#activationFeedbackTimer = null;
    }
    return this.#activationFeedback.clear();
  }

  #applyGestureSignals(signals: readonly GestureSignal[]): void {
    for (const signal of signals) {
      this.#commit(commandForGestureSignal(this.#frame, signal, this.#focus));
    }
  }

  #renderFrame(): void {
    this.#frame = this.#runtime.render(this.#render(), {
      pressActiveId: this.#press.activeId,
      activationFlashId: this.#activationFeedback.activeId,
      resolveFocusedId: (tree) => {
        this.#focus.sync(tree);
        return this.#focus.focusedId;
      },
    });
    let pressChanged = this.#press.sync(this.#frame);
    const activationFeedbackChanged = this.#activationFeedback.sync(this.#frame);
    if (activationFeedbackChanged && this.#activationFeedbackTimer !== null) {
      globalThis.clearTimeout(this.#activationFeedbackTimer);
      this.#activationFeedbackTimer = null;
    }
    for (const pointerId of this.#gestures.sync((candidate) => validGestureCandidate(this.#frame, candidate))) {
      pressChanged = this.#press.cancelPointer(pointerId) || pressChanged;
    }
    if (pressChanged || activationFeedbackChanged) {
      this.#frame = this.#runtime.render(this.#render(), {
        focusedId: this.#focus.focusedId,
        pressActiveId: this.#press.activeId,
        activationFlashId: this.#activationFeedback.activeId,
      });
    }
    this.#syncTextViewports();
  }

  #syncTextViewports(): void {
    const commands = textViewportCommands(this.#frame);
    if (!commands.length) return;
    for (const command of commands) this.#onCommand(command);
    this.#frame = this.#runtime.render(this.#render(), {
      focusedId: this.#focus.focusedId,
      pressActiveId: this.#press.activeId,
      activationFlashId: this.#activationFeedback.activeId,
    });
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("TestPilot has been disposed.");
  }
}

export const createTestPilot = (options: TestPilotOptions): TestPilot =>
  new TestPilot(options);
