import { describe, expect, it, vi } from "vitest";
import type { CanvasViewportState } from "@/domains/canvas/public";
import { CanvasCameraManager } from "./CanvasCameraManager";
import {
  CANVAS_FRAME_INVALIDATION,
  CanvasFrameScheduler,
} from "./FrameScheduler";

const createHarness = (
  initial: CanvasViewportState = { offset: { x: 0, y: 0 }, zoom: 1 },
  onViewportActivity = vi.fn()
) => {
  let frame: FrameRequestCallback | null = null;
  let viewport = initial;
  const viewportWrites: Array<{ transient: boolean }> = [];
  const viewportListeners = new Set<() => void>();
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  const scheduler = new CanvasFrameScheduler({
    requestAnimationFrame,
    cancelAnimationFrame: vi.fn(() => {
      frame = null;
    }),
    now: () => 0,
  });
  const camera = new CanvasCameraManager(
    scheduler,
    {
      getViewport: () => viewport,
      setViewport: (updater, options) => {
        viewport = updater(viewport);
        viewportWrites.push({ transient: options?.transient ?? false });
        viewportListeners.forEach((listener) => listener());
      },
    },
    onViewportActivity
  );
  const run = (timestamp: number) => {
    const callback = frame;
    frame = null;
    callback?.(timestamp);
  };
  return {
    camera,
    getViewport: () => viewport,
    onViewportActivity,
    requestAnimationFrame,
    run,
    scheduler,
    subscribeViewport: (listener: () => void) => {
      viewportListeners.add(listener);
      return () => viewportListeners.delete(listener);
    },
    viewportWrites,
  };
};

describe("CanvasCameraManager", () => {
  it("coalesces queued anchored zoom through the shared frame scheduler", () => {
    const { camera, getViewport, run, viewportWrites } = createHarness();

    camera.queueZoomAt(1.25, { x: 100, y: 80 });
    camera.queueZoomAt(1.2, { x: 100, y: 80 });
    expect(getViewport()).toEqual({ offset: { x: 0, y: 0 }, zoom: 1 });

    run(16);
    expect(getViewport()).toEqual({
      offset: { x: -50, y: -40 },
      zoom: 1.5,
    });
    expect(viewportWrites).toEqual([{ transient: true }]);
  });

  it("renders a queued pan from its updated viewport in the same frame", () => {
    const {
      camera,
      getViewport,
      requestAnimationFrame,
      run,
      scheduler,
      subscribeViewport,
    } = createHarness();
    const renderedViewports: CanvasViewportState[] = [];
    subscribeViewport(() => {
      scheduler.request(
        "canvas-renderer",
        CANVAS_FRAME_INVALIDATION.background,
        () => renderedViewports.push(getViewport()),
        { phase: "render" }
      );
    });

    camera.queuePan(5, -3);
    camera.queuePan(4, 1);
    run(16);

    expect(renderedViewports).toEqual([
      { offset: { x: 9, y: -2 }, zoom: 1 },
    ]);
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
  });

  it("cancels an animation when a direct gesture changes the camera", () => {
    const { camera, getViewport, run } = createHarness();
    camera.animateTo(
      { offset: { x: 200, y: 100 }, zoom: 2 },
      { duration: 100 }
    );

    run(0);
    camera.panBy(10, 20);
    run(100);

    expect(getViewport()).toEqual({ offset: { x: 10, y: 20 }, zoom: 1 });
    expect(camera.getTargetViewport()).toEqual(getViewport());
  });

  it("finishes animations exactly at the requested viewport", () => {
    const { camera, getViewport, run, viewportWrites } = createHarness();
    const target = { offset: { x: 120, y: -60 }, zoom: 2 };
    camera.animateTo(target, { duration: 100, easing: (progress) => progress });

    run(50);
    expect(getViewport()).toEqual({ offset: { x: 60, y: -30 }, zoom: 1.5 });
    run(100);

    expect(getViewport()).toEqual(target);
    expect(camera.getTargetViewport()).toEqual(target);
    expect(viewportWrites).toEqual([
      { transient: true },
      { transient: false },
    ]);
  });

  it("fits world bounds into the padded viewport", () => {
    const { camera, getViewport } = createHarness();
    camera.fitBounds(
      { x: 100, y: 50, width: 400, height: 200 },
      { width: 1000, height: 700 },
      { padding: 100 }
    );

    expect(getViewport()).toEqual({
      offset: { x: -100, y: 50 },
      zoom: 2,
    });
  });

  it("aligns imported content to the viewport start without enlarging it", () => {
    const { camera, getViewport } = createHarness();
    camera.fitBounds(
      { x: 100, y: 50, width: 400, height: 200 },
      { width: 1000, height: 700 },
      { alignment: "start", maxZoom: 1, padding: 100 }
    );

    expect(getViewport()).toEqual({
      offset: { x: 0, y: 50 },
      zoom: 1,
    });
  });

  it("fits oversized imported content while preserving start alignment", () => {
    const { camera, getViewport } = createHarness();
    camera.fitBounds(
      { x: 100, y: 50, width: 2000, height: 1000 },
      { width: 1000, height: 700 },
      { alignment: "start", maxZoom: 1, padding: 100 }
    );

    expect(getViewport()).toEqual({
      offset: { x: 60, y: 80 },
      zoom: 0.4,
    });
  });

  it("reports activity through queued, direct, and animated camera paths", () => {
    const { camera, onViewportActivity, run } = createHarness();
    camera.panBy(1, 1);
    camera.queueZoomAt(1.1, { x: 10, y: 10 });
    run(16);
    camera.animateTo({ offset: { x: 20, y: 20 }, zoom: 2 }, { duration: 10 });
    run(26);

    expect(onViewportActivity).toHaveBeenCalledTimes(3);
  });
});
