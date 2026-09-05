import { getEventPath, hitTest } from "./scene.js";
import type {
  CellPoint,
  FrameSnapshot,
  WidgetId,
} from "./types.js";

export type CellPointerEventType =
  | "pointer-down"
  | "pointer-move"
  | "pointer-up"
  | "pointer-cancel";

export type CellEventPhase = "capture" | "bubble";

export type CellPointerInput = Readonly<{
  type: CellPointerEventType;
  pointerId: number;
  point: CellPoint;
  button?: number;
}>;

export type CellPointerEvent = Readonly<{
  type: CellPointerEventType;
  pointerId: number;
  point: CellPoint;
  button: number;
  targetId: WidgetId;
  currentTargetId: WidgetId;
  phase: CellEventPhase;
  defaultPrevented: boolean;
  propagationStopped: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
  capturePointer: () => void;
  releasePointer: () => void;
}>;

export type CellEventHandler = (event: CellPointerEvent) => void;

export type CellEventHandlers = Readonly<{
  capture?: CellEventHandler;
  bubble?: CellEventHandler;
}>;

export type CellEventHandlerMap = ReadonlyMap<WidgetId, CellEventHandlers>;

export type CellEventDispatch = Readonly<{
  targetId: WidgetId | null;
  path: readonly WidgetId[];
  defaultPrevented: boolean;
  propagationStopped: boolean;
}>;

type PointerCapture = Readonly<{
  targetId: WidgetId;
  path: readonly WidgetId[];
  point: CellPoint;
}>;

const EMPTY_DISPATCH: CellEventDispatch = Object.freeze({
  targetId: null,
  path: [],
  defaultPrevented: false,
  propagationStopped: false,
});

export class EventManager {
  readonly #captures = new Map<number, PointerCapture>();

  capturedTarget(pointerId: number): WidgetId | null {
    return this.#captures.get(pointerId)?.targetId ?? null;
  }

  resolveTarget(
    frame: FrameSnapshot,
    point: CellPoint,
    pointerId: number
  ): WidgetId | null {
    const captured = this.#captures.get(pointerId);
    if (captured) return captured.targetId;
    return hitTest(frame.scene, point)[0] ?? null;
  }

  dispatch(
    frame: FrameSnapshot,
    input: CellPointerInput,
    handlers: CellEventHandlerMap = new Map()
  ): CellEventDispatch {
    const captured = this.#captures.get(input.pointerId);
    const targetId = captured?.targetId ?? hitTest(frame.scene, input.point)[0] ?? null;
    if (!targetId) return EMPTY_DISPATCH;
    const path = captured?.path ?? getEventPath(frame.scene, targetId);
    const result = this.#dispatchPath(input, targetId, path, handlers);
    if (this.#captures.has(input.pointerId)) {
      const current = this.#captures.get(input.pointerId)!;
      this.#captures.set(input.pointerId, { ...current, point: input.point });
    }
    if (input.type === "pointer-up" || input.type === "pointer-cancel") {
      this.#captures.delete(input.pointerId);
    }
    return result;
  }

  sync(
    frame: FrameSnapshot,
    handlers: CellEventHandlerMap = new Map()
  ): readonly number[] {
    const cancelled: number[] = [];
    for (const [pointerId, capture] of this.#captures) {
      const node = frame.tree.nodes.get(capture.targetId);
      const scene = frame.scene.entries.get(capture.targetId);
      if (node && !node.disabled && scene?.paintVisible) continue;
      this.#dispatchPath(
        {
          type: "pointer-cancel",
          pointerId,
          point: capture.point,
        },
        capture.targetId,
        capture.path,
        handlers
      );
      this.#captures.delete(pointerId);
      cancelled.push(pointerId);
    }
    return cancelled;
  }

  cancel(
    pointerId: number,
    handlers: CellEventHandlerMap = new Map()
  ): CellEventDispatch {
    const capture = this.#captures.get(pointerId);
    if (!capture) return EMPTY_DISPATCH;
    const result = this.#dispatchPath(
      {
        type: "pointer-cancel",
        pointerId,
        point: capture.point,
      },
      capture.targetId,
      capture.path,
      handlers
    );
    this.#captures.delete(pointerId);
    return result;
  }

  #dispatchPath(
    input: CellPointerInput,
    targetId: WidgetId,
    path: readonly WidgetId[],
    handlers: CellEventHandlerMap
  ): CellEventDispatch {
    let defaultPrevented = false;
    let propagationStopped = false;
    const invoke = (
      currentTargetId: WidgetId,
      phase: CellEventPhase,
      handler: CellEventHandler | undefined
    ) => {
      if (!handler || propagationStopped) return;
      handler({
        type: input.type,
        pointerId: input.pointerId,
        point: input.point,
        button: input.button ?? 0,
        targetId,
        currentTargetId,
        phase,
        get defaultPrevented() { return defaultPrevented; },
        get propagationStopped() { return propagationStopped; },
        preventDefault: () => { defaultPrevented = true; },
        stopPropagation: () => { propagationStopped = true; },
        capturePointer: () => {
          this.#captures.set(input.pointerId, {
            targetId: currentTargetId,
            path: path.slice(path.indexOf(currentTargetId)),
            point: input.point,
          });
        },
        releasePointer: () => {
          if (this.#captures.get(input.pointerId)?.targetId === currentTargetId) {
            this.#captures.delete(input.pointerId);
          }
        },
      });
    };

    for (const id of path.slice().reverse()) {
      invoke(id, "capture", handlers.get(id)?.capture);
    }
    for (const id of path) {
      invoke(id, "bubble", handlers.get(id)?.bubble);
    }
    return { targetId, path, defaultPrevented, propagationStopped };
  }
}
