import { describe, expect, it, vi } from "vitest";
import { MAPLE_FONT_PROFILE } from "@chardesk/font-maple";
import { createCharDeskFontProfile } from "@chardesk/fonts";
import { resolveCharDeskCanvasFontFace, resolveCharDeskCanvasGlyphSource } from "@chardesk/rendering/canvas";
import { createCellUiFontProfile } from "./browser-font-profile.js";

describe("Cell UI glyph routing", () => {
  it("preserves font profiles while structural cells bypass fonts", () => {
    const surface = createCellUiFontProfile(MAPLE_FONT_PROFILE);
    for (const grapheme of ["─", "│", "╭", "└", "█", "▀", "▄", "▐"]) {
      const request = { grapheme, route: "text", bold: true, italic: false } as const;
      const documentFace = resolveCharDeskCanvasFontFace({ ...request, fontProfile: MAPLE_FONT_PROFILE });
      const surfaceFace = resolveCharDeskCanvasFontFace({ ...request, fontProfile: surface });
      expect(documentFace.family).toContain("Maple");
      expect(surfaceFace).toEqual(documentFace);
      expect(resolveCharDeskCanvasGlyphSource(grapheme)).toBe("cell-graphics");
    }
    expect(surface.capabilities.display).toBe(MAPLE_FONT_PROFILE.capabilities.display);
    expect(surface.capabilities.symbol).toBe(MAPLE_FONT_PROFILE.capabilities.symbol);
  });

  it("does not replace a consumer's font classifier", () => {
    const base = createCharDeskFontProfile({ id: "custom", display: { families: { regular: "Custom" } } });
    const classify = vi.fn(() => "cjk" as const);
    const surface = createCellUiFontProfile({ ...base, resolveCapability: classify });
    expect(resolveCharDeskCanvasGlyphSource("╭")).toBe("cell-graphics");
    expect(surface.resolveCapability("╭")).toBe("cjk");
    expect(surface.resolveCapability("A")).toBe("cjk");
    expect(classify).toHaveBeenCalledWith("A");
  });
});
