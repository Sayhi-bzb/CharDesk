import { describe, expect, it, vi } from "vitest";
import type { CanvasSurfaceReader } from "@/domains/canvas/public";
import type { GridCell } from "@/shared/types";

import { CellPlaneIndex } from "@/domains/canvas/public";
import { drawGridLayer, drawHoveredLinkDecoration } from "./drawGridLayer";
import { withCharDeskCoreCellGlyphs } from "@chardesk/fonts";
import { displayFontOptions } from "@/shared/fonts/catalog";

describe("drawGridLayer", () => {
  it("updates cached entries when the effective profile changes without moving cells", () => {
    const cells = [{ char: "A", color: "#fff" }, { char: "╭", color: "#fff" }];
    const reader = {
      visit: (
        _bounds: unknown,
        visitor: (x: number, y: number, cell: GridCell) => void
      ) => cells.forEach((cell, x) => visitor(x, 0, cell)),
    } as unknown as CanvasSurfaceReader;
    const ctx = createContext();
    const samples: Array<{ char: string; font: string; x: number; y: number }> = [];
    vi.mocked(ctx.fillText).mockImplementation((char, x, y) => { samples.push({ char, font: ctx.font, x, y }); });
    for (const id of ["maple", "fusion-mono", "xiaolai-mono"] as const) {
      const sampleCount = samples.length;
      drawGridLayer(ctx, reader, { startX: 0, endX: 5, startY: 0, endY: 1 }, 1, { x: 0, y: 0 }, {
        fontProfile: withCharDeskCoreCellGlyphs(displayFontOptions[id].profile),
      });
      expect(samples).toHaveLength(sampleCount + 1);
      expect(samples.at(-1)).toMatchObject({ char: "A" });
      expect(samples.at(-1)?.font).toContain(displayFontOptions[id].profile.capabilities.display.families.regular);
    }
    expect(samples.some(({ char }) => char === "╭")).toBe(false);
    expect(ctx.stroke).toHaveBeenCalledTimes(3);
    expect(new Set(samples.filter(({ char }) => char === "A").map(({ x, y }) => `${x},${y}`)).size).toBe(1);
  });
  const createContext = () => ({
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D);

  it("visits occupied cells instead of probing every viewport coordinate", () => {
    const get = vi.fn();
    const visit = vi.fn((
      _bounds: unknown,
      visitor: (x: number, y: number, cell: GridCell) => void
    ) => visitor(5, 7, { char: "A", color: "#fff" }));
    const reader = {
      get,
      visit,
    } as unknown as CanvasSurfaceReader;
    const ctx = createContext();

    drawGridLayer(
      ctx,
      reader,
      { startX: 2, endX: 20, startY: 3, endY: 10 },
      1,
      { x: 0, y: 0 }
    );

    expect(visit).toHaveBeenCalledWith(
      { x: 1, y: 3, width: 20, height: 8 },
      expect.any(Function)
    );
    expect(get).not.toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalledOnce();
  });

  it("uses the standard cell-source visit contract", () => {
    const query = vi.fn(function* () {
      yield { x: 0, y: 0, cells: [{ char: "Q", color: "#fff" }] };
    });
    const visit = vi.fn((
      _bounds: unknown,
      visitor: (x: number, y: number, cell: GridCell) => void
    ) => visitor(4, 6, { char: "V", color: "#fff" }));
    const ctx = createContext();

    drawGridLayer(
      ctx,
      { query, visit } as unknown as CanvasSurfaceReader,
      { startX: 4, endX: 4, startY: 6, endY: 6 },
      1,
      { x: 0, y: 0 }
    );

    expect(visit).toHaveBeenCalledWith(
      { x: 3, y: 6, width: 2, height: 1 },
      expect.any(Function)
    );
    expect(query).not.toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalledWith("V", expect.any(Number), expect.any(Number));
  });

  it("draws glyphs at full fidelity at every zoom level", () => {
    const visit = vi.fn((
      _bounds: unknown,
      visitor: (x: number, y: number, cell: GridCell) => void
    ) => visitor(0, 0, {
      char: "A",
      color: "#fff",
      attrs: { bold: true, underline: true, strike: true },
    }));
    const ctx = createContext();

    drawGridLayer(
      ctx,
      { visit } as unknown as CanvasSurfaceReader,
      { startX: 0, endX: 0, startY: 0, endY: 0 },
      0.1,
      { x: 0, y: 0 }
    );

    expect(ctx.fillText).toHaveBeenCalledWith("A", expect.any(Number), expect.any(Number));
  });

  it.each([
    { name: "inside a chunk", wideX: 0 },
    { name: "across a chunk boundary", wideX: 63 },
  ])("redraws a wide anchor when its follower intersects the view $name", ({ wideX }) => {
    const reader = new CellPlaneIndex([{
      id: "wide-and-neighbor",
      bounds: { x: wideX, y: 0, width: 3, height: 1 },
      rows: [{
        y: 0,
        erase: [],
        spans: [
          { x: wideX, text: "你", color: "#fff" },
          { x: wideX + 2, text: "A", color: "#fff" },
        ],
      }],
    }]);
    const ctx = createContext();

    drawGridLayer(
      ctx,
      reader,
      { startX: wideX + 1, endX: wideX + 2, startY: 0, endY: 0 },
      1,
      { x: 0, y: 0 }
    );

    expect(vi.mocked(ctx.fillText).mock.calls.map(([character]) => character))
      .toEqual(["你", "A"]);
  });

  it("does not draw a single-width cell from the left query halo", () => {
    const visit = vi.fn((
      _bounds: unknown,
      visitor: (x: number, y: number, cell: GridCell) => void
    ) => {
      visitor(0, 0, { char: "A", color: "#fff" });
      visitor(1, 0, { char: "B", color: "#fff" });
    });
    const reader = { visit } as unknown as CanvasSurfaceReader;
    const ctx = createContext();

    drawGridLayer(
      ctx,
      reader,
      { startX: 1, endX: 1, startY: 0, endY: 0 },
      1,
      { x: 0, y: 0 }
    );

    expect(vi.mocked(ctx.fillText).mock.calls.map(([character]) => character))
      .toEqual(["B"]);
  });

  it("can draw backgrounds and glyphs in separate passes", () => {
    const reader = new CellPlaneIndex([{
      id: "styled",
      bounds: { x: 0, y: 0, width: 1, height: 1 },
      rows: [{
        y: 0,
        erase: [],
        spans: [{ x: 0, text: "A", color: "#fff", bgColor: "#123456" }],
      }],
    }]);
    const background = createContext();
    const text = createContext();

    const backgroundResult = drawGridLayer(
      background,
      reader,
      { startX: 0, endX: 0, startY: 0, endY: 0 },
      1,
      { x: 0, y: 0 },
      { content: "background" }
    );
    const textResult = drawGridLayer(
      text,
      reader,
      { startX: 0, endX: 0, startY: 0, endY: 0 },
      1,
      { x: 0, y: 0 },
      { content: "text" }
    );

    expect(background.fillRect).toHaveBeenCalledOnce();
    expect(background.fillText).not.toHaveBeenCalled();
    expect(backgroundResult).toEqual({ cells: 1, glyphs: 0 });
    expect(text.fillRect).not.toHaveBeenCalled();
    expect(text.fillText).toHaveBeenCalledOnce();
    expect(textResult).toEqual({ cells: 1, glyphs: 1 });
  });

  it("draws a hovered link decoration without repainting its glyphs", () => {
    const query = vi.fn(function* () {
      yield {
        x: 3,
        y: 2,
        cells: [{ char: "A", color: "#38bdf8", href: "https://example.com" }],
      };
    });
    const reader = { query } as unknown as CanvasSurfaceReader;
    const ctx = createContext();

    drawHoveredLinkDecoration(
      ctx,
      reader,
      {
        href: "https://example.com",
        startX: 3,
        endX: 3,
        y: 2,
      },
      1,
      { x: 0, y: 0 }
    );

    expect(ctx.fillText).not.toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith({ x: 3, y: 2, width: 1, height: 1 });
  });
});
