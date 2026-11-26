export const CANVAS_FRAME_INVALIDATION = {
  background: 1 << 0,
  scratch: 1 << 1,
  overlay: 1 << 2,
  presentation: 1 << 3,
} as const;

export type CanvasFrameInvalidation = number;

export const CANVAS_FRAME_ALL = Object.values(CANVAS_FRAME_INVALIDATION).reduce(
  (mask, value) => mask | value,
  0
);

type CanvasFrameCallback = (
  timestamp: number,
  invalidation: CanvasFrameInvalidation
) => void;

type CanvasFramePriority = "interaction" | "visible" | "background";

type CanvasFramePhase = "update" | "render";

type CanvasFrameRequestOptions = {
  priority?: CanvasFramePriority;
  phase?: CanvasFramePhase;
};

type CanvasFrameTask = {
  callback: CanvasFrameCallback;
  invalidation: CanvasFrameInvalidation;
  priority: CanvasFramePriority;
  phase: CanvasFramePhase;
};

const PRIORITY_ORDER: Record<CanvasFramePriority, number> = {
  interaction: 0,
  visible: 1,
  background: 2,
};

const PHASE_ORDER: Record<CanvasFramePhase, number> = {
  update: 0,
  render: 1,
};

const inferPriority = (invalidation: CanvasFrameInvalidation): CanvasFramePriority => {
  if (
    invalidation &
    (CANVAS_FRAME_INVALIDATION.overlay | CANVAS_FRAME_INVALIDATION.presentation)
  ) return "interaction";
  if (invalidation & CANVAS_FRAME_INVALIDATION.scratch) return "visible";
  return "background";
};

type AnimationFramePort = {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
  now: () => number;
};

const getDefaultAnimationFramePort = (): AnimationFramePort => ({
  requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
  cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle),
  now: () => performance.now(),
});

const reportFrameError = (error: unknown) => {
  if (typeof globalThis.reportError === "function") globalThis.reportError(error);
  else console.error(error);
};

export class CanvasFrameScheduler {
  private readonly port: AnimationFramePort;
  private readonly callbacks = new Map<string, CanvasFrameTask>();
  private activeCallbacks: Map<string, CanvasFrameTask> | null = null;
  private activePhase: CanvasFramePhase | null = null;
  private readonly frameBudgetMs: number;
  private readonly reportError: (error: unknown) => void;
  private readonly resumeListeners = new Set<() => void>();
  private frameHandle: number | null = null;
  private frameGeneration = 0;
  private paused = false;
  private disposed = false;
  private deferredFrames = 0;
  private lastWorkDurationMs = 0;

  constructor(
    port: AnimationFramePort = getDefaultAnimationFramePort(),
    options: { frameBudgetMs?: number; reportError?: (error: unknown) => void } = {}
  ) {
    this.port = port;
    this.frameBudgetMs = options.frameBudgetMs ?? 8;
    this.reportError = options.reportError ?? reportFrameError;
  }

  setPaused(paused: boolean): void {
    if (this.disposed || this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      this.cancelScheduledFrame();
      return;
    }
    this.scheduleFrame();
    const errors: unknown[] = [];
    for (const listener of this.resumeListeners) {
      try {
        listener();
      } catch (error) {
        errors.push(error);
      }
    }
    errors.forEach((error) => this.reportError(error));
  }

  subscribeResume(listener: () => void): () => void {
    this.resumeListeners.add(listener);
    return () => { this.resumeListeners.delete(listener); };
  }

  request(
    key: string,
    invalidation: CanvasFrameInvalidation,
    callback: CanvasFrameCallback,
    options: CanvasFrameRequestOptions = {}
  ): void {
    if (this.disposed) return;
    const priority = options.priority ?? inferPriority(invalidation);
    const phase = options.phase ?? "update";
    const canRunInCurrentFrame =
      this.activeCallbacks !== null &&
      this.activePhase !== null &&
      PHASE_ORDER[phase] > PHASE_ORDER[this.activePhase];
    const target = canRunInCurrentFrame
      ? this.activeCallbacks!
      : this.callbacks;
    const previous = target.get(key);
    target.set(key, {
      callback,
      invalidation: (previous?.invalidation ?? 0) | invalidation,
      priority:
        previous && PRIORITY_ORDER[previous.priority] < PRIORITY_ORDER[priority]
          ? previous.priority
          : priority,
      phase,
    });
    if (!canRunInCurrentFrame) this.scheduleFrame();
  }

  getStats() {
    return {
      pending: this.callbacks.size + (this.activeCallbacks?.size ?? 0),
      deferredFrames: this.deferredFrames,
      lastWorkDurationMs: this.lastWorkDurationMs,
      frameBudgetMs: this.frameBudgetMs,
    };
  }

  private scheduleFrame(): void {
    if (
      this.frameHandle !== null ||
      this.activeCallbacks !== null ||
      this.callbacks.size === 0 ||
      this.paused ||
      this.disposed
    ) return;
    const generation = ++this.frameGeneration;
    this.frameHandle = this.port.requestAnimationFrame((timestamp) => {
      if (generation !== this.frameGeneration) return;
      this.frameHandle = null;
      this.run(timestamp);
    });
  }

