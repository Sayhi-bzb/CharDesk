import { describe, expect, it, vi } from "vitest";
import { createCharDeskRenderModel, resolveCharDeskCellVisual } from "./index.js";
import {
  drawCharDeskCanvasCells,
  drawCharDeskCanvasDocument,
  getCharDeskCanvasFont,
  loadCharDeskCanvasFonts,
  measureCharDeskCanvasDocument,
  prepareCharDeskCanvasSurface,
  resolveCharDeskCanvasCellVisual,
} from "./canvas.js";

const createContext = (dpr = 1) => {
  const operations: string[] = [];
  const context = {
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(() => operations.push("background")),
    fillText: vi.fn(() => operations.push("text")),
    getTransform: vi.fn(() => ({ a: dpr, b: 0, c: 0, d: dpr })),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    fillStyle: "",
    font: "",
    lineWidth: 1,
    strokeStyle: "",
    textAlign: "start",
    textBaseline: "alphabetic",
  } as unknown as CanvasRenderingContext2D;
  return { context, operations };
};

describe("CharDesk Canvas 2D renderer", () => {
  it("preserves inverse colors and decorations on geometric blocks", () => {
    const { context } = createContext();
    const colors: (string | CanvasGradient | CanvasPattern)[] = [];
    vi.mocked(context.fillRect).mockImplementation(() => { colors.push(context.fillStyle); });
    drawCharDeskCanvasCells(context, [{
      cell: resolveCharDeskCellVisual({ text: "█", color: "#112233", attrs: { inverse: true, bold: true, underline: true } }),
      x: 0, y: 0,
      options: { blockGlyphs: "geometry", palette: { color: "#000000", background: "#ffffff" } },
    }]);
    expect(colors).toEqual(["#112233", "#ffffff"]);
    expect(context.fillRect).toHaveBeenLastCalledWith(0, 0, 9, 19);
    expect(context.fillText).not.toHaveBeenCalled();
    expect(context.stroke).toHaveBeenCalledOnce();
  });
  it("draws solid blocks without resolving fonts while keeping ordinary text on the font path", () => {
    const { context } = createContext();
    const fontResolver = vi.fn(() => "monospace");
    const entry = { cell: resolveCharDeskCellVisual({ text: "█" }), x: 0, y: 0 };
    drawCharDeskCanvasCells(context, [{ ...entry, options: { blockGlyphs: "geometry", fontResolver, clipToCell: true } }]);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 9, 19);
    expect(context.fillText).not.toHaveBeenCalled();
    expect(fontResolver).not.toHaveBeenCalled();
    drawCharDeskCanvasCells(context, [entry]);
    expect(context.fillText).toHaveBeenCalledWith("█", 5, 10);
    drawCharDeskCanvasCells(context, [{ ...entry, cell: resolveCharDeskCellVisual({ text: "A" }), options: { blockGlyphs: "geometry", fontResolver } }]);
    expect(fontResolver).toHaveBeenCalledOnce();
    expect(context.fillText).toHaveBeenLastCalledWith("A", 5, 10);
  });
  it("clips glyphs to their Cell allocation only when requested", () => {
    const { context } = createContext();
    const entry = { cell: resolveCharDeskCellVisual({ text: "▬" }), x: 9, y: 19 };
    drawCharDeskCanvasCells(context, [entry]);
    expect(context.clip).not.toHaveBeenCalled();
    drawCharDeskCanvasCells(context, [{ ...entry, options: { clipToCell: true } }]);
    expect(context.rect).toHaveBeenCalledWith(9, 19, 9, 19);
    expect(context.clip).toHaveBeenCalledOnce();
    drawCharDeskCanvasCells(context, [{
      ...entry, cell: resolveCharDeskCellVisual({ text: "中" }), options: { clipToCell: true },
    }]);
    expect(context.rect).toHaveBeenLastCalledWith(9, 19, 18, 19);
    expect(context.save).toHaveBeenCalledTimes(5);
    expect(context.restore).toHaveBeenCalledTimes(5);
  });
  it("aligns glyph anchors to device pixels instead of CSS pixels", () => {
    const { context } = createContext(2);
    drawCharDeskCanvasCells(context, [{
      cell: resolveCharDeskCellVisual({ text: "A", color: "#111111" }),
      x: 0,
      y: 0,
    }]);

    expect(context.fillText).toHaveBeenCalledWith("A", 4.5, 9.5);
  });

  it("routes emoji through the monochrome Canvas font", () => {
    expect(getCharDeskCanvasFont(undefined, 1, { route: "emoji" }))
      .toContain("'Noto Emoji'");

    const { context } = createContext();
    drawCharDeskCanvasCells(context, [{
      cell: resolveCharDeskCellVisual({ text: "👋", color: "#111111" }),
      x: 0,
      y: 0,
    }]);

    expect(context.font).toContain("'Noto Emoji'");
    expect(context.fillText).toHaveBeenCalledWith("👋", 9, 10);
  });

  it("allows headless hosts to supply route- and weight-specific font stacks", () => {
    const { context } = createContext();
    drawCharDeskCanvasCells(context, [{
      cell: resolveCharDeskCellVisual({
        text: "A",
        attrs: { bold: true },
      }),
      x: 0,
      y: 0,
      options: {
        fontFamilies: {
          text: { regular: "Regular Face", bold: "Bold Face" },
          emoji: { regular: "Emoji Face" },
        },
      },
    }]);

    expect(context.font).toContain("700 15px Bold Face");
  });

  it("lets headless hosts resolve an exact font for each grapheme", () => {
    const { context } = createContext();
    const fontResolver = vi.fn(() => "Exact Shard");
    drawCharDeskCanvasCells(context, [{
      cell: resolveCharDeskCellVisual({ text: "A", attrs: { italic: true } }),
      x: 0,
      y: 0,
      options: { fontResolver },
    }]);

    expect(fontResolver).toHaveBeenCalledWith({
      grapheme: "A",
      route: "text",
      bold: false,
      italic: true,
    });
    expect(context.font).toContain("Exact Shard");
  });

  it("draws all backgrounds before text and resolves inverse colors", () => {
    const { context, operations } = createContext();
    drawCharDeskCanvasCells(context, [{
      cell: resolveCharDeskCellVisual({
        text: "A",
        color: "#112233",
        attrs: { inverse: true },
      }),
      x: 0,
      y: 0,
      options: { palette: { color: "#000000", background: "#ffffff" } },
    }]);

    expect(operations).toEqual(["background", "text"]);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 9, 19);
    expect(context.fillText).toHaveBeenCalledWith("A", 5, 10);
    expect(resolveCharDeskCanvasCellVisual(
      resolveCharDeskCellVisual({
        text: "A",
        color: "#112233",
        attrs: { inverse: true },
      }),
      { color: "#000000", background: "#ffffff" }
    )).toMatchObject({ color: "#ffffff", bgColor: "#112233" });
  });

  it("uses a monochrome replacement when the emoji face is unavailable", () => {
    const { context } = createContext();
    drawCharDeskCanvasCells(context, [{
      cell: resolveCharDeskCellVisual({ text: "🚀" }),
      x: 0,
      y: 0,
      options: { fontAvailability: { text: true, emoji: false } },
    }]);

    expect(context.fillText).toHaveBeenCalledWith("□", 9, 10);
  });

  it("measures and draws protocol cells on the shared 9 by 19 grid", () => {
    const model = createCharDeskRenderModel("A界\n🙂");
    expect(measureCharDeskCanvasDocument(model)).toMatchObject({
      width: 59,
      height: 70,
      padding: 16,
    });

    const { context } = createContext();
    const layout = drawCharDeskCanvasDocument(context, model, {
      palette: { color: "#111111", background: "#ffffff" },
    });
    expect(layout.width).toBe(59);
    expect(context.fillText).toHaveBeenCalledTimes(3);
  });

  it("rasterizes documents at the requested zoom instead of scaling a bitmap", () => {
    const model = createCharDeskRenderModel("AB");
    expect(measureCharDeskCanvasDocument(model, { zoom: 1.25 })).toMatchObject({
      width: 62.5,
      height: 63.75,
      padding: 20,
    });

    const { context } = createContext();
    drawCharDeskCanvasDocument(context, model, {
      palette: { color: "#111111", background: "#ffffff" },
      zoom: 1.25,
    });

    expect(context.font).toContain("18.75px");
    expect(context.fillText).toHaveBeenNthCalledWith(1, "A", 26, 32);
    expect(context.fillText).toHaveBeenNthCalledWith(2, "B", 37, 32);
  });

  it("prepares a DPR-aware backing surface", () => {
    const { context } = createContext();
    const canvas = { width: 0, height: 0, style: {} } as HTMLCanvasElement;
    prepareCharDeskCanvasSurface(canvas, context, 120, 80, 2);

    expect(canvas).toMatchObject({ width: 240, height: 160 });
    expect(canvas.style.width).toBe("120px");
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it("reports route availability from the actual loaded font faces", async () => {
    const load = vi.fn()
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([]);
    vi.stubGlobal("document", {
      fonts: { load, ready: Promise.resolve() },
    });

    try {
      await expect(loadCharDeskCanvasFonts(["A", "🇨🇳"])).resolves.toEqual({
        text: true,
        emoji: false,
      });
      expect(load.mock.calls[1]?.[0]).toContain("Noto Emoji");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
