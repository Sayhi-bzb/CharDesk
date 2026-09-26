import { describe, expect, it, vi } from "vitest";
import type { CanvasViewportState } from "@/domains/canvas/public";
import {
  createCanvasPinchExecutor,
  createCanvasPinchHandler,
  createCanvasPinchRouteHandler,
  executeCanvasPinchDecision,
  resolveCanvasPinchDecision,
  type CanvasPinchStart,
} from "@/widgets/canvas-editor/hooks/interaction/gestures/pinchInteraction";

const pinchStart: CanvasPinchStart = {
  viewport: { offset: { x: 10, y: 20 }, zoom: 1 },
  anchor: { x: 100, y: 80 },
};

describe("canvas pinch interaction", () => {
  it("keeps the initial world anchor fixed while zooming", () => {
    expect(
      resolveCanvasPinchDecision({
        pinchStart,
        scale: 2,
        currentViewport: pinchStart.viewport,
        currentAnchor: pinchStart.anchor,
        zoomBounds: { min: 0.25, max: 4 },
      })
    ).toEqual({
      type: "viewport",
      viewport: { offset: { x: -80, y: -40 }, zoom: 2 },
    });
  });

  it("pans when the pinch center moves without changing scale", () => {
    expect(
      resolveCanvasPinchDecision({
        pinchStart,
        scale: 1,
        currentViewport: pinchStart.viewport,
        currentAnchor: { x: 130, y: 120 },
        zoomBounds: { min: 0.25, max: 4 },
      })
    ).toEqual({
      type: "viewport",
      viewport: { offset: { x: 40, y: 60 }, zoom: 1 },
    });
  });

  it("combines pinch-center movement and zoom without incremental drift", () => {
    expect(
      resolveCanvasPinchDecision({
        pinchStart,
        scale: 2,
        currentViewport: pinchStart.viewport,
        currentAnchor: { x: 130, y: 120 },
        zoomBounds: { min: 0.25, max: 4 },
      })
    ).toEqual({
      type: "viewport",
      viewport: { offset: { x: -50, y: 0 }, zoom: 2 },
    });
  });

  it("uses the clamped zoom when resolving the anchored offset", () => {
    expect(
      resolveCanvasPinchDecision({
        pinchStart: {
          viewport: { offset: { x: 0, y: 0 }, zoom: 2 },
          anchor: { x: 50, y: 40 },
        },
        scale: 3,
        currentViewport: { offset: { x: 0, y: 0 }, zoom: 2 },
        currentAnchor: { x: 50, y: 40 },
        zoomBounds: { min: 0.25, max: 4 },
      })
    ).toEqual({
      type: "viewport",
      viewport: { offset: { x: -50, y: -40 }, zoom: 4 },
    });
  });

  it("returns none for an unchanged or invalid pinch", () => {
    expect(
      resolveCanvasPinchDecision({
        pinchStart,
        scale: 1,
        currentViewport: pinchStart.viewport,
        currentAnchor: pinchStart.anchor,
        zoomBounds: { min: 0.25, max: 4 },
      })
    ).toEqual({ type: "none" });
    expect(
      resolveCanvasPinchDecision({
        pinchStart,
        scale: 0,
        currentViewport: pinchStart.viewport,
        currentAnchor: pinchStart.anchor,
        zoomBounds: { min: 0.25, max: 4 },
      })
    ).toEqual({ type: "none" });
  });

  it("executes a pinch with one atomic viewport update", () => {
    let viewport: CanvasViewportState = pinchStart.viewport;
    const setViewport = vi.fn(
      (updater: (current: CanvasViewportState) => CanvasViewportState) => {
        viewport = updater(viewport);
      }
    );

    executeCanvasPinchDecision(
      {
        type: "viewport",
        viewport: { offset: { x: -80, y: -40 }, zoom: 2 },
      },
      { setViewport }
    );

    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(viewport).toEqual({ offset: { x: -80, y: -40 }, zoom: 2 });
  });

  it("creates pinch executors and handlers around the viewport command", () => {
    let viewport: CanvasViewportState = pinchStart.viewport;
    const executor = createCanvasPinchExecutor({
      setViewport: (updater) => {
        viewport = updater(viewport);
      },
    });
    const handler = createCanvasPinchHandler({ executor });

    handler({
      pinchStart,
      scale: 2,
      currentViewport: viewport,
      currentAnchor: pinchStart.anchor,
      zoomBounds: { min: 0.25, max: 4 },
    });

    expect(viewport).toEqual({ offset: { x: -80, y: -40 }, zoom: 2 });
  });

  it("routes the current pinch center through local anchor resolution", () => {
    const handler = vi.fn();
    const preventDefault = vi.fn();
    const resolveAnchor = vi.fn(() => ({ x: 130, y: 120 }));
    const route = createCanvasPinchRouteHandler({ handler });

    route({
      pinchStart,
      scale: 2,
      currentViewport: pinchStart.viewport,
      origin: { x: 150, y: 160 },
      zoomBounds: { min: 0.25, max: 4 },
      preventDefault,
      resolveAnchor,
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(resolveAnchor).toHaveBeenCalledWith({ x: 150, y: 160 });
    expect(handler).toHaveBeenCalledWith({
      pinchStart,
      scale: 2,
      currentViewport: pinchStart.viewport,
      currentAnchor: { x: 130, y: 120 },
      zoomBounds: { min: 0.25, max: 4 },
    });
  });

  it("does not execute when the current pinch center cannot resolve", () => {
    const handler = vi.fn();
    const preventDefault = vi.fn();
    const route = createCanvasPinchRouteHandler({ handler });

    route({
      pinchStart,
      scale: 2,
      currentViewport: pinchStart.viewport,
      origin: { x: 30, y: 40 },
      zoomBounds: { min: 0.25, max: 4 },
      preventDefault,
      resolveAnchor: vi.fn(() => null),
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
  });
});
