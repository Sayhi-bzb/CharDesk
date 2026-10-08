import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCellViewport } from "./browser-viewport.js";

describe("useCellViewport", () => {
  it("converts observed pixels to guarded Cell dimensions", () => {
    let callback: ResizeObserverCallback | undefined;
    vi.stubGlobal("ResizeObserver", class {
      constructor(next: ResizeObserverCallback) { callback = next; }
      observe() {}
      disconnect() {}
      unobserve() {}
    });
    const element = document.createElement("div");
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ width: 100, height: 60 } as DOMRect);
    const ref = { current: element };
    const { result } = renderHook(() => useCellViewport({ elementRef: ref, metrics: { cellWidth: 10, cellHeight: 10 } as never, guard: 1 }));
    expect(result.current.viewport).toEqual({ width: 8, height: 4 });
    expect(result.current.ready).toBe(true);
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ width: 40, height: 20 } as DOMRect);
    act(() => callback?.([] as never, {} as ResizeObserver));
    expect(result.current.viewport).toEqual({ width: 2, height: 1 });
  });
});
