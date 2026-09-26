import type { CanvasViewportState } from "@/domains/canvas/public";
import { MAX_ZOOM, MIN_ZOOM } from "@/shared/lib/constants";
import type { NodeBounds, Point } from "@/shared/types";
import { resolveZoomAnchoredOffset } from "../hooks/interaction/core/coordinates";
import { createViewportInteractionController } from "../hooks/interaction/viewport/viewportInteractionController";
import {
  CANVAS_FRAME_INVALIDATION,
  createFrameSchedulerRafAdapter,
  type CanvasFrameScheduler,
} from "./FrameScheduler";

export type CanvasCameraPort = {
  getViewport: () => CanvasViewportState;
  setViewport: (
    updater: (viewport: CanvasViewportState) => CanvasViewportState,
    options?: { transient?: boolean }
  ) => void;
};

type CameraAnimationOptions = {
  duration?: number;
  easing?: (progress: number) => number;
};

const DEFAULT_EASING = (progress: number) =>
  progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;

const clampZoom = (zoom: number) =>
  Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

const interpolateViewport = (
  start: CanvasViewportState,
  end: CanvasViewportState,
  progress: number
): CanvasViewportState => ({
  offset: {
    x: start.offset.x + (end.offset.x - start.offset.x) * progress,
    y: start.offset.y + (end.offset.y - start.offset.y) * progress,
  },
  zoom: start.zoom + (end.zoom - start.zoom) * progress,
});

/** Owns all imperative camera queues, constraints, and animations. */
export class CanvasCameraManager {
  private readonly port: CanvasCameraPort;
  private readonly frameScheduler: CanvasFrameScheduler;
  private readonly onViewportActivity: () => void;
  private readonly viewportInteraction: ReturnType<
    typeof createViewportInteractionController
  >;
  private animationGeneration = 0;
  private animationTarget: CanvasViewportState | null = null;
  private disposed = false;

  constructor(
    frameScheduler: CanvasFrameScheduler,
    port: CanvasCameraPort,
    onViewportActivity: () => void = () => undefined
  ) {
    this.port = port;
    this.frameScheduler = frameScheduler;
    this.onViewportActivity = onViewportActivity;
    this.viewportInteraction = createViewportInteractionController({
      setOffset: (updater) => {
        this.onViewportActivity();
        this.port.setViewport((viewport) => ({
          ...viewport,
          offset: updater(viewport.offset),
        }), { transient: true });
      },
      setViewport: (updater) => {
        this.onViewportActivity();
        port.setViewport(updater, { transient: true });
      },
      zoomBounds: { min: MIN_ZOOM, max: MAX_ZOOM },
      scheduler: createFrameSchedulerRafAdapter(
        frameScheduler,
        "camera-interaction",
        CANVAS_FRAME_INVALIDATION.presentation
      ),
    });
  }

  getViewport(): CanvasViewportState {
    return this.port.getViewport();
  }

  getTargetViewport(): CanvasViewportState {
    const viewport = this.animationTarget ?? this.getViewport();
    return { offset: { ...viewport.offset }, zoom: viewport.zoom };
  }

  setViewport(viewport: CanvasViewportState): void {
    this.cancelPending();
    this.applyViewport(viewport);
  }

  setTransientViewport(viewport: CanvasViewportState): void {
    this.cancelPending();
    this.applyViewport(viewport, true);
  }

  panBy(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.cancelPending();
    this.onViewportActivity();
    this.port.setViewport((viewport) => ({
      ...viewport,
      offset: { x: viewport.offset.x + dx, y: viewport.offset.y + dy },
    }));
  }

  queuePan(dx: number, dy: number): void {
    this.cancelAnimation();
    this.viewportInteraction.queueOffsetDelta(dx, dy);
  }

  flushPan(): void {
    this.viewportInteraction.flushOffset();
  }

  zoomAt(nextZoom: number, anchor: Point): void {
    if (!Number.isFinite(nextZoom)) return;
    this.cancelPending();
    this.onViewportActivity();
    this.port.setViewport((viewport) => {
      const zoom = clampZoom(nextZoom);
      if (zoom === viewport.zoom) return viewport;
      return {
        offset: resolveZoomAnchoredOffset({
          anchor,
          previousOffset: viewport.offset,
          currentZoom: viewport.zoom,
          nextZoom: zoom,
        }),
        zoom,
      };
    });
  }

  queueZoomAt(deltaZoom: number, anchor: Point): void {
    this.cancelAnimation();
    this.viewportInteraction.queueZoomDelta(deltaZoom, anchor.x, anchor.y);
  }

