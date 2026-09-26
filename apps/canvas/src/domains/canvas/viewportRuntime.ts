import { MAX_ZOOM, MIN_ZOOM } from "@/shared/lib/constants";
import type {
  CanvasViewportState,
  PendingCanvasCameraPlacement,
} from "./state/interfaces";

export type CanvasViewportPort = {
  getViewport: () => CanvasViewportState;
  getSnapshot?: () => CanvasViewportState;
  setViewport: (
    updater: (viewport: CanvasViewportState) => CanvasViewportState,
    options?: { transient?: boolean }
  ) => void;
  subscribe: (listener: () => void) => () => void;
};

const DEFAULT_VIEWPORT: CanvasViewportState = {
  offset: { x: 0, y: 0 },
  zoom: 1,
};

export const normalizeCanvasViewport = (
  viewport: CanvasViewportState | null | undefined
): CanvasViewportState => ({
  offset: {
    x: Number.isFinite(viewport?.offset.x) ? viewport!.offset.x : 0,
    y: Number.isFinite(viewport?.offset.y) ? viewport!.offset.y : 0,
  },
  zoom: Math.max(
    MIN_ZOOM,
    Math.min(MAX_ZOOM, Number.isFinite(viewport?.zoom) ? viewport!.zoom : 1)
  ),
});

const cloneViewport = (viewport: CanvasViewportState): CanvasViewportState => ({
  offset: { ...viewport.offset },
  zoom: viewport.zoom,
});

/**
 * The active-viewport command boundary. A mounted workspace binds its active
 * view; headless runtimes use the built-in single-view fallback.
 */
export class CanvasViewportRuntime {
  #fallback: CanvasViewportState;
  #port: CanvasViewportPort | null = null;
  #unsubscribePort: (() => void) | null = null;
  #pendingPlacement: PendingCanvasCameraPlacement | null = null;
  readonly #listeners = new Set<() => void>();
  readonly #placementListeners = new Set<() => void>();

  constructor(initial: CanvasViewportState = DEFAULT_VIEWPORT) {
    this.#fallback = normalizeCanvasViewport(initial);
  }

  getSnapshot = (): CanvasViewportState =>
    this.#port?.getSnapshot?.() ?? this.#port?.getViewport() ?? this.#fallback;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  getPendingPlacement = () => this.#pendingPlacement;

  subscribePlacement = (listener: () => void) => {
    this.#placementListeners.add(listener);
    return () => this.#placementListeners.delete(listener);
  };

  requestPlacement(placement: PendingCanvasCameraPlacement) {
    this.#pendingPlacement = placement;
    this.#placementListeners.forEach((listener) => listener());
  }

  consumePlacement = (sessionId: string) => {
    if (this.#pendingPlacement?.sessionId !== sessionId) return;
    this.#pendingPlacement = null;
    this.#placementListeners.forEach((listener) => listener());
  };

  bind(port: CanvasViewportPort) {
    this.#unsubscribePort?.();
    this.#port = port;
    this.#unsubscribePort = port.subscribe(() => this.#emit());
    this.#emit();
    return () => {
      if (this.#port !== port) return;
      this.#fallback = cloneViewport(port.getSnapshot?.() ?? port.getViewport());
      this.#unsubscribePort?.();
      this.#unsubscribePort = null;
      this.#port = null;
      this.#emit();
    };
  }

  setOffset = (updater: (offset: CanvasViewportState["offset"]) => CanvasViewportState["offset"]) =>
    this.setViewport((viewport) => ({ ...viewport, offset: updater(viewport.offset) }));

  setZoom = (updater: (zoom: number) => number) =>
    this.setViewport((viewport) => ({ ...viewport, zoom: updater(viewport.zoom) }));

  setViewport = (
    updater: (viewport: CanvasViewportState) => CanvasViewportState,
    options?: { transient?: boolean }
  ) => {
    if (this.#port) {
      this.#port.setViewport(
        (viewport) => normalizeCanvasViewport(updater(viewport)),
        options
      );
      return;
    }
    this.#fallback = normalizeCanvasViewport(updater(this.#fallback));
    this.#emit();
  };

  /** Updates the headless fallback without competing with a mounted view. */
  resetFallback(viewport: CanvasViewportState) {
    this.#fallback = normalizeCanvasViewport(viewport);
    if (this.#pendingPlacement) {
      this.#pendingPlacement = null;
      this.#placementListeners.forEach((listener) => listener());
    }
    if (!this.#port) this.#emit();
  }

  dispose() {
    this.#unsubscribePort?.();
    this.#unsubscribePort = null;
    this.#port = null;
    this.#listeners.clear();
    this.#placementListeners.clear();
  }

  #emit() {
    this.#listeners.forEach((listener) => listener());
  }
}
