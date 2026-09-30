import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GridCell } from "@/shared/types";
import { createGridMapSource } from "@/shared/utils/grid-source";

const rendering = vi.hoisted(() => ({
  present: vi.fn(),
  prepare: vi.fn(),
}));

vi.mock("@chardesk/rendering/canvas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chardesk/rendering/canvas")>()),
  presentCharDeskCellFrame: rendering.present,
  loadCharDeskCanvasFonts: vi.fn(() => new Promise<void>(() => undefined)),
  prepareCharDeskCanvasSurface: rendering.prepare,
}));

import { DEFAULT_CANVAS_CELL_METRICS } from "@/shared/fonts/canvas-profile";
import { DEFAULT_ARTIFACT_CANVAS_PALETTE } from "@/shared/canvas-appearance/artifact-style";
import { CellFrameCanvas } from "./CellFrameCanvas";

describe("CellFrameCanvas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("presents a GridCellSource through the canonical Canvas CellFrame path", () => {
    const source = createGridMapSource(
      new Map<string, GridCell>([
        ["0,0", { char: "A", color: "#123456", bgColor: "#abcdef" }],
        ["1,0", { char: "界", color: "#654321" }],
      ])
    );

    render(
      <CellFrameCanvas
        source={source}
        viewport={{ x: 0, y: 0, width: 3, height: 1 }}
      />
    );

    const canvas = screen.getByTestId("cell-frame-canvas");
    expect(canvas).toHaveStyle({ width: "27px", height: "20px" });
    expect(rendering.prepare).toHaveBeenCalledWith(
      canvas,
      expect.anything(),
      27,
      20,
      expect.any(Number)
    );
    expect(rendering.present).toHaveBeenCalledOnce();
    const [context, frame, options] = rendering.present.mock.calls[0];
    expect(context).toEqual(expect.anything());
    expect(frame.viewport).toEqual({ x: 0, y: 0, width: 3, height: 1 });
    expect(frame.source.get({ x: 0, y: 0 })).toMatchObject({
      visual: { text: "A", color: "#123456", bgColor: "#abcdef" },
      drawBackground: true,
      drawText: true,
    });
    expect(frame.source.get({ x: 1, y: 0 })).toMatchObject({
      visual: { text: "界", width: 2 },
      drawBackground: true,
      drawText: true,
    });
    expect(options).toMatchObject({
      metrics: DEFAULT_CANVAS_CELL_METRICS,
      palette: DEFAULT_ARTIFACT_CANVAS_PALETTE,
      offset: { x: 0, y: 0 },
      zoom: 1,
    });
  });

  it("sizes contain rendering from its host and observes only that host", () => {
    let size = { width: 248, height: 139.5 };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      return {
        ...size, x: 0, y: 0, top: 0, left: 0, right: size.width, bottom: size.height,
        toJSON: () => size,
      } as DOMRect;
    });
    const observe = vi.fn();
    const disconnect = vi.fn();
    let resize: ResizeObserverCallback;
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    const source = createGridMapSource(new Map<string, GridCell>([
      ["0,0", { char: "A", color: "#123456" }],
    ]));
    const { unmount } = render(
      <CellFrameCanvas source={source} viewport={{ x: 0, y: 0, width: 3, height: 1 }} fit="contain" />
    );
    const host = screen.getByTestId("cell-frame-host");
    const canvas = screen.getByTestId("cell-frame-canvas");
    expect(canvas).toHaveClass("absolute", "inset-0");
    expect(observe).toHaveBeenCalledExactlyOnceWith(host);
    expect(rendering.prepare).toHaveBeenLastCalledWith(canvas, expect.anything(), 248, 139.5, expect.any(Number));
    size = { width: 204, height: 114.75 };
    resize!([], {} as ResizeObserver);
    expect(rendering.prepare).toHaveBeenLastCalledWith(canvas, expect.anything(), 204, 114.75, expect.any(Number));
    const renderCount = rendering.present.mock.calls.length;
    size = { width: 0, height: 0 };
    resize!([], {} as ResizeObserver);
    expect(rendering.present).toHaveBeenCalledTimes(renderCount);
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
