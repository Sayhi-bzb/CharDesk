import { describe, expect, it, vi } from "vitest";
import { cellGraphicDefinitions } from "./cell-graphics-definitions.js";
import { CELL_GRAPHICS_VERSION, drawCharDeskCanvasCells, loadCharDeskCanvasFonts, resolveCharDeskCanvasGlyphSource } from "./canvas.js";
import { resolveCharDeskCellVisual } from "./index.js";

describe("Cell graphics", () => {
  it("covers the pinned 778-character set without swallowing composites", () => {
    expect(CELL_GRAPHICS_VERSION).toBe("xterm-cell-graphics-v5");
    const characters = Object.keys(cellGraphicDefinitions);
    expect(characters).toHaveLength(778);
    const codePoints = characters.map(text => text.codePointAt(0)!);
    const count = (start: number, end: number) => codePoints.filter(cp => cp >= start && cp <= end).length;
    expect({
      box: count(0x2500, 0x257f),
      block: count(0x2580, 0x259f),
      braille: count(0x2800, 0x28ff),
      powerline: codePoints.filter(cp => cp >= 0xe0a0 && cp <= 0xe0d4).length,
      progress: count(0xee00, 0xee0b),
      gitBranch: count(0xf5d0, 0xf60d),
      legacy: count(0x1fb00, 0x1fbff),
    }).toEqual({ box: 128, block: 32, braille: 256, powerline: 38, progress: 12, gitBranch: 62, legacy: 250 });
    for (const text of characters) expect(resolveCharDeskCanvasGlyphSource(text)).toBe("cell-graphics");
    for (const text of ["", "A", "界", "👋", "\ue0d6", "─\u0301", "──", "█\ufe0f"]) {
      expect(resolveCharDeskCanvasGlyphSource(text)).toBe("font");
    }
  });

  it("does not load fonts or modify source cells for structural graphics", async () => {
    const load = vi.fn();
    vi.stubGlobal("document", { fonts: { load, ready: Promise.resolve() } });
    try {
      expect(await loadCharDeskCanvasFonts(["█", "╭", "─", "⣿", "\ue0b0", "\uf5ee", "\u{1fb95}"])).toEqual({ text: true, emoji: true });
      expect(load).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
    const calls: string[] = [];
    const ctx = new Proxy({ fillStyle: "", getTransform: () => ({ a: 1, b: 0, c: 0, d: 1 }) }, {
      get(target, key) { return key in target ? Reflect.get(target, key) : () => calls.push(String(key)); },
    }) as unknown as CanvasRenderingContext2D;
    const entries = Object.keys(cellGraphicDefinitions).map((text, i) => ({
      cell: resolveCharDeskCellVisual({ text }), x: i * 9, y: 0,
    }));
    const before = JSON.stringify(entries);
    drawCharDeskCanvasCells(ctx, entries);
    expect(JSON.stringify(entries)).toBe(before);
    expect(calls).not.toContain("fillText");
    expect(calls).toContain("arc");
  });
});
