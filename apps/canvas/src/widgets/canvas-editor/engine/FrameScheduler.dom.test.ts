import { describe, expect, it, vi } from "vitest";
import {
  CANVAS_FRAME_INVALIDATION,
  CanvasFrameScheduler,
  CanvasScopedFrameScheduler,
  createFrameSchedulerRafAdapter,
} from "./FrameScheduler";

const createPort = () => {
  let callback: FrameRequestCallback | null = null;
  return {
    port: {
      requestAnimationFrame: vi.fn((next: FrameRequestCallback) => {
        callback = next;
        return 7;
      }),
      cancelAnimationFrame: vi.fn(),
      now: () => 12,
    },
    run: () => callback?.(10),
  };
};

describe("CanvasFrameScheduler", () => {
  it("coalesces keyed work and combines invalidation bits", () => {
    const { port, run } = createPort();
    const scheduler = new CanvasFrameScheduler(port);
    const first = vi.fn();
    const replacement = vi.fn();
    const second = vi.fn();

    scheduler.request("renderer", CANVAS_FRAME_INVALIDATION.background, first);
    scheduler.request("renderer", CANVAS_FRAME_INVALIDATION.overlay, replacement);
    scheduler.request("viewport", CANVAS_FRAME_INVALIDATION.presentation, second);
    run();

    expect(port.requestAnimationFrame).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    expect(replacement).toHaveBeenCalledWith(
      10,
      CANVAS_FRAME_INVALIDATION.background | CANVAS_FRAME_INVALIDATION.overlay
    );
    expect(second).toHaveBeenCalledWith(
      10,
      CANVAS_FRAME_INVALIDATION.presentation
    );
  });

  it("adapts independent RAF clients to the shared frame", () => {
    const { port, run } = createPort();
    const scheduler = new CanvasFrameScheduler(port);
    const viewport = createFrameSchedulerRafAdapter(
      scheduler,
      "viewport",
      CANVAS_FRAME_INVALIDATION.presentation
    );
    const preview = createFrameSchedulerRafAdapter(
      scheduler,
      "preview",
      CANVAS_FRAME_INVALIDATION.overlay
    );
    const onViewport = vi.fn();
    const onPreview = vi.fn();

    viewport.requestAnimationFrame(onViewport);
    preview.requestAnimationFrame(onPreview);
    run();

    expect(port.requestAnimationFrame).toHaveBeenCalledOnce();
    expect(onViewport).toHaveBeenCalledWith(10);
    expect(onPreview).toHaveBeenCalledWith(10);
  });

  it("runs interaction work first and defers background work past the budget", () => {
    const frames: FrameRequestCallback[] = [];
    let now = 0;
    const scheduler = new CanvasFrameScheduler({
      requestAnimationFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelAnimationFrame: vi.fn(),
      now: () => now,
    }, { frameBudgetMs: 8 });
    const order: string[] = [];

    scheduler.request(
      "background",
      CANVAS_FRAME_INVALIDATION.background,
      () => order.push("background")
    );
    scheduler.request(
      "input",
      CANVAS_FRAME_INVALIDATION.overlay,
      () => {
        order.push("input");
        now = 10;
      }
    );

    frames.shift()!(1);
    expect(order).toEqual(["input"]);
    expect(scheduler.getStats()).toMatchObject({ pending: 1, deferredFrames: 1 });

    frames.shift()!(2);
    expect(order).toEqual(["input", "background"]);
  });

  it("runs render work requested by an update in the same browser frame", () => {
    const frames: FrameRequestCallback[] = [];
    const scheduler = new CanvasFrameScheduler({
      requestAnimationFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelAnimationFrame: vi.fn(),
      now: () => 0,
    });
    const order: string[] = [];

    scheduler.request(
      "camera",
      CANVAS_FRAME_INVALIDATION.presentation,
      () => {
        order.push("update");
        scheduler.request(
          "renderer",
          CANVAS_FRAME_INVALIDATION.background,
          () => order.push("render"),
          { phase: "render" }
        );
      }
    );

    frames.shift()!(16);

    expect(order).toEqual(["update", "render"]);
    expect(frames).toHaveLength(0);
  });

  it("keeps recursively requested update work for the next frame", () => {
    const frames: FrameRequestCallback[] = [];
    const scheduler = new CanvasFrameScheduler({
      requestAnimationFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelAnimationFrame: vi.fn(),
      now: () => 0,
    });
    const timestamps: number[] = [];
    const update = (timestamp: number) => {
      timestamps.push(timestamp);
      if (timestamps.length === 1) {
        scheduler.request(
          "animation",
          CANVAS_FRAME_INVALIDATION.presentation,
          update
        );
      }
    };

    scheduler.request(
      "animation",
      CANVAS_FRAME_INVALIDATION.presentation,
      update
    );
    frames.shift()!(16);

    expect(timestamps).toEqual([16]);
    expect(frames).toHaveLength(1);

    frames.shift()!(32);
    expect(timestamps).toEqual([16, 32]);
  });

  it("defers same-frame render work when update work consumes the budget", () => {
    const frames: FrameRequestCallback[] = [];
    let now = 0;
    const scheduler = new CanvasFrameScheduler({
      requestAnimationFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelAnimationFrame: vi.fn(),
      now: () => now,
    }, { frameBudgetMs: 8 });
    const order: string[] = [];

    scheduler.request(
      "camera",
      CANVAS_FRAME_INVALIDATION.presentation,
      () => {
        order.push("update");
        scheduler.request(
          "renderer",
          CANVAS_FRAME_INVALIDATION.background,
          () => order.push("render"),
          { phase: "render" }
        );
        now = 9;
      }
    );

    frames.shift()!(16);
    expect(order).toEqual(["update"]);
    expect(scheduler.getStats()).toMatchObject({ pending: 1, deferredFrames: 1 });

    frames.shift()!(32);
    expect(order).toEqual(["update", "render"]);
  });

  it("can be disposed safely from active frame work", () => {
    const { run, port } = createPort();
    const scheduler = new CanvasFrameScheduler(port);
    const afterDispose = vi.fn();

    scheduler.request(
      "dispose",
      CANVAS_FRAME_INVALIDATION.presentation,
      () => scheduler.dispose()
    );
    scheduler.request(
      "render",
      CANVAS_FRAME_INVALIDATION.background,
      afterDispose,
      { phase: "render" }
    );

    expect(() => run()).not.toThrow();
    expect(afterDispose).not.toHaveBeenCalled();
    expect(scheduler.getStats().pending).toBe(0);
  });

  it("isolates a view failure and continues work requested for the next frame", () => {
    const { run, port } = createPort();
    const reportError = vi.fn();
    const scheduler = new CanvasFrameScheduler(port, { reportError });
    const first = new CanvasScopedFrameScheduler(scheduler, "first");
    const second = new CanvasScopedFrameScheduler(scheduler, "second");
    const failure = new Error("Paint failed");
    const nextFrame = vi.fn();
    const sibling = vi.fn();

    first.request("renderer", CANVAS_FRAME_INVALIDATION.background, () => {
      first.request("renderer", CANVAS_FRAME_INVALIDATION.background, nextFrame, { phase: "render" });
      throw failure;
    }, { phase: "render" });
    second.request("renderer", CANVAS_FRAME_INVALIDATION.background, sibling, { phase: "render" });
    run();

    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(sibling).toHaveBeenCalledOnce();
    expect(nextFrame).not.toHaveBeenCalled();
    run();
    expect(nextFrame).toHaveBeenCalledOnce();
    expect(scheduler.getStats().pending).toBe(0);
  });

  it("retains coalesced work and rejects callbacks from before a pause", () => {
    const { run, port } = createPort();
    const scheduler = new CanvasFrameScheduler(port);
    const view = new CanvasScopedFrameScheduler(scheduler, "view");
    const resume = vi.fn();
    const repaint = vi.fn();
    view.subscribeResume(resume);

    view.request("renderer", CANVAS_FRAME_INVALIDATION.background, vi.fn());
    const staleFrame = port.requestAnimationFrame.mock.calls[0]![0];
    scheduler.setPaused(true);
    view.request("renderer", CANVAS_FRAME_INVALIDATION.overlay, repaint);
    expect(port.cancelAnimationFrame).toHaveBeenCalledExactlyOnceWith(7);
    expect(port.requestAnimationFrame).toHaveBeenCalledOnce();

    scheduler.setPaused(false);
    scheduler.setPaused(false);
    staleFrame(9);
    expect(repaint).not.toHaveBeenCalled();
    run();
    expect(repaint).toHaveBeenCalledExactlyOnceWith(
      10,
      CANVAS_FRAME_INVALIDATION.background | CANVAS_FRAME_INVALIDATION.overlay
    );
    expect(resume).toHaveBeenCalledOnce();

    scheduler.setPaused(true);
    view.request("renderer", CANVAS_FRAME_INVALIDATION.background, repaint);
    view.dispose();
    scheduler.setPaused(false);
    expect(resume).toHaveBeenCalledOnce();
    expect(scheduler.getStats().pending).toBe(0);
  });
});
