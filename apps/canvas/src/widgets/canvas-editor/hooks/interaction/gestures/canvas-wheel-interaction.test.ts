import { describe, expect, it, vi } from "vitest";
import {
  createCanvasWheelExecutor,
  createCanvasWheelHandler,
  createCanvasWheelRouteHandler,
  executeCanvasWheelDecision,
  getCanvasWheelOrigin,
  resolveCanvasWheelDecision,
  type CanvasWheelExecutor,
} from "@/widgets/canvas-editor/hooks/interaction/gestures/wheelInteraction";

const createExecutor = (): CanvasWheelExecutor => ({
  preventDefault: vi.fn(),
  flushOffset: vi.fn(),
  queueZoomDelta: vi.fn(),
  queueOffsetDelta: vi.fn(),
});

describe("canvas wheel interaction", () => {
  it("reads the zoom origin from the native wheel client coordinates", () => {
    expect(
      getCanvasWheelOrigin({ clientX: 640, clientY: 360 } as WheelEvent)
    ).toEqual({ x: 640, y: 360 });
  });

  it("routes ctrl/meta wheels to anchored zoom", () => {
    expect(
      resolveCanvasWheelDecision({
        isCtrlOrMetaPressed: true,
        deltaX: 0,
        deltaY: -100,
        shiftKey: false,
        anchor: { x: 20, y: 30 },
      })
    ).toEqual({
      type: "zoom",
      deltaZoom: 1.2,
      anchor: { x: 20, y: 30 },
    });
  });


  it("converts shift vertical wheels into horizontal pan", () => {
    expect(
      resolveCanvasWheelDecision({
        isCtrlOrMetaPressed: false,
        deltaX: 0,
        deltaY: 8,
        shiftKey: true,
        anchor: { x: 0, y: 0 },
      })
    ).toEqual({ type: "pan", delta: { x: -8, y: 0 } });
  });


  it("executes zoom decisions by flushing pan and queueing zoom", () => {
    const executor = createExecutor();

    executeCanvasWheelDecision(
      { type: "zoom", deltaZoom: 1.2, anchor: { x: 20, y: 30 } },
      executor
    );

    expect(executor.preventDefault).toHaveBeenCalledTimes(1);
    expect(executor.flushOffset).toHaveBeenCalledTimes(1);
    expect(executor.queueZoomDelta).toHaveBeenCalledWith(1.2, 20, 30);
  });

  it("executes pan decisions by preventing browser navigation", () => {
    const executor = createExecutor();

    executeCanvasWheelDecision(
      { type: "pan", delta: { x: -3, y: 5 } },
      executor
    );

    expect(executor.queueOffsetDelta).toHaveBeenCalledWith(-3, 5);
    expect(executor.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("creates wheel executors that bind viewport callbacks", () => {
    const preventDefault = vi.fn();
    const flushOffset = vi.fn();
    const queueZoomDelta = vi.fn();
    const queueOffsetDelta = vi.fn();
    const executor = createCanvasWheelExecutor({
      preventDefault,
      flushOffset,
      queueZoomDelta,
      queueOffsetDelta,
    });

    executor.preventDefault();
    executor.flushOffset();
    executor.queueZoomDelta(1.1, 20, 30);
    executor.queueOffsetDelta(-4, 6);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(flushOffset).toHaveBeenCalledTimes(1);
    expect(queueZoomDelta).toHaveBeenCalledWith(1.1, 20, 30);
    expect(queueOffsetDelta).toHaveBeenCalledWith(-4, 6);
  });

  it("creates wheel handlers that resolve zoom decisions", () => {
    const executor = createExecutor();
    const preventDefault = vi.fn();
    const handler = createCanvasWheelHandler({
      executor,
    });

    handler({
      isCtrlOrMetaPressed: true,
      deltaX: 0,
      deltaY: -100,
      shiftKey: false,
      anchor: { x: 20, y: 30 },
      preventDefault,
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(executor.flushOffset).toHaveBeenCalledTimes(1);
    expect(executor.queueZoomDelta).toHaveBeenCalledWith(1.2, 20, 30);
  });

  it("creates wheel handlers that resolve pan decisions", () => {
    const executor = createExecutor();
    const preventDefault = vi.fn();
    const handler = createCanvasWheelHandler({
      executor,
    });

    handler({
      isCtrlOrMetaPressed: false,
      deltaX: 0,
      deltaY: 8,
      shiftKey: true,
      anchor: { x: 0, y: 0 },
      preventDefault,
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(executor.queueOffsetDelta).toHaveBeenCalledWith(-8, 0);
  });
  it("routes normalized wheel gesture deltas through anchor resolution", () => {
    const handler = vi.fn();
    const preventDefault = vi.fn();
    const resolveAnchor = vi.fn(() => ({ x: 20, y: 30 }));
    const route = createCanvasWheelRouteHandler({ handler });

    route({
      isCtrlOrMetaPressed: true,
      gestureDeltaX: 1,
      gestureDeltaY: 2,
      shiftKey: false,
      origin: { x: 50, y: 60 },
      preventDefault,
      resolveAnchor,
    });

    expect(resolveAnchor).toHaveBeenCalledWith({ x: 50, y: 60 });
    expect(handler).toHaveBeenCalledWith({
      isCtrlOrMetaPressed: true,
      deltaX: 1,
      deltaY: 2,
      shiftKey: false,
      anchor: { x: 20, y: 30 },
      preventDefault,
    });
  });

  it("preserves normalized fractional trackpad deltas", () => {
    const handler = vi.fn();
    const route = createCanvasWheelRouteHandler({ handler });

    route({
      isCtrlOrMetaPressed: false,
      gestureDeltaX: 0.25,
      gestureDeltaY: -0.75,
      shiftKey: true,
      origin: { x: 50, y: 60 },
      preventDefault: vi.fn(),
      resolveAnchor: vi.fn(() => ({ x: 20, y: 30 })),
    });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        deltaX: 0.25,
        deltaY: -0.75,
        shiftKey: true,
        anchor: { x: 20, y: 30 },
      })
    );
  });

  it("skips wheel handling when the anchor cannot resolve", () => {
    const handler = vi.fn();
    const preventDefault = vi.fn();
    const resolveAnchor = vi.fn(() => null);
    const route = createCanvasWheelRouteHandler({ handler });

    route({
      isCtrlOrMetaPressed: true,
      gestureDeltaX: 1,
      gestureDeltaY: 2,
      shiftKey: false,
      origin: { x: 50, y: 60 },
      preventDefault,
      resolveAnchor,
    });

    expect(resolveAnchor).toHaveBeenCalledWith({ x: 50, y: 60 });
    expect(handler).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
