import { act, cleanup, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { TestCanvasContentSurface } from "@/domains/canvas/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Minimap } from "@/widgets/canvas-editor/Minimap";
import {
  setCanvasTestState,
  testingCanvasRuntime,
  useEditorStore,
} from "@/domains/canvas/testing";
import { GridManager } from "@/shared/utils/grid";
import { setUiLanguage } from "@/shared/i18n";

const visualTheme = vi.hoisted(() => ({
    canvas: {
      minimapSurface: "white",
      minimapContent: "black",
      minimapViewportSurface: "rgba(0, 0, 0, 0.35)",
      minimapViewportBorder: "black",
    },
}));
const visualThemeState = vi.hoisted(() => ({ available: true }));

vi.mock("@/shared/canvas-appearance/hooks", () => ({
  useCanvasAppearance: () => ({
    resolvedTheme: "light",
    visualTheme: visualThemeState.available ? visualTheme : null,
    palette: { color: "black", background: "white", grid: "gray" },
    revision: 1,
  }),
}));

const initialState = useEditorStore.getState();
const pathInstances: MockPath2D[] = [];

class MockPath2D {
  rect = vi.fn();

  constructor() {
    pathInstances.push(this);
  }
}

const createMockContext = () => ({
  beginPath: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  rect: vi.fn(),
  resetTransform: vi.fn(),
  roundRect: vi.fn(),
  setTransform: vi.fn(),
  stroke: vi.fn(),
  fillStyle: "",
  strokeStyle: "",
  globalAlpha: 1,
  lineWidth: 1,
});

describe("Minimap canvas", () => {
  beforeEach(() => {
    setUiLanguage("en");
    visualThemeState.available = true;
    pathInstances.length = 0;
    vi.stubGlobal("Path2D", MockPath2D);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      }
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      createMockContext() as unknown as CanvasRenderingContext2D
    );
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(performance.now() + 1000);
      return 1;
    });
  });

  afterEach(() => {
    cleanup();
    setUiLanguage("en");
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useEditorStore.setState(initialState, true);
  });

  const seedContent = () => {
    setCanvasTestState({
      contentSurface: new TestCanvasContentSurface([
        [GridManager.toKey(0, 0), { char: "A", color: "#ffffff" }],
        [GridManager.toKey(199, 99), { char: "B", color: "#ffffff" }],
      ]),
      offset: { x: 0, y: 0 },
      zoom: 1,
    });
  };

  const prepareCanvas = () => {
    const canvas = screen.getByLabelText("Canvas minimap") as HTMLCanvasElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 220,
      bottom: 140,
      width: 220,
      height: 140,
      toJSON: () => ({}),
    });
    canvas.setPointerCapture = vi.fn();
    canvas.hasPointerCapture = vi.fn(() => true);
    canvas.releasePointerCapture = vi.fn();
    return canvas;
  };

  it("uses a stable 220 by 140 frame", () => {
    seedContent();
    render(<Minimap containerSize={{ width: 1000, height: 700 }} />);

    const canvas = screen.getByLabelText("Canvas minimap");
    expect(canvas).toHaveAttribute("width", "220");
    expect(canvas).toHaveAttribute("height", "140");
    expect(canvas).toHaveStyle({ width: "220px", height: "140px" });
  });

  it("draws initial content when the host theme becomes available", () => {
    seedContent();
    visualThemeState.available = false;
    const { rerender } = render(
      <Minimap containerSize={{ width: 1000, height: 700 }} />
    );

    expect(pathInstances).toHaveLength(0);

    visualThemeState.available = true;
    rerender(<Minimap containerSize={{ width: 1000, height: 700 }} />);

    expect(pathInstances.length).toBeGreaterThan(0);
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledOnce();
  });

  it("localizes the minimap accessible name", () => {
    setUiLanguage("zh");
    seedContent();
    render(<Minimap containerSize={{ width: 1000, height: 700 }} />);

    expect(screen.getByLabelText("画布小地图")).toBeInTheDocument();
  });

  it("reuses page-space paths when only the camera moves", () => {
    seedContent();
    render(<Minimap containerSize={{ width: 1000, height: 700 }} />);
    const initialPathCount = pathInstances.length;

    act(() => {
      testingCanvasRuntime.commands.viewport.setOffset(() => ({ x: -200, y: -100 }));
    });

    expect(pathInstances).toHaveLength(initialPathCount);
  });

  it("starts animated navigation from a point outside the viewport", () => {
    seedContent();
    render(<Minimap containerSize={{ width: 1000, height: 700 }} />);
    const canvas = prepareCanvas();

    const pointerDown = createEvent.pointerDown(canvas);
    Object.defineProperties(pointerDown, {
      button: { value: 0 },
      pointerId: { value: 1 },
      clientX: { value: 180 },
      clientY: { value: 100 },
    });
    fireEvent(canvas, pointerDown);

    expect(testingCanvasRuntime.viewport.getSnapshot().offset).not.toEqual({ x: 0, y: 0 });
  });

  it("drags the viewport while preserving the pointer grab offset", () => {
    seedContent();
    render(<Minimap containerSize={{ width: 1000, height: 700 }} />);
    const canvas = prepareCanvas();

    const pointerDown = createEvent.pointerDown(canvas);
    Object.defineProperties(pointerDown, {
      button: { value: 0 },
      pointerId: { value: 1 },
      clientX: { value: 60 },
      clientY: { value: 20 },
    });
    fireEvent(canvas, pointerDown);

    const pointerMove = createEvent.pointerMove(canvas);
    Object.defineProperties(pointerMove, {
      pointerId: { value: 1 },
      clientX: { value: 70 },
      clientY: { value: 30 },
      shiftKey: { value: false },
    });
    fireEvent(canvas, pointerMove);

    expect(testingCanvasRuntime.viewport.getSnapshot().offset.x).toBeLessThan(-50);
    expect(testingCanvasRuntime.viewport.getSnapshot().offset.y).toBeLessThan(-50);
    fireEvent.pointerUp(document.body, { pointerId: 1 });
  });

  it("ignores click jitter and ends drag on pointer cancel", () => {
    seedContent();
    render(<Minimap containerSize={{ width: 1000, height: 700 }} />);
    const canvas = prepareCanvas();

    fireEvent.pointerDown(canvas, {
      button: 0,
      pointerId: 1,
      clientX: 60,
      clientY: 20,
    });
    fireEvent.pointerMove(canvas, {
      pointerId: 1,
      clientX: 61,
      clientY: 21,
    });
    expect(testingCanvasRuntime.viewport.getSnapshot().offset).toEqual({ x: 0, y: 0 });

    fireEvent.pointerCancel(canvas, { pointerId: 1 });
    fireEvent.pointerMove(canvas, {
      pointerId: 1,
      clientX: 90,
      clientY: 50,
    });
    expect(testingCanvasRuntime.viewport.getSnapshot().offset).toEqual({ x: 0, y: 0 });
  });

  it("routes wheel pan and anchored zoom through camera controllers", () => {
    seedContent();
    render(<Minimap containerSize={{ width: 1000, height: 700 }} />);
    const canvas = prepareCanvas();

    fireEvent.wheel(canvas, { deltaX: 5, deltaY: 10 });
    expect(testingCanvasRuntime.viewport.getSnapshot().offset).toEqual({ x: -5, y: -10 });

    fireEvent.wheel(canvas, { deltaY: -100, metaKey: true });
    expect(testingCanvasRuntime.viewport.getSnapshot().zoom).toBeGreaterThan(1);
  });
});
