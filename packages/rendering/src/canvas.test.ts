import { describe, expect, it, vi } from "vitest";
import {
  CHARDESK_SYSTEM_FONT_PROFILE,
  createCharDeskFontProfile,
  type CharDeskFontProfile,
} from "@chardesk/fonts";
import { createCharDeskRenderModel, resolveCharDeskCellVisual } from "./index.js";
import {
  drawCharDeskCanvasCells,
  drawCharDeskCanvasCursor,
  drawCharDeskCanvasDocument,
  getCharDeskCanvasFont,
  loadCharDeskCanvasFonts,
  measureCharDeskCanvasDocument,
  presentCharDeskCellFrame,
  prepareCharDeskCanvasSurface,
  resolveCharDeskCanvasFontFace,
  resolveCharDeskCanvasCellVisual,
} from "./canvas.js";

const createContext = (dpr = 1) => {
  const operations: string[] = [];
  const context = {
    beginPath: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(() => operations.push("background")),
    fill: vi.fn(),
    fillText: vi.fn(() => operations.push("text")),
    getTransform: vi.fn(() => ({ a: dpr, b: 0, c: 0, d: dpr })),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    fillStyle: "",
    font: "",
    lineWidth: 1,
    strokeStyle: "",
    textAlign: "start",
    textBaseline: "alphabetic",
  } as unknown as CanvasRenderingContext2D;
  return { context, operations };
};

const customFontProfile = (overrides: Partial<CharDeskFontProfile["capabilities"]> = {}): CharDeskFontProfile => ({
  ...CHARDESK_SYSTEM_FONT_PROFILE,
  id: "test/capabilities",
  capabilities: {
    ...CHARDESK_SYSTEM_FONT_PROFILE.capabilities,
    ...overrides,
  },
});

