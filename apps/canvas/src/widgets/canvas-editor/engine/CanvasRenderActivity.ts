export type CanvasRenderActivityMode =
  | "settled"
  | "viewport-interaction"
  | "content-interaction";

type ActivityListener = (
  mode: CanvasRenderActivityMode,
  previous: CanvasRenderActivityMode
) => void;

const VIEWPORT_SETTLE_MS = 120;
const CONTENT_SETTLE_MS = 80;

/** Coordinates short-lived interaction quality without coupling input devices to rendering. */
export class CanvasRenderActivity {
  readonly #listeners = new Set<ActivityListener>();
  #viewportTimer: ReturnType<typeof setTimeout> | null = null;
  #contentTimer: ReturnType<typeof setTimeout> | null = null;
  #viewportDeadline = 0;
  #contentDeadline = 0;
  #viewportActive = false;
  #contentActive = false;
  #mode: CanvasRenderActivityMode = "settled";
  #disposed = false;

  getMode(): CanvasRenderActivityMode {
    return this.#mode;
  }

  markViewportActivity(): void {
    if (this.#disposed) return;
    this.#viewportActive = true;
    this.#extendDeadline("viewport");
    this.#publish();
  }

  markContentActivity(): void {
    if (this.#disposed) return;
    this.#contentActive = true;
    this.#extendDeadline("content");
    this.#publish();
  }

  subscribe(listener: ActivityListener): () => void {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#viewportTimer !== null) clearTimeout(this.#viewportTimer);
    if (this.#contentTimer !== null) clearTimeout(this.#contentTimer);
    this.#viewportTimer = null;
    this.#contentTimer = null;
    this.#viewportDeadline = 0;
    this.#contentDeadline = 0;
    this.#listeners.clear();
  }

  #extendDeadline(kind: "viewport" | "content"): void {
    const duration = kind === "viewport" ? VIEWPORT_SETTLE_MS : CONTENT_SETTLE_MS;
    const deadline = Date.now() + duration;
    if (kind === "viewport") this.#viewportDeadline = deadline;
    else this.#contentDeadline = deadline;

    const timer = kind === "viewport" ? this.#viewportTimer : this.#contentTimer;
    if (timer !== null) return;
    this.#scheduleSettle(kind, duration);
  }

  #scheduleSettle(kind: "viewport" | "content", delay: number): void {
    const timer = setTimeout(() => {
      const deadline = kind === "viewport"
        ? this.#viewportDeadline
        : this.#contentDeadline;
      const remaining = deadline - Date.now();
      if (remaining > 0) {
        this.#scheduleSettle(kind, remaining);
        return;
      }

      if (kind === "viewport") {
        this.#viewportTimer = null;
        this.#viewportActive = false;
      } else {
        this.#contentTimer = null;
        this.#contentActive = false;
      }
      this.#publish();
    }, delay);
    if (kind === "viewport") this.#viewportTimer = timer;
    else this.#contentTimer = timer;
  }

  #publish(): void {
    const next = this.#viewportActive
      ? "viewport-interaction"
      : this.#contentActive
        ? "content-interaction"
        : "settled";
    if (next === this.#mode) return;
    const previous = this.#mode;
    this.#mode = next;
    this.#listeners.forEach((listener) => listener(next, previous));
  }
}
