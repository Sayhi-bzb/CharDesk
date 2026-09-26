import { StrictMode, useEffect } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCanvasEngineRuntime } from "./useCanvasEngineRuntime";
import { CANVAS_FRAME_INVALIDATION } from "./FrameScheduler";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCanvasEngineRuntime", () => {
  it("continues scheduling frames after StrictMode effect replay", () => {
    let frameCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frameCallback = callback;
      return 1;
    });
    const rendered = vi.fn();

    const Harness = () => {
      const runtime = useCanvasEngineRuntime();
      useEffect(() => {
        runtime.frameScheduler.request(
          "strict-mode-render",
          CANVAS_FRAME_INVALIDATION.background,
          rendered
        );
      }, [runtime]);
      return null;
    };

    render(
      <StrictMode>
        <Harness />
      </StrictMode>
    );

    act(() => frameCallback?.(10));
    expect(rendered).toHaveBeenCalledWith(
      10,
      CANVAS_FRAME_INVALIDATION.background
    );
  });
});
