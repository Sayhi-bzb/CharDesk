import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CellPlaneIndex, type CellPlaneOperation } from "@/domains/canvas/public";
import { MinimapManager } from "./MinimapManager";

class MockPath2D {
  rect = vi.fn();
}

const createContext = () => ({
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

const operation = (id: string, x: number): CellPlaneOperation => ({
  id,
  bounds: { x, y: 0, width: 1, height: 1 },
  rows: [{
    y: 0,
    erase: [],
    spans: [{ x, text: id, color: "#fff" }],
  }],
});

const colors = {
  artifact: {
    background: "background",
    color: "foreground",
    grid: "grid",
  },
  viewportFill: "viewport-fill",
  viewportStroke: "viewport-stroke",
};

describe("MinimapManager incremental content", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("Path2D", MockPath2D);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rebuilds only chunks touched since the cached revision", () => {
    const canvas = document.createElement("canvas");
    const context = createContext();
    vi.spyOn(canvas, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );
    const plane = new CellPlaneIndex([operation("A", 0)]);
    const rows = vi.spyOn(plane, "rows");
    const manager = new MinimapManager(
      canvas,
      document.createElement("div"),
      { width: 220, height: 140 },
      4
    );
    const viewport = {
      reader: plane,
      offset: { x: 0, y: 0 },
      zoom: 1,
      viewportSize: { width: 1000, height: 700 },
    };
    manager.update({ colors, ...viewport, contentRevision: plane.getRevision() });
    rows.mockClear();

    plane.append(operation("B", 200));
    manager.update({ colors, ...viewport, contentRevision: plane.getRevision() });
    vi.advanceTimersByTime(160);

    expect(rows).toHaveBeenCalledTimes(1);
    expect(rows).toHaveBeenCalledWith({
      x: 128,
      y: 0,
      width: 128,
      height: 64,
    });
    manager.close();
  });

  it("accepts observer events before its first render snapshot", () => {
    let resize!: ResizeObserverCallback;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      }
    );
    const canvas = document.createElement("canvas");
    const context = createContext();
    vi.spyOn(canvas, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D
    );
    const manager = new MinimapManager(
      canvas,
      document.createElement("div"),
      { width: 220, height: 140 },
      4
    );

    expect(() => resize([], {} as ResizeObserver)).not.toThrow();
    expect(context.fillRect).not.toHaveBeenCalled();

    const plane = new CellPlaneIndex([operation("A", 0)]);
    manager.update({
      colors,
      reader: plane,
      contentRevision: plane.getRevision(),
      offset: { x: 0, y: 0 },
      zoom: 1,
      viewportSize: { width: 1000, height: 700 },
    });

    expect(context.fillRect).toHaveBeenCalledOnce();
    manager.close();
  });

  it("uses shared colors for full, incremental and theme rebuilds", () => {
    const canvas = document.createElement("canvas");
    const context = createContext();
    const painted: string[] = [];
    context.fill.mockImplementation(() => { painted.push(context.fillStyle); });
    vi.spyOn(canvas, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    const plane = new CellPlaneIndex([{
      id: "colored", bounds: { x: 0, y: 0, width: 6, height: 1 },
      rows: [{ y: 0, erase: [], spans: [
        { x: 0, text: "界", color: "#000000" },
        { x: 2, text: "🦀", color: "#dd2233" },
        { x: 4, text: " ", color: "#ff0000", bgColor: "#112233" },
        { x: 5, text: " ", color: "#ff0000" },
      ] }],
    }]);
    const manager = new MinimapManager(canvas, document.createElement("div"), { width: 220, height: 140 }, 4);
    const update = (foreground: string) => manager.update({
      reader: plane, contentRevision: plane.getRevision(), offset: { x: 0, y: 0 }, zoom: 1,
      viewportSize: { width: 1000, height: 700 },
      colors: { ...colors, artifact: { ...colors.artifact, color: foreground } },
    });
    try {
      update("#eeeeee");
      expect(painted).toEqual(expect.arrayContaining(["#eeeeee", "#dd2233", "#112233"]));
      expect(painted).not.toContain("#ff0000");
      painted.length = 0;
      plane.append({ id: "recolor", bounds: { x: 2, y: 0, width: 2, height: 1 }, rows: [{ y: 0, erase: [], spans: [{ x: 2, text: "🦀", color: "#22aa88" }] }] });
      update("#eeeeee"); vi.advanceTimersByTime(160);
      expect(painted).toContain("#22aa88");
      expect(painted).not.toContain("#dd2233");
      painted.length = 0;
      update("#333333");
      expect(painted).toEqual(expect.arrayContaining(["#333333", "#22aa88", "#112233"]));
    } finally { manager.close(); }
  });
});
