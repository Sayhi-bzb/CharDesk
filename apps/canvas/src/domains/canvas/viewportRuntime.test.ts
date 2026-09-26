import { describe, expect, it, vi } from "vitest";
import { CanvasViewportRuntime, normalizeCanvasViewport } from "./viewportRuntime";

describe("CanvasViewportRuntime", () => {
  it("normalizes invalid fallback values and clamps zoom", () => {
    expect(normalizeCanvasViewport({
      offset: { x: Number.NaN, y: 4 },
      zoom: Number.POSITIVE_INFINITY,
    })).toEqual({ offset: { x: 0, y: 4 }, zoom: 1 });
    expect(normalizeCanvasViewport({ offset: { x: 2, y: 3 }, zoom: 100 }))
      .toEqual({ offset: { x: 2, y: 3 }, zoom: 5 });
  });

  it("routes commands exclusively through the bound active view", () => {
    let viewport = { offset: { x: 10, y: 20 }, zoom: 1 };
    const listeners = new Set<() => void>();
    const setViewport = vi.fn((updater, options) => {
      viewport = updater(viewport);
      if (!options?.transient) listeners.forEach((listener) => listener());
    });
    const runtime = new CanvasViewportRuntime();
    const unbind = runtime.bind({
      getViewport: () => viewport,
      setViewport,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });

    runtime.setOffset((offset) => ({ ...offset, x: offset.x + 5 }));
    runtime.setZoom(() => 2);

    expect(setViewport).toHaveBeenCalledTimes(2);
    expect(runtime.getSnapshot()).toEqual({ offset: { x: 15, y: 20 }, zoom: 2 });
    unbind();
    expect(runtime.getSnapshot()).toEqual({ offset: { x: 15, y: 20 }, zoom: 2 });
  });

  it("does not let fallback restoration replace a mounted view", () => {
    let viewport = { offset: { x: 8, y: 9 }, zoom: 2 };
    const runtime = new CanvasViewportRuntime();
    runtime.bind({
      getViewport: () => viewport,
      setViewport: (updater) => { viewport = updater(viewport); },
      subscribe: () => () => undefined,
    });

    runtime.resetFallback({ offset: { x: 0, y: 0 }, zoom: 1 });

    expect(runtime.getSnapshot()).toEqual({ offset: { x: 8, y: 9 }, zoom: 2 });
  });
});
