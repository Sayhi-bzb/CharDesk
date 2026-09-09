import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CANVAS_COMPONENT_TEMPLATES } from "@/domains/canvas-templates/public";
import { CanvasTemplateLibrary } from "./canvas-template-library";

vi.mock("@/shared/components/CellFrameCanvas", () => ({
  CellFrameCanvas: ({ fit }: { fit?: string }) => (
    <canvas data-testid="cell-frame-canvas" data-fit={fit} />
  ),
}));

describe("CanvasTemplateLibrary", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("defers a template preview until its viewport is near the visible area", () => {
    const callbacks: IntersectionObserverCallback[] = [];
    const options: IntersectionObserverInit[] = [];
    class IntersectionObserverMock {
      constructor(
        callback: IntersectionObserverCallback,
        init?: IntersectionObserverInit
      ) {
        callbacks.push(callback);
        options.push(init ?? {});
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = "";
      thresholds = [];
    }
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);

    const { container } = render(
      <CanvasTemplateLibrary templates={[CANVAS_COMPONENT_TEMPLATES[0]]} />
    );

    expect(
      screen.getByTestId("canvas-template-preview-lazy-host")
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="cell-frame-canvas"]')
    ).not.toBeInTheDocument();
    expect(options[0]).toMatchObject({ rootMargin: "160px 0px" });

    act(() => {
      callbacks[0]([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    expect(
      container.querySelector('[data-testid="cell-frame-canvas"]')
    ).toHaveAttribute("data-fit", "contain");
  });

  it.each(["drop", "blur", "dragend"] as const)(
    "reuses the pre-mounted native drag image through %s cleanup",
    async (cleanupTrigger) => {
      const { unmount } = render(
        <CanvasTemplateLibrary
          templates={[CANVAS_COMPONENT_TEMPLATES[0]]}
        />
      );
      const dragImage = document.querySelector<HTMLCanvasElement>(
        '[data-slot="native-drag-image"]'
      );
      expect(dragImage).toBeInTheDocument();
      expect(dragImage?.isConnected).toBe(true);
      expect(dragImage?.parentElement).toBe(document.body);

      const button = screen.getByRole("button", { name: /button/i });
      const setDragImage = vi.fn();
      const dragStartEvent = createEvent.dragStart(button);
      Object.defineProperty(dragStartEvent, "dataTransfer", {
        value: {
          effectAllowed: "none",
          setData: vi.fn(),
          setDragImage,
        },
      });

      fireEvent(button, dragStartEvent);

      expect(setDragImage).toHaveBeenCalledWith(dragImage, 0, 0);
      const dragOverlay = screen.getByTestId("canvas-template-drag-overlay");
      expect(dragOverlay).not.toHaveClass("opacity-80");
      expect(within(dragOverlay).getByTestId("cell-frame-canvas")).toHaveAttribute(
        "data-fit",
        "contain"
      );
      await act(
        () =>
          new Promise<void>((resolve) =>
            window.requestAnimationFrame(() => resolve())
          )
      );
      expect(dragImage?.isConnected).toBe(true);

      if (cleanupTrigger === "drop") fireEvent.drop(document.body);
      if (cleanupTrigger === "blur") fireEvent.blur(window);
      if (cleanupTrigger === "dragend") fireEvent.dragEnd(button);

      expect(dragImage?.isConnected).toBe(true);
      unmount();
      expect(dragImage?.isConnected).toBe(false);
    }
  );
});
