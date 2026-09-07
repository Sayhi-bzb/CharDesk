import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GRID_RENDER_METRICS,
  drawCellBatch,
  drawCellBackground,
  drawCellText,
  getCellOccupancy,
  getRenderFontFamily,
  getTextCellWidth,
  gridCellRect,
  gridToScreen,
  isWideCell,
  loadRenderFonts,
  resolveCellVisual,
  resolveRenderFontRoute,
  screenToGrid,
  splitGraphemes,
} from "@/shared/metrics";

describe("metrics", () => {
  describe("splitGraphemes", () => {
    it("keeps combining marks and emoji modifiers together", () => {
      expect(splitGraphemes("e\u0301x")).toEqual(["e\u0301", "x"]);
      expect(splitGraphemes("👋🏽x")).toEqual(["👋🏽", "x"]);
    });

    it("keeps zwj emoji clusters together when Intl.Segmenter supports them", () => {
      expect(splitGraphemes("👨‍👩‍👧‍👦x")[0]).toBe("👨‍👩‍👧‍👦");
    });
  });

  describe("cell occupancy", () => {
    it("treats ASCII as one cell", () => {
      expect(getCellOccupancy("A")).toBe(1);
      expect(getTextCellWidth("abc")).toBe(3);
    });

    it("treats CJK and emoji as wide cells, and private-use glyphs as narrow cells", () => {
      expect(getCellOccupancy("你")).toBe(2);
      expect(getCellOccupancy("👋")).toBe(2);
      expect(getCellOccupancy("\ue0b0")).toBe(1);
      expect(isWideCell("你")).toBe(true);
      expect(isWideCell("\ue0b0")).toBe(false);
    });

    it("uses Unicode 17 East Asian width and grapheme-aware emoji width", () => {
      expect(getCellOccupancy("𠀀")).toBe(2);
      expect(getCellOccupancy("Ａ")).toBe(2);
      expect(getCellOccupancy("·")).toBe(1);
      expect(getCellOccupancy("🇨🇳")).toBe(2);
      expect(getCellOccupancy("1️⃣")).toBe(2);
      expect(getCellOccupancy("👩🏽‍💻")).toBe(2);
    });

    it("sums mixed text by grapheme occupancy", () => {
      expect(getTextCellWidth("A你👋")).toBe(5);
    });
  });

  describe("font routing", () => {
    it("routes text and complete emoji graphemes to stable font stacks", () => {
      expect(resolveRenderFontRoute("A")).toBe("text");
      expect(resolveRenderFontRoute("╭")).toBe("text");
      expect(resolveRenderFontRoute("♥")).toBe("text");
      expect(resolveRenderFontRoute("♥️")).toBe("emoji");
      expect(resolveRenderFontRoute("🇨🇳")).toBe("emoji");
      expect(resolveRenderFontRoute("1️⃣")).toBe("emoji");
      expect(resolveRenderFontRoute("👩🏽‍💻")).toBe("emoji");
      expect(getRenderFontFamily("text")).toContain("Maple Mono NF CN");
      expect(getRenderFontFamily("emoji")).toMatch(/^'Noto Emoji'/);
    });

    it("loads unique actual graphemes by route", async () => {
      const originalFonts = document.fonts;
      const load = vi.fn().mockResolvedValue([]);
      Object.defineProperty(document, "fonts", {
        configurable: true,
        value: { load, ready: Promise.resolve([]) },
      });

      try {
        await loadRenderFonts(["A", "A", "⟹", "👩🏽‍💻"]);
        expect(load).toHaveBeenCalledTimes(3);
        expect(load.mock.calls[0][0]).toContain("Maple Mono NF CN");
        expect(load.mock.calls[0][1]).toBe("A");
        expect(load.mock.calls[1][0]).toContain("JuliaMono");
        expect(load.mock.calls[1][1]).toBe("⟹");
        expect(load.mock.calls[2][0]).toContain("Noto Emoji");
        expect(load.mock.calls[2][1]).toBe("👩🏽‍💻");
      } finally {
        Object.defineProperty(document, "fonts", {
          configurable: true,
          value: originalFonts,
        });
      }
    });

    it("loads styled text samples with their requested weight", async () => {
      const originalFonts = document.fonts;
      const load = vi.fn().mockResolvedValue([]);
      Object.defineProperty(document, "fonts", {
        configurable: true,
        value: { load, ready: Promise.resolve([]) },
      });

      try {
        await loadRenderFonts([
          { grapheme: "A", bold: true },
          { grapheme: "B", bold: true },
          { grapheme: "C" },
        ]);
        expect(load).toHaveBeenCalledTimes(2);
        expect(load.mock.calls[0][0]).toContain("700");
        expect(load.mock.calls[0][1]).toBe("AB");
        expect(load.mock.calls[1][0]).not.toContain("700");
        expect(load.mock.calls[1][1]).toBe("C");
      } finally {
        Object.defineProperty(document, "fonts", {
          configurable: true,
          value: originalFonts,
        });
      }
    });
  });

  describe("viewport conversion", () => {
    it("converts grid and screen coordinates through shared metrics", () => {
      const viewport = { offset: { x: 10, y: 20 }, zoom: 2 };
      const screen = gridToScreen(3, 4, viewport);
      expect(screen).toEqual({
        x: 10 + 3 * DEFAULT_GRID_RENDER_METRICS.cellWidth * 2,
        y: 20 + 4 * DEFAULT_GRID_RENDER_METRICS.cellHeight * 2,
      });
      expect(screenToGrid(screen.x, screen.y, viewport)).toEqual({ x: 3, y: 4 });
    });

    it("returns cell rects from the same viewport model", () => {
      const rect = gridCellRect(
        { x: 2, y: 3 },
        { offset: { x: 5, y: 7 }, zoom: 1.5 }
      );
      expect(rect).toEqual({
        x: 5 + 2 * DEFAULT_GRID_RENDER_METRICS.cellWidth * 1.5,
        y: 7 + 3 * DEFAULT_GRID_RENDER_METRICS.cellHeight * 1.5,
        width: DEFAULT_GRID_RENDER_METRICS.cellWidth * 1.5,
        height: DEFAULT_GRID_RENDER_METRICS.cellHeight * 1.5,
      });
    });
  });

  describe("cell rendering passes", () => {
    const createContext = () => {
      let font = "";
      return {
        save: vi.fn(),
        scale: vi.fn(),
        restore: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        translate: vi.fn(),
        set fillStyle(_value: string) {},
        get font() {
          return font;
        },
        set font(value: string) {
          font = value;
        },
        set textBaseline(_value: CanvasTextBaseline) {},
        set textAlign(_value: CanvasTextAlign) {},
        set strokeStyle(_value: string) {},
        set lineWidth(_value: number) {},
      } as unknown as CanvasRenderingContext2D;
    };

    it("keeps background drawing separate from glyph drawing", () => {
      const ctx = createContext();
      const cell = { char: "\ue0b0", color: "#111111", bgColor: "#eeeeee" };

      drawCellBackground(ctx, cell, 0, 0);
      drawCellText(ctx, cell, 0, 0);

      expect(ctx.fillRect).toHaveBeenCalledTimes(1);
      expect(ctx.fillText).toHaveBeenCalledTimes(1);
      expect(ctx.fillRect).toHaveBeenCalledWith(
        0,
        0,
        DEFAULT_GRID_RENDER_METRICS.cellWidth,
        DEFAULT_GRID_RENDER_METRICS.cellHeight
      );
    });

    it("resolves inverse colors before any renderer consumes the cell", () => {
      expect(
        resolveCellVisual({
          char: "A",
          color: "#ff0000",
          bgColor: "#0000ff",
          attrs: { inverse: true, bold: true },
        })
      ).toMatchObject({
        color: "#0000ff",
        bgColor: "#ff0000",
        attrs: { inverse: true, bold: true },
        occupancy: 1,
        fontRoute: "text",
      });
    });

    it("draws every background before drawing any glyph", () => {
      let fillStyle = "";
      const operations: string[] = [];
      const ctx = {
        save: vi.fn(),
        restore: vi.fn(),
        fillRect: vi.fn(() => operations.push(`background:${fillStyle}`)),
        fillText: vi.fn(() => operations.push(`text:${fillStyle}`)),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        set fillStyle(value: string) {
          fillStyle = value;
        },
        set font(_value: string) {},
        set textBaseline(_value: CanvasTextBaseline) {},
        set textAlign(_value: CanvasTextAlign) {},
        set strokeStyle(_value: string) {},
        set lineWidth(_value: number) {},
      } as unknown as CanvasRenderingContext2D;

      drawCellBatch(ctx, [
        { cell: { char: "A", color: "#111", bgColor: "#aaa" }, x: 0, y: 0 },
        { cell: { char: "B", color: "#222", bgColor: "#bbb" }, x: 9, y: 0 },
      ]);

      expect(operations).toEqual([
        "background:#aaa",
        "background:#bbb",
        "text:#111",
        "text:#222",
      ]);
    });

    it("uses the effective inverse color for glyphs and decorations", () => {
      let fillStyle = "";
      let strokeStyle = "";
      const ctx = {
        save: vi.fn(),
        restore: vi.fn(),
        fillText: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        set fillStyle(value: string) {
          fillStyle = value;
        },
        set strokeStyle(value: string) {
          strokeStyle = value;
        },
        set font(_value: string) {},
        set textBaseline(_value: CanvasTextBaseline) {},
        set textAlign(_value: CanvasTextAlign) {},
        set lineWidth(_value: number) {},
      } as unknown as CanvasRenderingContext2D;

      drawCellText(
        ctx,
        {
          char: "A",
          color: "#ff0000",
          bgColor: "#ffffff",
          attrs: { inverse: true, underline: true, strike: true },
        },
        0,
        0
      );

      expect(fillStyle).toBe("#ffffff");
      expect(strokeStyle).toBe("#ffffff");
      expect(ctx.stroke).toHaveBeenCalledTimes(2);
    });

    it("draws text decorations in the text pass without repainting background", () => {
      const ctx = createContext();
      const cell = {
        char: "A",
        color: "#111111",
        bgColor: "#eeeeee",
        attrs: { underline: true, strike: true } as const,
      };

      drawCellText(ctx, cell, 0, 0);

      expect(ctx.fillRect).not.toHaveBeenCalled();
      expect(ctx.fillText).toHaveBeenCalledTimes(1);
      expect(ctx.stroke).toHaveBeenCalledTimes(2);
    });

    it("uses the monochrome emoji stack for emoji cells", () => {
      const textCtx = createContext();
      const emojiCtx = createContext();
      drawCellText(textCtx, { char: "A", color: "#ff0000" }, 0, 0);
      drawCellText(emojiCtx, { char: "👩🏽‍💻", color: "#ff0000" }, 0, 0);

      expect(textCtx.font).toContain("Maple Mono NF CN");
      expect(textCtx.font).not.toMatch(/^.*Noto Emoji/);
      expect(emojiCtx.font).toContain("Noto Emoji");
    });
  });
});
