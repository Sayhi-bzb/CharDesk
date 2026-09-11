import { describe, expect, it, vi } from "vitest";
import type { SlideSnapshot } from "@/domains/slides/public";
import { DEFAULT_CANVAS_CELL_METRICS } from "@/shared/fonts/canvas-profile";
import { drawSlideCanvas } from "./slide-canvas-renderer";

const createCanvas = () => {
  const calls: string[] = [];
  const textColors: string[] = [];
  let fillStyle = "";
  const ctx = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn((x: number, y: number, width: number, height: number) => {
      calls.push(`fillRect:${fillStyle}:${x},${y},${width},${height}`);
    }),
    fillText: vi.fn((text: string) => {
      calls.push(`fillText:${text}`);
      textColors.push(fillStyle);
    }),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string) {
      fillStyle = value;
    },
    font: "",
    lineWidth: 1,
    strokeStyle: "",
    textAlign: "start" as CanvasTextAlign,
    textBaseline: "alphabetic" as CanvasTextBaseline,
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
  } as unknown as HTMLCanvasElement;
  return { calls, canvas, ctx, textColors };
};

describe("drawSlideCanvas", () => {
  it("keeps compact previews uncapped when no zoom limit is provided", () => {
    const { canvas } = createCanvas();

    const layout = drawSlideCanvas({
      canvas,
      slide: {
        id: "slide-1",
        name: "Compact preview",
        size: { columns: 10, rows: 5 },
        grid: [],
      },
      size: { columns: 10, rows: 5 },
      viewportWidth: 1000,
      viewportHeight: 600,
      padding: 0,
      dpr: 1,
    });

    expect(layout?.zoom).toBeGreaterThan(2);
    expect(layout?.y).toBe(0);
  });

  it("forwards an optional zoom limit while centering the slide", () => {
    const { canvas } = createCanvas();

    const layout = drawSlideCanvas({
      canvas,
      slide: {
        id: "slide-1",
        name: "Compact slide",
        size: { columns: 10, rows: 5 },
        grid: [],
      },
      size: { columns: 10, rows: 5 },
      viewportWidth: 1000,
      viewportHeight: 600,
      padding: 0,
      maxZoom: 2,
      dpr: 1,
    });

    expect(layout).toEqual({
      x: 410,
      y: 200,
      width: 180,
      height: 200,
      zoom: 2,
    });
  });

  it("extends the page color through ultrawide playback gutters", () => {
    const { calls, canvas } = createCanvas();

    const layout = drawSlideCanvas({
      canvas,
      slide: {
        id: "slide-1",
        name: "Widescreen slide",
        size: { columns: 100, rows: 27 },
        grid: [],
      },
      size: { columns: 100, rows: 27 },
      viewportWidth: 1600,
      viewportHeight: 600,
      padding: 0,
      dpr: 1,
    });

    expect(layout?.x).toBeGreaterThan(0);
    expect(calls[0]).toBe("fillRect:#ffffff:0,0,1600,600");
    expect(calls[1]).toBe(
      `fillRect:#ffffff:${layout?.x},${layout?.y},${layout?.width},${layout?.height}`
    );
  });

  it("renders the complete slide with backgrounds before text", () => {
    const { calls, canvas, ctx } = createCanvas();
    const slide: SlideSnapshot = {
      id: "slide-1",
      name: "Complete slide",
      size: { columns: 100, rows: 27 },
      grid: [
        [
          "0,0",
          { char: "界", color: "#abcdef", bgColor: "#123456" },
        ],
        [
          "99,26",
          {
            char: "A",
            color: "#ff0000",
            bgColor: "#00ff00",
            attrs: { bold: true, underline: true },
          },
        ],
        ["100,27", { char: "X", color: "#000000" }],
      ],
    };

    const layout = drawSlideCanvas({
      canvas,
      slide,
      size: { columns: 100, rows: 27 },
      viewportWidth: 900,
      viewportHeight: 513,
      padding: 0,
      backdropColor: "#ffffff",
      dpr: 2,
    });

    if (!layout) throw new Error("Expected a measurable slide layout");
    expect(layout).toEqual({
      x: 22.5,
      y: 0,
      width: 855,
      height: 513,
      zoom: 0.95,
    });
    expect(canvas.width).toBe(1800);
    expect(canvas.height).toBe(1026);
    expect(ctx.fillRect).toHaveBeenCalledTimes(4);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 900, 513);
    const lastCellX =
      layout.x + 99 * DEFAULT_CANVAS_CELL_METRICS.cellWidth * layout.zoom;
    const lastCellY =
      layout.y + 26 * DEFAULT_CANVAS_CELL_METRICS.cellHeight * layout.zoom;
    const lastCellWidth = DEFAULT_CANVAS_CELL_METRICS.cellWidth * layout.zoom;
    const cellHeight = DEFAULT_CANVAS_CELL_METRICS.cellHeight * layout.zoom;
    expect(ctx.fillRect).toHaveBeenCalledWith(
      layout.x,
      layout.y,
      DEFAULT_CANVAS_CELL_METRICS.cellWidth * 2 * layout.zoom,
      cellHeight
    );
    expect(ctx.fillRect).toHaveBeenCalledWith(
      lastCellX,
      lastCellY,
      lastCellWidth,
      cellHeight
    );
    expect(ctx.fillText).toHaveBeenCalledWith(
      "A",
      lastCellX + lastCellWidth / 2,
      lastCellY + DEFAULT_CANVAS_CELL_METRICS.baseline * layout.zoom
    );
    expect(ctx.fillText).not.toHaveBeenCalledWith(
      "X",
      expect.any(Number),
      expect.any(Number)
    );
    expect(calls.indexOf(
      `fillRect:#00ff00:${lastCellX},${lastCellY},${lastCellWidth},${cellHeight}`
    )).toBeLessThan(
      calls.indexOf("fillText:界")
    );
    expect(ctx.font).toContain("700");
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it("supports transparent previews and adapts only unbacked default text", () => {
    const { canvas, ctx, textColors } = createCanvas();

    drawSlideCanvas({
      canvas,
      slide: {
        id: "slide-1",
        name: "Transparent preview",
        size: { columns: 4, rows: 1 },
        grid: [
          ["0,0", { char: "A", color: "#000000" }],
          ["1,0", { char: "B", color: "#ff0000" }],
          [
            "2,0",
            { char: "C", color: "#000000", bgColor: "#ffffff" },
          ],
          [
            "3,0",
            { char: "D", color: "#000000", bgColor: "transparent" },
          ],
        ],
      },
      size: { columns: 4, rows: 1 },
      viewportWidth: 36,
      viewportHeight: 20,
      padding: 0,
      backdropColor: null,
      pageColor: null,
      defaultTextColor: "#f8fafc",
      dpr: 1,
    });

    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
    expect(ctx.fillRect).toHaveBeenCalledWith(18, 0, 9, 20);
    expect(ctx.fillRect).toHaveBeenCalledWith(27, 0, 9, 20);
    expect(textColors).toEqual([
      "#f8fafc",
      "#ff0000",
      "#000000",
      "#f8fafc",
    ]);
  });

  it("does not draw when the preview has no measurable area", () => {
    const { canvas, ctx } = createCanvas();

    expect(
      drawSlideCanvas({
        canvas,
        slide: {
          id: "slide-1",
          name: "Empty",
          size: { columns: 80, rows: 24 },
          grid: [],
        },
        size: { columns: 80, rows: 24 },
        viewportWidth: 0,
        viewportHeight: 100,
      })
    ).toBeNull();
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});
