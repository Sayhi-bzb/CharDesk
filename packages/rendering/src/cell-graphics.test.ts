import { describe, expect, it, vi } from "vitest";
import { cellGraphicDefinitions } from "./cell-graphics-definitions.js";
import { drawCharDeskCanvasCells, loadCharDeskCanvasFonts, resolveCharDeskCanvasGlyphSource } from "./canvas.js";
import { resolveCharDeskCellVisual } from "./index.js";

describe("Cell graphics", () => {
  it("covers exactly 160 single Unicode characters, without swallowing combining marks", () => {
    expect(Object.keys(cellGraphicDefinitions)).toHaveLength(160);
    for (let cp = 0x2500; cp <= 0x259f; cp++) {
      const text = String.fromCodePoint(cp);
      expect(cellGraphicDefinitions[text]).toBeDefined();
      expect(resolveCharDeskCanvasGlyphSource(text)).toBe("cell-graphics");
    }
    for (const text of ["", "A", "界", "👋", "\ue0b0", "─\u0301", "──", "█\ufe0f"]) {
      expect(resolveCharDeskCanvasGlyphSource(text)).toBe("font");
    }
  });

  it("does not load fonts or modify source cells for structural graphics", async () => {
    const load = vi.fn();
    vi.stubGlobal("document", { fonts: { load, ready: Promise.resolve() } });
    try {
      expect(await loadCharDeskCanvasFonts(["█", "╭", "─"])).toEqual({ text: true, emoji: true });
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
