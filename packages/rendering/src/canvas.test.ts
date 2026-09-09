import { describe, expect, it, vi } from "vitest";
import {
  CHARDESK_SYSTEM_FONT_PROFILE,
  createCharDeskFontProfile,
  type CharDeskFontProfile,
} from "@chardesk/fonts";
import {
  createCharDeskRectRangeGeometry,
  createCharDeskRenderModel,
  resolveCharDeskCellVisual,
} from "./index.js";
import {
  drawCharDeskCanvasCells,
  drawCharDeskCanvasCursor,
  drawCharDeskCanvasDocument,
  drawCharDeskCanvasRange,
  drawCharDeskCanvasRangeBackdrop,
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
  const compositeOperations: GlobalCompositeOperation[] = [];
  let globalCompositeOperation: GlobalCompositeOperation = "source-over";
  const context = {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(() => operations.push("background")),
    drawImage: vi.fn(),
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
  Object.defineProperty(context, "globalCompositeOperation", {
    get: () => globalCompositeOperation,
    set: (value: GlobalCompositeOperation) => {
      globalCompositeOperation = value;
      compositeOperations.push(value);
    },
  });
  return { context, operations, compositeOperations };
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

  it("draws Range phases from one Cell-coordinate primitive", () => {
    const { context } = createContext(2);
    const geometry = createCharDeskRectRangeGeometry({
      x: 1,
      y: 2,
      width: 3,
      height: 2,
    });
    const entry = {
      geometry,
      phase: "resting" as const,
      style: { surface: "selection", border: "outline" },
      options: {
        metrics: {
          cellWidth: 9,
          cellHeight: 20,
          fontSize: 15,
          fontFamily: "Test",
        },
        offset: { x: 0.25, y: 0.25 },
        zoom: 1,
      },
    };

    drawCharDeskCanvasRange(context, entry);
    expect(context.moveTo).toHaveBeenCalledWith(9.5, 40.5);
    expect(context.lineTo).toHaveBeenCalledWith(36.5, 40.5);
    expect(context.fill).toHaveBeenCalledWith("evenodd");
    expect(context.stroke).not.toHaveBeenCalled();

    drawCharDeskCanvasRange(context, { ...entry, phase: "moving" });
    expect(context.stroke).toHaveBeenCalledOnce();
  });

  it("applies contrast only to the Range surface and restores ordinary border composition", () => {
    const { context, compositeOperations } = createContext();
    drawCharDeskCanvasRange(context, {
      geometry: createCharDeskRectRangeGeometry({ x: 0, y: 0, width: 2, height: 1 }),
      phase: "resting",
      style: {
        surface: "rgba(255, 255, 255, 0.18)",
        border: "#ffffff",
        surfaceEffect: "contrast",
      },
    });

    expect(context.fill).toHaveBeenCalledWith("evenodd");
    expect(context.stroke).not.toHaveBeenCalled();
    expect(compositeOperations).toEqual(["difference", "source-over"]);
    expect(context.globalCompositeOperation).toBe("source-over");

    compositeOperations.length = 0;
    drawCharDeskCanvasRange(context, {
      geometry: createCharDeskRectRangeGeometry({ x: 0, y: 0, width: 2, height: 1 }),
      phase: "moving",
      style: {
        surface: "rgba(255, 255, 255, 0.18)",
        border: "#ffffff",
        surfaceEffect: "contrast",
      },
    });
    expect(context.stroke).toHaveBeenCalledOnce();
    expect(compositeOperations).toEqual(["difference", "source-over"]);
    expect(context.globalCompositeOperation).toBe("source-over");
  });

  it("seeds only the Range geometry from a backing Canvas for layered contrast", () => {
    const { context } = createContext();
    const source = {} as HTMLCanvasElement;
    drawCharDeskCanvasRangeBackdrop(context, {
      geometry: createCharDeskRectRangeGeometry({ x: 1, y: 2, width: 3, height: 2 }),
      source,
      width: 320,
      height: 180,
      options: {
        metrics: { cellWidth: 9, cellHeight: 20, fontSize: 15, fontFamily: "Test" },
      },
    });

    expect(context.moveTo).toHaveBeenCalledWith(9, 40);
    expect(context.clip).toHaveBeenCalledWith("evenodd");
    expect(context.drawImage).toHaveBeenCalledWith(source, 0, 0, 320, 180);
  });

  it("clips Range painting to dirty Cell regions", () => {
    const { context } = createContext();
    drawCharDeskCanvasRange(context, {
      geometry: createCharDeskRectRangeGeometry({ x: 0, y: 0, width: 4, height: 3 }),
      phase: "selecting",
      style: { surface: "selection", border: "outline" },
      options: {
        metrics: {
          cellWidth: 9,
          cellHeight: 20,
          fontSize: 15,
          fontFamily: "Test",
        },
        clipRegions: [{ x: 2, y: 1, width: 1, height: 1 }],
      },
    });

    expect(context.rect).toHaveBeenCalledWith(18, 20, 9, 20);
    expect(context.clip).toHaveBeenCalledOnce();
  });

  it("preserves compound Range rings for even-odd holes", () => {
    const { context } = createContext();
    drawCharDeskCanvasRange(context, {
      geometry: {
        polygons: [{
          rings: [
            [
              { x: 0, y: 0 },
              { x: 4, y: 0 },
              { x: 4, y: 4 },
              { x: 0, y: 4 },
              { x: 0, y: 0 },
            ],
            [
              { x: 1, y: 1 },
              { x: 1, y: 3 },
              { x: 3, y: 3 },
              { x: 3, y: 1 },
              { x: 1, y: 1 },
            ],
          ],
        }],
      },
      phase: "resting",
      style: { surface: "selection", border: "outline" },
    });

    expect(context.closePath).toHaveBeenCalledTimes(2);
    expect(context.fill).toHaveBeenCalledWith("evenodd");
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
          display: {
            families: { regular: "Test" },
            baselineShiftEm: 0.05,
            boldStrategy: "overdraw",
            boldOverdrawEm: 1 / 15,
          },
        });
        drawCharDeskCanvasCells(context, ["A", "B", "C", "中"].map((text, column) => ({
          cell: resolveCharDeskCellVisual({ text }),
          x: 0.2 + column * metrics.cellWidth * zoom,
          y: 0.3,
          options: { metrics, zoom, fontProfile },
        })));
        const calls = vi.mocked(context.fillText).mock.calls;
        for (let i = 0; i < 3; i++) {
          expect(calls[i]![1]).toBeCloseTo(0.2 + (i + 0.5) * 7.5 * zoom, 10);
          expect(calls[i]![2]).toBeCloseTo(0.3 + (12 + 0.75) * zoom, 10);
        }
        expect(calls[3]![1]).toBeCloseTo(0.2 + 4 * 7.5 * zoom, 10);
        expect(context.clip).not.toHaveBeenCalled();
      });
    }
  }

  it("uses the same effective weight for resolver, loading and drawing", async () => {
    const fontProfile = customFontProfile({
      display: {
        families: { regular: "Regular", bold: "Bold" },
        boldStrategy: "none",
        boldOverdrawEm: 0,
      },
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

  it("overdraws configured regular faces for bold Cells without requesting browser bold", () => {
    const { context } = createContext();
    const fontProfile = customFontProfile({
      display: {
        families: { regular: "Regular Only" },
        boldStrategy: "overdraw",
        boldOverdrawEm: 1 / 15,
      },
    });
    drawCharDeskCanvasCells(context, [
      { cell: resolveCharDeskCellVisual({ text: "A" }), x: 0, y: 0, options: { fontProfile } },
      { cell: resolveCharDeskCellVisual({ text: "B", attrs: { bold: true } }), x: 9, y: 0, options: { fontProfile } },
    ]);

    expect(context.font).toBe("15px Regular Only");
    expect(context.fillText).toHaveBeenNthCalledWith(1, "A", 4.5, 15);
    expect(context.fillText).toHaveBeenNthCalledWith(2, "B", 13.5, 15);
    expect(context.fillText).toHaveBeenNthCalledWith(3, "B", 14.5, 15);
  });

  it("scales face size and overdraw uniformly without clipping decorations", () => {
    const { context } = createContext();
    const fontProfile = customFontProfile({
      display: {
        families: { regular: "Scaled" },
        fontSizeScale: 0.8,
        boldStrategy: "overdraw",
        boldOverdrawEm: 1 / 15,
      },
    });
    drawCharDeskCanvasCells(context, [{
      cell: resolveCharDeskCellVisual({ text: "A", attrs: { bold: true, underline: true } }),
      x: 0,
      y: 0,
      options: { fontProfile, zoom: 2 },
    }]);

    expect(context.font).toBe("24px Scaled");
    expect(context.fillText).toHaveBeenNthCalledWith(1, "A", 9, 30);
    expect(context.fillText).toHaveBeenNthCalledWith(2, "A", 10.6, 30);
    expect(context.scale).not.toHaveBeenCalled();
    expect(context.clip).not.toHaveBeenCalled();
    expect(context.stroke).toHaveBeenCalledOnce();
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
      options: { fontResolver },
    })));
    expect(context.fillText).not.toHaveBeenCalled();
    expect(fontResolver).not.toHaveBeenCalled();
    expect(context.arc).toHaveBeenCalled();
  });
  it("keeps font ink independent from one- and two-Cell allocation", () => {
    const { context } = createContext();
    drawCharDeskCanvasCells(context, [
      { cell: resolveCharDeskCellVisual({ text: "A" }), x: 9, y: 19 },
      { cell: resolveCharDeskCellVisual({ text: "中" }), x: 18, y: 19 },
    ]);
    expect(context.fillText).toHaveBeenNthCalledWith(1, "A", 13.5, 34);
    expect(context.fillText).toHaveBeenNthCalledWith(2, "中", 27, 34);
    expect(context.clip).not.toHaveBeenCalled();
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
      cjk: {
        families: { regular: "CJK Face" },
        fontSizeScale: 1.2,
        boldStrategy: "overdraw",
        boldOverdrawEm: 1 / 15,
      },
    });

    expect(resolveCharDeskCanvasFontFace({
      grapheme: "中",
      route: "text",
      bold: false,
      italic: false,
      fontProfile,
    })).toMatchObject({ capability: "cjk", family: "CJK Face", fontSizeScale: 1.2 });
  });

  it("keeps symbols regular even when the display face has native bold", () => {
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
      family: "Display Regular, CJK Regular, 'JuliaMono'",
      boldStrategy: "none",
    });

    const { context } = createContext();
    drawCharDeskCanvasCells(context, [{
      cell: resolveCharDeskCellVisual({ text: "∞", attrs: { bold: true } }),
      x: 0,
      y: 0,
      options: { fontProfile },
    }]);
    expect(context.font).toBe("15px Display Regular, CJK Regular, 'JuliaMono'");
  });

  it("applies face metrics around the glyph without scaling Cell decorations", () => {
    const { context } = createContext();
    const fontProfile = customFontProfile({
      nerd: {
        families: { regular: "Nerd Symbols" },
        fontSizeScale: 0.8,
        baselineShiftEm: 0.1,
        boldStrategy: "none",
        boldOverdrawEm: 0,
      },
    });

    drawCharDeskCanvasCells(context, [{
      cell: resolveCharDeskCellVisual({
        text: "\ue0d6",
        attrs: { bold: true, underline: true },
      }),
      x: 0,
      y: 0,
      options: { fontProfile },
    }]);

    expect(context.font).toContain("12px Nerd Symbols");
    expect(context.font).not.toContain("700");
    expect(context.scale).not.toHaveBeenCalled();
    expect(context.fillText).toHaveBeenCalledWith("\ue0d6", 4.5, 16.2);
    expect(context.lineTo).toHaveBeenCalledWith(9, 16.5);
  });

  it("renders Nerd glyphs as one uniformly scaled Cell without horizontal transforms", () => {
    const { context } = createContext();
    const cell = resolveCharDeskCellVisual({ text: "󰄳" });

    drawCharDeskCanvasCells(context, [{ cell, x: 0, y: 0 }]);

    expect(cell.width).toBe(1);
    expect(context.font).toContain("12px 'Symbols Nerd Font Mono'");
    expect(context.fillText).toHaveBeenCalledWith("󰄳", 4.5, 15);
    expect(context.scale).not.toHaveBeenCalled();
    expect(context.clip).not.toHaveBeenCalled();
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

  it("shapes font samples in the DOM before loading and removes the sentinels", async () => {
    const load = vi.fn().mockResolvedValue([{}]);
    const remove = vi.fn();
    const append = vi.fn();
    const sentinel = {
      ariaHidden: "",
      style: { cssText: "", font: "" },
      textContent: "",
      remove,
    };
    vi.stubGlobal("document", {
      fonts: { load, ready: Promise.resolve() },
      createElement: vi.fn(() => sentinel),
      body: { append },
    });

    try {
      await loadCharDeskCanvasFonts(["\udb80\udf33"]);
      expect(append).toHaveBeenCalledWith(sentinel);
      expect(sentinel.ariaHidden).toBe("true");
      expect(sentinel.style.font).toContain("12px 'Symbols Nerd Font Mono'");
      expect(sentinel.textContent).toBe("\udb80\udf33");
      expect(load).toHaveBeenCalledWith(sentinel.style.font, sentinel.textContent);
      expect(remove).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("loads a supplied capability face with bold disabled", async () => {
    const load = vi.fn().mockResolvedValue([{}]);
    vi.stubGlobal("document", {
      fonts: { load, ready: Promise.resolve() },
    });
    const fontProfile = customFontProfile({
      nerd: {
        families: { regular: "Nerd Symbols" },
        boldStrategy: "none",
        boldOverdrawEm: 0,
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

  it("loads native bold once while overdraw loads only the regular face", async () => {
    const load = vi.fn().mockResolvedValue([{}]);
    vi.stubGlobal("document", { fonts: { load, ready: Promise.resolve() } });
    const native = createCharDeskFontProfile({
      id: "test/native-load",
      display: { families: { regular: "Native Regular", bold: "Native Bold" } },
    });
    const overdraw = createCharDeskFontProfile({
      id: "test/overdraw-load",
      display: { families: { regular: "Overdraw Regular" } },
    });

    try {
      await loadCharDeskCanvasFonts([{ grapheme: "A", bold: true }], { fontProfile: native });
      await loadCharDeskCanvasFonts([{ grapheme: "A", bold: true }], { fontProfile: overdraw });
      expect(load).toHaveBeenNthCalledWith(1, "700 15px Native Bold", "A");
      expect(load).toHaveBeenNthCalledWith(2, "15px Overdraw Regular", "A");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