describe("CharDesk Canvas 2D renderer", () => {
  it("draws block, bar, and underline cursors from one Cell primitive", () => {
    const { context } = createContext(2);
    const cell = resolveCharDeskCellVisual({ text: "中", color: "#123456" });
    drawCharDeskCanvasCursor(context, {
      cell,
      x: 9,
      y: 20,
      style: { shape: "block", color: "#ffffff", textColor: "#000000" },
      options: { metrics: { cellWidth: 9, cellHeight: 20, fontSize: 15, fontFamily: "Test" } },
    });
    expect(context.fillRect).toHaveBeenCalledWith(9, 20, 18, 20);
    expect(context.fillText).toHaveBeenCalledWith("中", 18, 30);

    vi.mocked(context.fillRect).mockClear();
    drawCharDeskCanvasCursor(context, {
      cell,
      x: 9,
      y: 20,
      style: { shape: "bar", color: "#ffffff", textColor: "#000000" },
      options: { metrics: { cellWidth: 9, cellHeight: 20, fontSize: 15, fontFamily: "Test" } },
    });
    expect(context.fillRect).toHaveBeenCalledWith(9, 20, 1, 20);

    vi.mocked(context.fillRect).mockClear();
    drawCharDeskCanvasCursor(context, {
      cell,
      x: 9,
      y: 20,
      style: { shape: "underline", color: "#ffffff", textColor: "#000000" },
      options: { metrics: { cellWidth: 9, cellHeight: 20, fontSize: 15, fontFamily: "Test" } },
    });
    expect(context.fillRect).toHaveBeenCalledWith(9, 39, 18, 1);
  });

  it("presents bounded Cell Frames with shared metrics and dirty filtering", () => {
    const { context } = createContext();
    const cells = new Map([
      ["1,2", { visual: resolveCharDeskCellVisual({ text: "A", color: "#123456" }) }],
      ["2,2", { visual: resolveCharDeskCellVisual({ text: "B", color: "#123456" }) }],
    ]);
    const source = {
      get: ({ x, y }: { x: number; y: number }) => cells.get(`${x},${y}`),
      visit: (
        bounds: { x: number; y: number; width: number; height: number },
        visitor: (x: number, y: number, cell: (typeof cells extends Map<string, infer T> ? T : never)) => void
      ) => {
        for (const [key, cell] of cells) {
          const [x, y] = key.split(",").map(Number) as [number, number];
          if (x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height) {
            visitor(x, y, cell);
          }
        }
      },
      getContentBounds: () => ({ x: 1, y: 2, width: 2, height: 1 }),
    };
    const result = presentCharDeskCellFrame(context, {
      revision: 3,
      viewport: { x: 0, y: 0, width: 4, height: 4 },
      source,
      dirty: [{ x: 2, y: 2, width: 1, height: 1 }],
    }, {
      metrics: { cellWidth: 9, cellHeight: 20, baseline: 15, fontSize: 15, fontFamily: "Test" },
      palette: { color: "#000000", background: "#ffffff" },
      offset: { x: 3, y: 4 },
      zoom: 2,
    });
    expect(result).toEqual({ cells: 1, glyphs: 1 });
    expect(context.fillText).toHaveBeenCalledWith("B", 48, 114);
  });

  for (const dpr of [1, 1.25, 2]) {
    for (const zoom of [1, 1.25]) {
      it(`preserves grid spacing and baseline at DPR ${dpr}, zoom ${zoom}`, () => {
        const { context } = createContext(dpr);
        const metrics = { cellWidth: 7.5, cellHeight: 15, baseline: 12, fontSize: 15, fontFamily: "Test" };
        const fontProfile = customFontProfile({
          display: { families: { regular: "Test" }, baselineShiftEm: 0.05 },
        });
        drawCharDeskCanvasCells(context, ["A", "B", "C", "中"].map((text, column) => ({
          cell: resolveCharDeskCellVisual({ text }),
          x: 0.2 + column * metrics.cellWidth * zoom,
          y: 0.3,
          options: { metrics, zoom, fontProfile, clipToCell: true },
        })));
        const calls = vi.mocked(context.fillText).mock.calls;
        for (let i = 0; i < 3; i++) {
          expect(calls[i]![1]).toBeCloseTo(0.2 + (i + 0.5) * 7.5 * zoom, 10);
          expect(calls[i]![2]).toBeCloseTo(0.3 + (12 + 0.75) * zoom, 10);
        }
        expect(calls[3]![1]).toBeCloseTo(0.2 + 4 * 7.5 * zoom, 10);
        expect(context.clip).toHaveBeenCalledTimes(4);
      });
    }
  }

  it("uses the same effective weight for resolver, loading and drawing", async () => {
    const fontProfile = customFontProfile({
      display: { families: { regular: "Regular", bold: "Bold" }, weightPolicy: "regular" },
    });
    const fontResolver = vi.fn(({ bold }: { bold: boolean }) => bold ? "Wrong Bold" : "Resolved Regular");
    const load = vi.fn().mockResolvedValue([{}]);
    vi.stubGlobal("document", { fonts: { load, ready: Promise.resolve() } });
    try {
      await loadCharDeskCanvasFonts([{ grapheme: "A", bold: true }, "A"], { fontProfile, fontResolver });
      const { context } = createContext();
      const cell = resolveCharDeskCellVisual({ text: "A", attrs: { bold: true } });
      drawCharDeskCanvasCells(context, [{ cell, x: 0, y: 0, options: { fontProfile, fontResolver } }]);
      expect(load).toHaveBeenCalledOnce();
      expect(load.mock.calls[0]![0]).toBe(context.font);
      expect(context.font).toBe("15px Resolved Regular");
      expect(fontResolver.mock.calls.every(([request]) => !request.bold)).toBe(true);
      expect(cell.attrs?.bold).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("preserves inverse colors and decorations on block glyphs", () => {
    const { context } = createContext();
    const colors: (string | CanvasGradient | CanvasPattern)[] = [];
    vi.mocked(context.fillRect).mockImplementation(() => { colors.push(context.fillStyle); });
    vi.mocked(context.fill).mockImplementation(() => { colors.push(context.fillStyle); });
    drawCharDeskCanvasCells(context, [{
      cell: resolveCharDeskCellVisual({ text: "█", color: "#112233", attrs: { inverse: true, bold: true, underline: true } }),
      x: 0, y: 0,
      options: { palette: { color: "#000000", background: "#ffffff" } },
    }]);
    expect(colors[0]).toBe("#112233");
    expect(colors.slice(1).every(color => color === "#ffffff")).toBe(true);
    expect(context.fillText).not.toHaveBeenCalled();
    expect(context.stroke).toHaveBeenCalledOnce();
  });
  it("draws component border and block characters without resolving fonts", () => {
    const { context } = createContext();
    const fontResolver = vi.fn(() => "monospace");
    drawCharDeskCanvasCells(context, ["█", "│", "╭"].map((text, column) => ({
      cell: resolveCharDeskCellVisual({ text }),
      x: column * 9,
      y: 0,
      options: { fontResolver, clipToCell: true },
    })));
    expect(context.fillText).not.toHaveBeenCalled();
    expect(fontResolver).not.toHaveBeenCalled();
    expect(context.arc).toHaveBeenCalled();
  });
  it("clips glyphs to their Cell allocation only when requested", () => {
    const { context } = createContext();
    const entry = { cell: resolveCharDeskCellVisual({ text: "▬" }), x: 9, y: 19 };
    drawCharDeskCanvasCells(context, [entry]);
    expect(context.clip).not.toHaveBeenCalled();
    drawCharDeskCanvasCells(context, [{ ...entry, options: { clipToCell: true } }]);
    expect(context.rect).toHaveBeenCalledWith(9, 19, 9, 20);
    expect(context.clip).toHaveBeenCalledOnce();
    drawCharDeskCanvasCells(context, [{
      ...entry, cell: resolveCharDeskCellVisual({ text: "中" }), options: { clipToCell: true },
    }]);
    expect(context.rect).toHaveBeenLastCalledWith(9, 19, 18, 20);
    expect(context.save).toHaveBeenCalledTimes(5);
    expect(context.restore).toHaveBeenCalledTimes(5);
  });
  it("preserves fractional glyph anchors", () => {
    const { context } = createContext(2);
    drawCharDeskCanvasCells(context, [{
      cell: resolveCharDeskCellVisual({ text: "A", color: "#111111" }),
      x: 0,
      y: 0,
    }]);

    expect(context.fillText).toHaveBeenCalledWith("A", 4.5, 15);
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
    expect(context.fillText).toHaveBeenCalledWith("👋", 9, 15);
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

  it("resolves capability faces without changing semantic render routes", () => {
    const fontProfile = customFontProfile({
      cjk: { families: { regular: "CJK Face" }, scaleX: 1.2 },
    });

    expect(resolveCharDeskCanvasFontFace({
      grapheme: "中",
      route: "text",
      bold: false,
      italic: false,
      fontProfile,
    })).toMatchObject({ capability: "cjk", family: "CJK Face", scaleX: 1.2 });
  });

  it("renders symbols through the selected display weight before the JuliaMono fallback", () => {
    const fontProfile = createCharDeskFontProfile({
      id: "test/display-first-symbol",
      display: { families: { regular: "Display Regular", bold: "Display Bold" } },
      cjk: { families: { regular: "CJK Regular", bold: "CJK Bold" } },
    });
    const face = resolveCharDeskCanvasFontFace({
      grapheme: "∞",
      route: "text",
      bold: true,
      italic: false,
      fontProfile,
    });
    expect(face).toMatchObject({
      capability: "symbol",
      family: "Display Bold, CJK Bold, 'JuliaMono'",
      weightPolicy: "inherit",
    });

    const { context } = createContext();
    drawCharDeskCanvasCells(context, [{
      cell: resolveCharDeskCellVisual({ text: "∞", attrs: { bold: true } }),
      x: 0,
      y: 0,
      options: { fontProfile },
    }]);
    expect(context.font).toContain("700 15px Display Bold");
  });

  it("applies face metrics around the glyph without scaling Cell decorations", () => {
    const { context } = createContext();
    const fontProfile = customFontProfile({
      nerd: {
        families: { regular: "Nerd Symbols" },
        fontSizeScale: 0.9,
        scaleX: 0.6,
        baselineShiftEm: 0.1,
        weightPolicy: "regular",
      },
    });

    drawCharDeskCanvasCells(context, [{
      cell: resolveCharDeskCellVisual({
        text: "\ue0d6",
        attrs: { bold: true, underline: true },
      }),
      x: 0,
      y: 0,
      options: { fontProfile, clipToCell: true },
    }]);

    expect(context.font).toContain("13.5px Nerd Symbols");
    expect(context.font).not.toContain("700");
    expect(context.translate).toHaveBeenCalledWith(4.5, 16.35);
    expect(context.scale).toHaveBeenCalledWith(0.6, 1);
    expect(context.fillText).toHaveBeenCalledWith("\ue0d6", 0, 0);
    expect(context.lineTo).toHaveBeenCalledWith(9, 16.5);
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
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 9, 20);
    expect(context.fillText).toHaveBeenCalledWith("A", 4.5, 15);
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

    expect(context.fillText).toHaveBeenCalledWith("□", 9, 15);
    expect(context.font).toContain("Noto Emoji");
  });

  it("measures and draws protocol cells on the shared 9 by 20 grid", () => {
    const model = createCharDeskRenderModel("A界\n🙂");
    expect(measureCharDeskCanvasDocument(model)).toMatchObject({
      width: 59,
      height: 72,
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
      height: 65,
      padding: 20,
    });

    const { context } = createContext();
    drawCharDeskCanvasDocument(context, model, {
      palette: { color: "#111111", background: "#ffffff" },
      zoom: 1.25,
    });

    expect(context.font).toContain("18.75px");
    expect(context.fillText).toHaveBeenNthCalledWith(1, "A", 25.625, 38.75);
    expect(context.fillText).toHaveBeenNthCalledWith(2, "B", 36.875, 38.75);
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

  it("loads the supplied capability face and honors its weight policy", async () => {
    const load = vi.fn().mockResolvedValue([{}]);
    vi.stubGlobal("document", {
      fonts: { load, ready: Promise.resolve() },
    });
    const fontProfile = customFontProfile({
      nerd: {
        families: { regular: "Nerd Symbols" },
        weightPolicy: "regular",
      },
    });

    try {
      await loadCharDeskCanvasFonts(
        [{ grapheme: "\ue0d6", bold: true }],
        { fontProfile }
      );
      expect(load).toHaveBeenCalledOnce();
      expect(load.mock.calls[0]?.[0]).toContain("15px Nerd Symbols");
      expect(load.mock.calls[0]?.[0]).not.toContain("700");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
