import type { Point } from '@chardesk/cell-plane/types';
import type { CanvasInteractionState } from './canvasToolRuntime.js';

export const EDGE_SCROLL_DELAY_MS = 250;
export const canEdgeScroll = (state: CanvasInteractionState) =>
  state.type === 'selecting' || state.type === 'movingRange';
export type EdgeScrollBounds = { left: number; top: number; width: number; height: number };
export type EdgeScrollSession = {
  clientPoint: Point;
  getBounds: () => EdgeScrollBounds | null;
  isEnabled: () => boolean;
  onCameraMove: () => void;
};
export type EdgeScrollScheduler = {
  request: (tick: (timestamp: number) => void) => void;
  cancel: () => void;
};
export type EdgeScrollOptions = {
  distance: Point;
  maxSpeed: Point;
  delayMs: number;
  easeMs: number;
};
const defaults: EdgeScrollOptions = {
  distance: { x: 56, y: 56 },
  maxSpeed: { x: 720, y: 720 },
  delayMs: EDGE_SCROLL_DELAY_MS,
  easeMs: 300,
};
const axisProximity = (position: number, start: number, length: number, distance: number) => {
  const band = Math.min(distance, length / 2),
    local = position - start;
  if (local < band) return -Math.min(1, (band - local) / band);
  if (local > length - band) return Math.min(1, (local - (length - band)) / band);
  return 0;
};

/** Host units in, viewport displacement out. Hosts own scheduling and camera delivery. */
export class CanvasEdgeScroll {
  #session: EdgeScrollSession | null = null;
  #edgeEnteredAt: number | null = null;
  #previousFrameAt: number | null = null;
  #scheduled = false;
  #disposed = false;
  #generation = 0;
  readonly #options: EdgeScrollOptions;
  readonly #scheduler: EdgeScrollScheduler;
  readonly #pan: (x: number, y: number) => void;
  constructor(
    scheduler: EdgeScrollScheduler,
    pan: (x: number, y: number) => void,
    options: Partial<EdgeScrollOptions> = {}
  ) {
    this.#scheduler = scheduler;
    this.#pan = pan;
    this.#options = { ...defaults, ...options };
    const { distance, maxSpeed, delayMs, easeMs } = this.#options;
    if (
      ![distance.x, distance.y, maxSpeed.x, maxSpeed.y, easeMs].every(
        (n) => Number.isFinite(n) && n > 0
      ) ||
      !Number.isFinite(delayMs) ||
      delayMs < 0
    )
      throw new RangeError('Invalid edge scroll settings.');
  }
  update(session: EdgeScrollSession) {
    if (this.#disposed) return false;
    this.#session = session;
    if (!session.isEnabled() || !this.#proximity(session)) {
      this.#stopLoop();
      return false;
    }
    this.#schedule();
    return true;
  }
  stop() {
    this.#session = null;
    this.#stopLoop();
  }
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.stop();
  }
  #schedule() {
    if (this.#scheduled || this.#disposed || !this.#session) return;
    this.#scheduled = true;
    const generation = this.#generation;
    this.#scheduler.request((timestamp) => {
      if (this.#disposed || generation !== this.#generation) return;
      this.#scheduled = false;
      this.#tick(timestamp, generation);
    });
  }
  #tick(timestamp: number, generation: number) {
    const session = this.#session;
    if (!session || !session.isEnabled() || !Number.isFinite(timestamp)) {
      this.stop();
      return;
    }
    const proximity = this.#proximity(session);
    if (!proximity) {
      this.#stopLoop();
      return;
    }
    this.#edgeEnteredAt ??= timestamp;
    const elapsedAtEdge = timestamp - this.#edgeEnteredAt;
    const frameElapsed = Math.min(
      32,
      Math.max(0, timestamp - (this.#previousFrameAt ?? timestamp))
    );
    this.#previousFrameAt = timestamp;
    const { delayMs, easeMs, maxSpeed } = this.#options;
    if (elapsedAtEdge >= delayMs && frameElapsed > 0) {
      const eased = Math.min(1, (elapsedAtEdge - delayMs) / easeMs);
      if (eased > 0) {
        this.#pan(
          (proximity.x * maxSpeed.x * eased * frameElapsed) / 1000,
          (proximity.y * maxSpeed.y * eased * frameElapsed) / 1000
        );
        if (generation === this.#generation && this.#session) session.onCameraMove();
      }
    }
    if (generation === this.#generation) this.#schedule();
  }
  #proximity(session: EdgeScrollSession): Point | null {
    const box = session.getBounds(),
      point = session.clientPoint;
    if (
      !box ||
      ![box.left, box.top, box.width, box.height, point.x, point.y].every(Number.isFinite) ||
      box.width <= 0 ||
      box.height <= 0
    )
      return null;
    const distance = this.#options.distance;
    const proximity = {
      x: axisProximity(point.x, box.left, box.width, distance.x),
      y: axisProximity(point.y, box.top, box.height, distance.y),
    };
    return proximity.x === 0 && proximity.y === 0 ? null : proximity;
  }
  #stopLoop() {
    this.#generation++;
    this.#scheduler.cancel();
    this.#scheduled = false;
    this.#edgeEnteredAt = null;
    this.#previousFrameAt = null;
  }
}
