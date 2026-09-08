import type { ReactElement } from "react";
import { CellBuffer } from "./buffer.js";
import { GestureManager, type GestureSignal } from "./gestures.js";
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
  readonly #render: () => ReactElement<RootProps> | null;
  readonly #onCommand: (command: WidgetCommand) => void;
  readonly #runtime: CellUiRuntime;
  #frame: FrameSnapshot;
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
    this.#commit(commandForInput(
      { type: "pointer", phase: "down", point, button: 0 },
      this.#frame,
      this.#focus
    ));
    const targetId = hitTest(this.#frame.scene, point)[0];
    const path = targetId ? getEventPath(this.#frame.scene, targetId) : [];
    this.#gestures.begin(pointerId, point, gestureCandidatesForFrame(this.#frame, path, point, precisePoint), precisePoint);
    await this.pause();
  }

  async pointerMove(point: CellPoint, pointerId = 1, precisePoint?: CellPoint): Promise<void> {
    this.#assertActive();
    this.#applyGestureSignals(this.#gestures.move(pointerId, point, precisePoint));
    await this.pause();
  }

  async pointerUp(point: CellPoint, pointerId = 1, precisePoint?: CellPoint): Promise<void> {
    this.#assertActive();
    this.#applyGestureSignals(this.#gestures.end(pointerId, point, precisePoint));
    await this.pause();
  }

  async semanticAction(targetId: WidgetId, action: SemanticAction): Promise<void> {
    await this.input({ type: "semantic", targetId, action });
  }

  async input(input: EngineInput): Promise<void> {
    this.#assertActive();
    this.#commit(commandForInput(input, this.#frame, this.#focus));
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
    this.#runtime.dispose();
    this.#disposed = true;
  }

  #commit(command: WidgetCommand | null): void {
    if (!command) return;
    this.#focus.apply(command);
    this.#onCommand(command);
    this.#renderFrame();
  }

  #applyGestureSignals(signals: readonly GestureSignal[]): void {
    for (const signal of signals) {
      this.#commit(commandForGestureSignal(this.#frame, signal, this.#focus));
    }
  }

  #renderFrame(): void {
    this.#frame = this.#runtime.render(this.#render(), {
      resolveFocusedId: (tree) => {
        this.#focus.sync(tree);
        return this.#focus.focusedId;
      },
    });
    this.#syncTextViewports();
    this.#gestures.sync((candidate) => validGestureCandidate(this.#frame, candidate));
  }

  #syncTextViewports(): void {
    const commands = textViewportCommands(this.#frame);
    if (!commands.length) return;
    for (const command of commands) this.#onCommand(command);
    this.#frame = this.#runtime.render(this.#render(), { focusedId: this.#focus.focusedId });
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error("TestPilot has been disposed.");
  }
}

export const createTestPilot = (options: TestPilotOptions): TestPilot =>
  new TestPilot(options);
