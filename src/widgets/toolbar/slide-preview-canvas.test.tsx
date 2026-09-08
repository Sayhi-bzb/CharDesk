import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SlideDescriptor,
  SlideGridEntry,
} from "@/domains/slides/public";
import { SlidePreviewCanvas } from "./slide-preview-canvas";

const { drawSlideCanvas, visualTheme } = vi.hoisted(() => ({
  drawSlideCanvas: vi.fn(),
  visualTheme: {
    revision: "light",
    host: { previewText: "#f8fafc" },
  },
}));

vi.mock("./slide-canvas-renderer", () => ({ drawSlideCanvas }));
vi.mock("@/shared/hooks/useHostVisualTheme", () => ({
  useHostVisualTheme: () => visualTheme,
}));

const slide: SlideDescriptor = {
  id: "slide-1",
  name: "Preview",
  size: { columns: 100, rows: 27 },
};
let grid: SlideGridEntry[] = [];
const loadGrid = () => grid;

describe("SlidePreviewCanvas", () => {
  let resize: ResizeObserverCallback;
  let intersect: IntersectionObserverCallback;
  let intersectionVisible: boolean;
  const disconnect = vi.fn();
  const observe = vi.fn();
  const fonts = new EventTarget();
  const originalFonts = Object.getOwnPropertyDescriptor(document, "fonts");

  beforeEach(() => {
    grid = [];
    intersectionVisible = true;
    drawSlideCanvas.mockReset();
    disconnect.mockReset();
    observe.mockReset();
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 103,
      height: 103,
      left: 0,
      right: 180,
      top: 0,
      width: 180,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: class ResizeObserverMock {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe = observe;
        disconnect = disconnect;
        unobserve = vi.fn();
      },
    });
    Object.defineProperty(globalThis, "IntersectionObserver", {
      configurable: true,
      value: class IntersectionObserverMock {
        constructor(callback: IntersectionObserverCallback) {
          intersect = callback;
        }
        observe = vi.fn((target: Element) => {
          intersect(
            [{ isIntersecting: intersectionVisible, target } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver
          );
        });
        disconnect = vi.fn();
        unobserve = vi.fn();
        takeRecords = vi.fn(() => []);
        root = null;
        rootMargin = "240px 0px";
        thresholds = [0];
      },
    });
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: fonts,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, "ResizeObserver");
    Reflect.deleteProperty(globalThis, "IntersectionObserver");
    if (originalFonts) {
      Object.defineProperty(document, "fonts", originalFonts);
    } else {
      Reflect.deleteProperty(document, "fonts");
    }
  });

  it("redraws for content, size, element resize, and font changes", () => {
    const { rerender, unmount } = render(
      <SlidePreviewCanvas slide={slide} loadGrid={loadGrid} />
    );

    expect(drawSlideCanvas).toHaveBeenLastCalledWith(
      expect.objectContaining({
        slide: { ...slide, grid: [] },
        size: { columns: 100, rows: 27 },
        viewportWidth: 180,
        viewportHeight: 103,
        padding: 0,
        backdropColor: null,
        pageColor: null,
        defaultTextColor: "#f8fafc",
      })
    );
    expect(observe).toHaveBeenCalledTimes(1);

    act(() => resize([], {} as ResizeObserver));
    act(() => fonts.dispatchEvent(new Event("loadingdone")));
    expect(drawSlideCanvas).toHaveBeenCalledTimes(3);

    const updatedSlide = {
      ...slide,
      size: { columns: 80, rows: 24 },
    };
    grid = [["79,23", { char: "A", color: "#000000" }]];
    rerender(
      <SlidePreviewCanvas
        slide={updatedSlide}
        contentRevision={1}
        loadGrid={loadGrid}
      />
    );
    expect(drawSlideCanvas).toHaveBeenCalledTimes(4);
    expect(drawSlideCanvas).toHaveBeenLastCalledWith(
      expect.objectContaining({ slide: { ...updatedSlide, grid } })
    );
    expect(disconnect).toHaveBeenCalledTimes(1);

    unmount();
    expect(disconnect).toHaveBeenCalledTimes(2);
    act(() => fonts.dispatchEvent(new Event("loadingdone")));
    expect(drawSlideCanvas).toHaveBeenCalledTimes(4);
  });

  it("does not mount or draw a canvas while the preview is outside the viewport", () => {
    intersectionVisible = false;
    const { container } = render(
      <SlidePreviewCanvas slide={slide} loadGrid={loadGrid} />
    );

    expect(container.querySelector("canvas")).not.toBeInTheDocument();
    expect(drawSlideCanvas).not.toHaveBeenCalled();
  });
});
