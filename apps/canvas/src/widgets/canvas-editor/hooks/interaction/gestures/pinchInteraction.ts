import type { CanvasViewportState } from "@/domains/canvas/public";
import type { Point } from "@/shared/types";

export type CanvasPinchStart = {
  viewport: CanvasViewportState;
  anchor: Point;
};

type CanvasPinchDecision =
  | {
      type: "viewport";
      viewport: CanvasViewportState;
    }
  | { type: "none" };

const pointsEqual = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

export const resolveCanvasPinchDecision = ({
  pinchStart,
  scale,
  currentViewport,
  currentAnchor,
  zoomBounds,
}: {
  pinchStart: CanvasPinchStart;
  scale: number;
  currentViewport: CanvasViewportState;
  currentAnchor: Point;
  zoomBounds: { min: number; max: number };
}): CanvasPinchDecision => {
  if (pinchStart.viewport.zoom <= 0 || !Number.isFinite(scale) || scale <= 0) {
    return { type: "none" };
  }

  const nextZoom = Math.max(
    zoomBounds.min,
    Math.min(zoomBounds.max, pinchStart.viewport.zoom * scale)
  );
  const worldAnchor = {
    x:
      (pinchStart.anchor.x - pinchStart.viewport.offset.x) /
      pinchStart.viewport.zoom,
    y:
      (pinchStart.anchor.y - pinchStart.viewport.offset.y) /
      pinchStart.viewport.zoom,
  };
  const nextViewport = {
    offset: {
      x: currentAnchor.x - worldAnchor.x * nextZoom,
      y: currentAnchor.y - worldAnchor.y * nextZoom,
    },
    zoom: nextZoom,
  };

  return nextViewport.zoom === currentViewport.zoom &&
    pointsEqual(nextViewport.offset, currentViewport.offset)
    ? { type: "none" }
    : { type: "viewport", viewport: nextViewport };
};

type CanvasPinchExecutor = {
  setViewport: (
    updater: (currentViewport: CanvasViewportState) => CanvasViewportState
  ) => void;
};

export const createCanvasPinchExecutor = ({
  setViewport,
}: CanvasPinchExecutor): CanvasPinchExecutor => ({ setViewport });

export const executeCanvasPinchDecision = (
  decision: CanvasPinchDecision,
  executor: CanvasPinchExecutor
): void => {
  if (decision.type === "none") return;
  executor.setViewport(() => decision.viewport);
};

type CanvasPinchHandler = (input: {
  pinchStart: CanvasPinchStart;
  scale: number;
  currentViewport: CanvasViewportState;
  currentAnchor: Point;
  zoomBounds: { min: number; max: number };
}) => void;

export const createCanvasPinchHandler = ({
  executor,
}: {
  executor: CanvasPinchExecutor;
}): CanvasPinchHandler => (input) =>
  executeCanvasPinchDecision(resolveCanvasPinchDecision(input), executor);

export type CanvasPinchRouteHandler = (input: {
  pinchStart: CanvasPinchStart;
  scale: number;
  currentViewport: CanvasViewportState;
  origin: Point;
  zoomBounds: { min: number; max: number };
  preventDefault: () => void;
  resolveAnchor: (origin: Point) => Point | null;
}) => void;

export const createCanvasPinchRouteHandler = ({
  handler,
}: {
  handler: CanvasPinchHandler;
}): CanvasPinchRouteHandler =>
  ({
    pinchStart,
    scale,
    currentViewport,
    origin,
    zoomBounds,
    preventDefault,
    resolveAnchor,
  }) => {
    preventDefault();
    const currentAnchor = resolveAnchor(origin);
    if (!currentAnchor) return;

    handler({
      pinchStart,
      scale,
      currentViewport,
      currentAnchor,
      zoomBounds,
    });
  };
