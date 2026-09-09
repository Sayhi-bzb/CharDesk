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
}));

vi.mock("@/shared/metrics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/metrics")>()),
  loadRenderFonts: vi.fn(() => new Promise<void>(() => undefined)),
  prepareCanvasSurface: rendering.prepare,
}));

import {
  DEFAULT_ARTIFACT_CANVAS_PALETTE,
  DEFAULT_GRID_RENDER_METRICS,
} from "@/shared/metrics";
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
      metrics: DEFAULT_GRID_RENDER_METRICS,
      palette: DEFAULT_ARTIFACT_CANVAS_PALETTE,
      offset: { x: 0, y: 0 },
      zoom: 1,
    });
  });
});