  private cancelScheduledFrame(): void {
    if (this.frameHandle === null) return;
    this.port.cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    this.frameGeneration += 1;
  }

  now(): number {
    return this.port.now();
  }

  cancel(key: string): void {
    this.callbacks.delete(key);
    this.activeCallbacks?.delete(key);
    if (
      this.callbacks.size !== 0 ||
      (this.activeCallbacks?.size ?? 0) !== 0 ||
      this.frameHandle === null
    ) return;
    this.cancelScheduledFrame();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelScheduledFrame();
    this.resumeListeners.clear();
    this.callbacks.clear();
    this.activeCallbacks?.clear();
    this.activeCallbacks = null;
    this.activePhase = null;
  }

  private run(timestamp: number): void {
    const startedAt = this.port.now();
    const activeCallbacks = new Map(this.callbacks);
    this.activeCallbacks = activeCallbacks;
    this.callbacks.clear();
    let completedTasks = 0;
    const errors: unknown[] = [];
    while (activeCallbacks.size > 0) {
      if (
        this.paused ||
        (completedTasks > 0 && this.port.now() - startedAt >= this.frameBudgetMs)
      ) {
        this.deferredFrames += 1;
        for (const [pendingKey, pendingTask] of activeCallbacks) {
          const newer = this.callbacks.get(pendingKey);
          this.callbacks.set(pendingKey, {
            callback: newer?.callback ?? pendingTask.callback,
            invalidation: (newer?.invalidation ?? 0) | pendingTask.invalidation,
            priority:
              newer &&
              PRIORITY_ORDER[newer.priority] < PRIORITY_ORDER[pendingTask.priority]
                ? newer.priority
                : pendingTask.priority,
            phase: newer?.phase ?? pendingTask.phase,
          });
        }
        break;
      }

      const [key, task] = [...activeCallbacks.entries()].sort(
        ([, left], [, right]) =>
          PHASE_ORDER[left.phase] - PHASE_ORDER[right.phase] ||
          PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]
      )[0]!;
      activeCallbacks.delete(key);
      this.activePhase = task.phase;
      try {
        task.callback(timestamp, task.invalidation);
      } catch (error) {
        errors.push(error);
      }
      completedTasks += 1;
    }
    this.activePhase = null;
    this.activeCallbacks = null;
    this.lastWorkDurationMs = this.port.now() - startedAt;
    this.scheduleFrame();
    errors.forEach((error) => this.reportError(error));
  }
}

export type CanvasFrameQueue = Pick<
  CanvasFrameScheduler,
  "request" | "cancel" | "now" | "subscribeResume" | "dispose"
>;

export class CanvasScopedFrameScheduler implements CanvasFrameQueue {
  private readonly parent: CanvasFrameScheduler;
  private readonly scope: string;
  private readonly pendingKeys = new Set<string>();
  private readonly subscriptions = new Set<() => void>();
  private disposed = false;

  constructor(parent: CanvasFrameScheduler, scope: string) {
    this.parent = parent;
    this.scope = scope;
  }

  request(
    key: string,
    invalidation: CanvasFrameInvalidation,
    callback: CanvasFrameCallback,
    options: CanvasFrameRequestOptions = {}
  ): void {
    if (this.disposed) return;
    const scopedKey = `${this.scope}:${key}`;
    this.pendingKeys.add(scopedKey);
    this.parent.request(
      scopedKey,
      invalidation,
      (timestamp, pendingInvalidation) => {
        this.pendingKeys.delete(scopedKey);
        callback(timestamp, pendingInvalidation);
      },
      options
    );
  }

  now(): number {
    return this.parent.now();
  }

  subscribeResume(listener: () => void): () => void {
    if (this.disposed) return () => undefined;
    const unsubscribe = this.parent.subscribeResume(() => listener());
    this.subscriptions.add(unsubscribe);
    return () => {
      unsubscribe();
      this.subscriptions.delete(unsubscribe);
    };
  }

  cancel(key: string): void {
    const scopedKey = `${this.scope}:${key}`;
    this.pendingKeys.delete(scopedKey);
    this.parent.cancel(scopedKey);
  }

  dispose(): void {
    this.disposed = true;
    this.pendingKeys.forEach((key) => this.parent.cancel(key));
    this.pendingKeys.clear();
    this.subscriptions.forEach((unsubscribe) => unsubscribe());
    this.subscriptions.clear();
  }
}

type RafScheduler = {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
};

export const createFrameSchedulerRafAdapter = (
  scheduler: CanvasFrameQueue,
  scope: string,
  invalidation: CanvasFrameInvalidation
): RafScheduler => {
  let nextHandle = 0;
  const keys = new Map<number, string>();
  return {
    requestAnimationFrame: (callback) => {
      const handle = ++nextHandle;
      const key = `${scope}:${handle}`;
      keys.set(handle, key);
      scheduler.request(key, invalidation, (timestamp) => {
        keys.delete(handle);
        callback(timestamp);
      });
      return handle;
    },
    cancelAnimationFrame: (handle) => {
      const key = keys.get(handle);
      if (!key) return;
      keys.delete(handle);
      scheduler.cancel(key);
    },
  };
};
