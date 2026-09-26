import { describe, expect, it, vi } from "vitest";
import type { CanvasViewportState } from "@/domains/canvas/public";
import { createViewportInteractionController } from "@/widgets/canvas-editor/hooks/interaction/viewport/viewportInteractionController";
import type { Point } from "@/shared/types";

const createScheduler = () => {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    }),
    cancelAnimationFrame: vi.fn((id: number) => {
      callbacks.delete(id);
    }),
    flush: () => {
      const queued = Array.from(callbacks.entries());
      callbacks.clear();
      queued.forEach(([, callback]) => callback(0));
    },
  };
};

describe("viewport interaction controller", () => {
  it("coalesces offset deltas into one RAF update", () => {
    const scheduler = createScheduler();
    let offset: Point = { x: 10, y: 20 };
    const controller = createViewportInteractionController({
      setOffset: (updater) => {
        offset = updater(offset);
      },
      setViewport: () => {},
      zoomBounds: { min: 0.25, max: 4 },
      scheduler,
    });

    controller.queueOffsetDelta(2, -3);
    controller.queueOffsetDelta(5, 1);

    expect(scheduler.requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(offset).toEqual({ x: 10, y: 20 });

    scheduler.flush();

    expect(offset).toEqual({ x: 17, y: 18 });
  });

  it("preserves fractional trackpad movement while coalescing a frame", () => {
    const scheduler = createScheduler();
    let offset: Point = { x: 0, y: 0 };
    const controller = createViewportInteractionController({
      setOffset: (updater) => {
        offset = updater(offset);
      },
      setViewport: () => {},
      zoomBounds: { min: 0.25, max: 4 },
      scheduler,
    });

    controller.queueOffsetDelta(0.25, -0.5);
    controller.queueOffsetDelta(0.75, -0.25);
    controller.queueOffsetDelta(-0.125, 0.5);
    scheduler.flush();

    expect(offset).toEqual({ x: 0.875, y: -0.25 });
    expect(scheduler.requestAnimationFrame).toHaveBeenCalledOnce();
  });

  it("flushes queued offset immediately and cancels the pending RAF", () => {
    const scheduler = createScheduler();
    let offset: Point = { x: 0, y: 0 };
    const controller = createViewportInteractionController({
      setOffset: (updater) => {
        offset = updater(offset);
      },
      setViewport: () => {},
      zoomBounds: { min: 0.25, max: 4 },
      scheduler,
    });

    controller.queueOffsetDelta(4, 6);
    controller.flushOffset();
    scheduler.flush();

    expect(scheduler.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(offset).toEqual({ x: 4, y: 6 });
  });

  it("applies queued zoom samples in order with one atomic viewport update", () => {
    const scheduler = createScheduler();
    let viewport: CanvasViewportState = { offset: { x: 0, y: 0 }, zoom: 1 };
    const setViewport = vi.fn(
      (updater: (current: CanvasViewportState) => CanvasViewportState) => {
        viewport = updater(viewport);
      }
    );
    const controller = createViewportInteractionController({
      setOffset: () => {},
      setViewport,
      zoomBounds: { min: 0.25, max: 4 },
      scheduler,
    });

    controller.queueZoomDelta(2, 100, 100);
    controller.queueZoomDelta(0.5, 200, 100);
    scheduler.flush();

    expect(setViewport).toHaveBeenCalledTimes(1);
    expect(viewport).toEqual({ offset: { x: 50, y: 0 }, zoom: 1 });
  });

  it("ignores no-op and invalid zoom deltas", () => {
    const scheduler = createScheduler();
    const setViewport = vi.fn();
    const controller = createViewportInteractionController({
      setOffset: () => {},
      setViewport,
      zoomBounds: { min: 0.25, max: 4 },
      scheduler,
    });

    controller.queueZoomDelta(1, 0, 0);
    controller.queueZoomDelta(0, 0, 0);

    expect(scheduler.requestAnimationFrame).not.toHaveBeenCalled();
    expect(setViewport).not.toHaveBeenCalled();
  });

  it("drops pending camera input when canceled", () => {
    const scheduler = createScheduler();
    const setOffset = vi.fn();
    const setViewport = vi.fn();
    const controller = createViewportInteractionController({
      setOffset,
      setViewport,
      zoomBounds: { min: 0.25, max: 4 },
      scheduler,
    });

    controller.queueOffsetDelta(5, 6);
    controller.queueZoomDelta(1.2, 100, 100);
    controller.cancel();
    scheduler.flush();
    controller.flushOffset();
    controller.flushZoom();

    expect(setOffset).not.toHaveBeenCalled();
    expect(setViewport).not.toHaveBeenCalled();
  });
});
