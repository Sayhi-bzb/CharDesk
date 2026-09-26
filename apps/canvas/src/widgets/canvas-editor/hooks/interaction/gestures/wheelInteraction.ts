import type { Point } from "@/shared/types";

type CanvasWheelDecision =
  | {
      type: "zoom";
      deltaZoom: number;
      anchor: Point;
    }
  | {
      type: "pan";
      delta: Point;
    }
  | { type: "none" };

export const getCanvasWheelOrigin = (
  event: Pick<WheelEvent, "clientX" | "clientY">
): Point => ({ x: event.clientX, y: event.clientY });

export const resolveCanvasWheelDecision = ({
  isCtrlOrMetaPressed,
  deltaX,
  deltaY,
  shiftKey,
  anchor,
  zoomWeight = 0.002,
}: {
  isCtrlOrMetaPressed: boolean;
  deltaX: number;
  deltaY: number;
  shiftKey: boolean;
  anchor: Point;
  zoomWeight?: number;
}): CanvasWheelDecision => {
  if (isCtrlOrMetaPressed) {
    return {
      type: "zoom",
      deltaZoom: 1 - deltaY * zoomWeight,
      anchor,
    };
  }

  const effectiveDeltaX =
    shiftKey && deltaX === 0 && deltaY !== 0 ? deltaY : deltaX;
  const effectiveDeltaY =
    shiftKey && deltaX === 0 && deltaY !== 0 ? 0 : deltaY;

  return {
    type: "pan",
    delta: {
      x: effectiveDeltaX === 0 ? 0 : -effectiveDeltaX,
      y: effectiveDeltaY === 0 ? 0 : -effectiveDeltaY,
    },
  };
};

export type CanvasWheelExecutor = {
  preventDefault: () => void;
  flushOffset: () => void;
  queueZoomDelta: (deltaZoom: number, mouseX: number, mouseY: number) => void;
  queueOffsetDelta: (dx: number, dy: number) => void;
};

export const createCanvasWheelExecutor = ({
  preventDefault,
  flushOffset,
  queueZoomDelta,
  queueOffsetDelta,
}: CanvasWheelExecutor): CanvasWheelExecutor => ({
  preventDefault,
  flushOffset,
  queueZoomDelta,
  queueOffsetDelta,
});

export const executeCanvasWheelDecision = (
  decision: CanvasWheelDecision,
  executor: CanvasWheelExecutor
): void => {
  switch (decision.type) {
    case "zoom":
      executor.preventDefault();
      executor.flushOffset();
      executor.queueZoomDelta(
        decision.deltaZoom,
        decision.anchor.x,
        decision.anchor.y
      );
      break;
    case "pan":
      executor.preventDefault();
      executor.queueOffsetDelta(decision.delta.x, decision.delta.y);
      break;
    case "none":
      break;
  }
};

type CanvasWheelHandler = ({
  isCtrlOrMetaPressed,
  deltaX,
  deltaY,
  shiftKey,
  anchor,
  preventDefault,
}: {
  isCtrlOrMetaPressed: boolean;
  deltaX: number;
  deltaY: number;
  shiftKey: boolean;
  anchor: Point;
  preventDefault: () => void;
}) => void;

export const createCanvasWheelHandler = ({
  executor,
}: {
  executor: CanvasWheelExecutor;
}): CanvasWheelHandler => ({
  isCtrlOrMetaPressed,
  deltaX,
  deltaY,
  shiftKey,
  anchor,
  preventDefault,
}) =>
  executeCanvasWheelDecision(
    resolveCanvasWheelDecision({
      isCtrlOrMetaPressed,
      deltaX,
      deltaY,
      shiftKey,
      anchor,
    }),
    {
      ...executor,
      preventDefault,
    }
  );
export type CanvasWheelRouteHandler = ({
  isCtrlOrMetaPressed,
  gestureDeltaX,
  gestureDeltaY,
  shiftKey,
  origin,
  preventDefault,
  resolveAnchor,
}: {
  isCtrlOrMetaPressed: boolean;
  gestureDeltaX: number;
  gestureDeltaY: number;
  shiftKey: boolean;
  origin: Point;
  preventDefault: () => void;
  resolveAnchor: (origin: Point) => Point | null;
}) => void;

export const createCanvasWheelRouteHandler = ({
  handler,
}: {
  handler: CanvasWheelHandler;
}): CanvasWheelRouteHandler =>
  ({
    isCtrlOrMetaPressed,
    gestureDeltaX,
    gestureDeltaY,
    shiftKey,
    origin,
    preventDefault,
    resolveAnchor,
  }) => {
    const anchor = resolveAnchor(origin);
    if (!anchor) return;

    handler({
      isCtrlOrMetaPressed,
      deltaX: gestureDeltaX,
      deltaY: gestureDeltaY,
      shiftKey,
      anchor,
      preventDefault,
    });
  };