  flushZoom(): void {
    this.viewportInteraction.flushZoom();
  }

  animateZoomBy(
    deltaZoom: number,
    anchor: Point,
    options?: CameraAnimationOptions
  ): void {
    const current = this.getViewport();
    const zoom = clampZoom(current.zoom * deltaZoom);
    this.animateTo(
      {
        offset: resolveZoomAnchoredOffset({
          anchor,
          previousOffset: current.offset,
          currentZoom: current.zoom,
          nextZoom: zoom,
        }),
        zoom,
      },
      options
    );
  }

  animateZoomTo(
    nextZoom: number,
    anchor: Point,
    options?: CameraAnimationOptions
  ): void {
    const current = this.getViewport();
    const zoom = clampZoom(nextZoom);
    this.animateTo(
      {
        offset: resolveZoomAnchoredOffset({
          anchor,
          previousOffset: current.offset,
          currentZoom: current.zoom,
          nextZoom: zoom,
        }),
        zoom,
      },
      options
    );
  }

  animateTo(
    viewport: CanvasViewportState,
    options: CameraAnimationOptions = {}
  ): void {
    const target = {
      offset: { ...viewport.offset },
      zoom: clampZoom(viewport.zoom),
    };
    const duration = Math.max(0, options.duration ?? 280);
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    this.cancelPending();
    if (duration === 0 || reducedMotion) {
      this.applyViewport(target);
      return;
    }

    this.animationTarget = target;
    const generation = this.animationGeneration;
    const start = this.getViewport();
    const easing = options.easing ?? DEFAULT_EASING;
    const startedAt = this.frameScheduler.now();
    const tick = (timestamp: number) => {
      if (this.disposed || generation !== this.animationGeneration) return;
      const progress = Math.min(
        1,
        Math.max(0, (timestamp - startedAt) / duration)
      );
      this.applyViewport(
        interpolateViewport(start, target, easing(progress)),
        progress < 1
      );
      if (progress < 1) {
        this.frameScheduler.request(
          "camera-animation",
          CANVAS_FRAME_INVALIDATION.presentation,
          tick
        );
      } else {
        this.animationTarget = null;
      }
    };
    this.frameScheduler.request(
      "camera-animation",
      CANVAS_FRAME_INVALIDATION.presentation,
      tick
    );
  }

  fitBounds(
    bounds: NodeBounds,
    viewportSize: { width: number; height: number },
    options: {
      padding?: number;
      animated?: boolean;
      duration?: number;
      insets?: { top: number; right: number; bottom: number; left: number };
      alignment?: "center" | "start";
      maxZoom?: number;
    } = {}
  ): void {
    const padding = Math.max(0, options.padding ?? 48);
    const insets = options.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const availableWidth = Math.max(
      1,
      viewportSize.width - insets.left - insets.right - padding * 2
    );
    const availableHeight = Math.max(
      1,
      viewportSize.height - insets.top - insets.bottom - padding * 2
    );
    const zoom = clampZoom(
      Math.min(
        options.maxZoom ?? MAX_ZOOM,
        availableWidth / Math.max(1, bounds.width),
        availableHeight / Math.max(1, bounds.height)
      )
    );
    const alignStart = options.alignment === "start";
    const target = {
      zoom,
      offset: {
        x: alignStart
          ? insets.left + padding - bounds.x * zoom
          : insets.left +
            (viewportSize.width - insets.left - insets.right - bounds.width * zoom) / 2 -
            bounds.x * zoom,
        y: alignStart
          ? insets.top + padding - bounds.y * zoom
          : insets.top +
            (viewportSize.height - insets.top - insets.bottom - bounds.height * zoom) / 2 -
            bounds.y * zoom,
      },
    };
    if (options.animated) {
      this.animateTo(target, { duration: options.duration });
    } else {
      this.setViewport(target);
    }
  }

  cancelAnimation(): void {
    this.animationGeneration += 1;
    this.animationTarget = null;
    this.frameScheduler.cancel("camera-animation");
  }

  cancelPending(): void {
    this.cancelAnimation();
    this.viewportInteraction.cancel();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelPending();
  }

  private applyViewport(
    viewport: CanvasViewportState,
    transient = false
  ): void {
    if (this.disposed) return;
    this.onViewportActivity();
    this.port.setViewport(
      () => ({
        offset: { ...viewport.offset },
        zoom: clampZoom(viewport.zoom),
      }),
      { transient }
    );
  }
}
