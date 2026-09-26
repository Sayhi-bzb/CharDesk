import type { Point } from "@/shared/types";
import type { CanvasViewportState } from "@/domains/canvas/public";
import {
  resolveClampedZoom,
  resolveZoomAnchoredOffset,
} from "../core/coordinates";

type RafScheduler = {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
};

type OffsetSetter = (updater: (previous: Point) => Point) => void;
type ViewportSetter = (
  updater: (currentViewport: CanvasViewportState) => CanvasViewportState
) => void;

const getDefaultRafScheduler = (): RafScheduler => ({
  requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
  cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle),
});

type ViewportInteractionController = {
  queueOffsetDelta: (dx: number, dy: number) => void;
  flushOffset: () => void;
  queueZoomDelta: (deltaZoom: number, mouseX: number, mouseY: number) => void;
  flushZoom: () => void;
  cancel: () => void;
};

export const createViewportInteractionController = ({
  setOffset,
  setViewport,
  zoomBounds,
  scheduler = getDefaultRafScheduler(),
}: {
  setOffset: OffsetSetter;
  setViewport: ViewportSetter;
  zoomBounds: { min: number; max: number };
  scheduler?: RafScheduler;
}): ViewportInteractionController => {
  let queuedOffset: Point = { x: 0, y: 0 };
  let queuedOffsetRaf: number | null = null;
  let queuedZoom: Array<{
    deltaZoom: number;
    anchor: Point;
  }> = [];
  let queuedZoomRaf: number | null = null;

  const flushOffset = () => {
    if (queuedOffsetRaf !== null) {
      scheduler.cancelAnimationFrame(queuedOffsetRaf);
      queuedOffsetRaf = null;
    }
    const { x, y } = queuedOffset;
    if (x === 0 && y === 0) return;
    queuedOffset = { x: 0, y: 0 };
    setOffset((previous) => ({ x: previous.x + x, y: previous.y + y }));
  };

  const queueOffsetDelta = (dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return;
    queuedOffset = {
      x: queuedOffset.x + dx,
      y: queuedOffset.y + dy,
    };
    if (queuedOffsetRaf !== null) return;
    queuedOffsetRaf = scheduler.requestAnimationFrame(() => {
      queuedOffsetRaf = null;
      const { x, y } = queuedOffset;
      if (x === 0 && y === 0) return;
      queuedOffset = { x: 0, y: 0 };
      setOffset((previous) => ({ x: previous.x + x, y: previous.y + y }));
    });
  };

  const flushZoom = () => {
    if (queuedZoomRaf !== null) {
      scheduler.cancelAnimationFrame(queuedZoomRaf);
      queuedZoomRaf = null;
    }
    const samples = queuedZoom;
    if (samples.length === 0) return;
    queuedZoom = [];

    setViewport((currentViewport) =>
      samples.reduce<CanvasViewportState>((viewport, sample) => {
        const nextZoom = resolveClampedZoom(viewport.zoom, sample.deltaZoom, {
          min: zoomBounds.min,
          max: zoomBounds.max,
        });
        if (nextZoom === viewport.zoom) return viewport;
        return {
          offset: resolveZoomAnchoredOffset({
            anchor: sample.anchor,
            previousOffset: viewport.offset,
            currentZoom: viewport.zoom,
            nextZoom,
          }),
          zoom: nextZoom,
        };
      }, currentViewport)
    );
  };

  const queueZoomDelta = (
    deltaZoom: number,
    mouseX: number,
    mouseY: number
  ) => {
    if (deltaZoom <= 0 || deltaZoom === 1) return;
    queuedZoom.push({ deltaZoom, anchor: { x: mouseX, y: mouseY } });
    if (queuedZoomRaf !== null) return;
    queuedZoomRaf = scheduler.requestAnimationFrame(() => {
      queuedZoomRaf = null;
      flushZoom();
    });
  };

  const cancel = () => {
    if (queuedOffsetRaf !== null) {
      scheduler.cancelAnimationFrame(queuedOffsetRaf);
      queuedOffsetRaf = null;
    }
    if (queuedZoomRaf !== null) {
      scheduler.cancelAnimationFrame(queuedZoomRaf);
      queuedZoomRaf = null;
    }
    queuedOffset = { x: 0, y: 0 };
    queuedZoom = [];
  };

  return {
    queueOffsetDelta,
    flushOffset,
    queueZoomDelta,
    flushZoom,
    cancel,
  };
};
