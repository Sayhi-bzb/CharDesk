import { describe, expect, it } from "vitest";
import { resolveCharDeskCanvasFontFace } from "@chardesk/rendering/canvas";
import { galleryFontOptions } from "./font-options";

const resolve = (id: "ark-prop" | "ark-mono", grapheme: string) =>
  resolveCharDeskCanvasFontFace({
    grapheme,
    route: "text",
    bold: false,
    italic: false,
    fontProfile: galleryFontOptions[id].profile,
  });

describe("Web TUI gallery font profiles", () => {
  for (const id of ["ark-prop", "ark-mono"] as const) {
    it(`routes Latin and CJK through ${id} without Canvas-only calibration`, () => {
      const option = galleryFontOptions[id];
      const display = resolve(id, "A");
      const cjk = resolve(id, "界");

      expect(display.family).toContain(option.label);
      expect(cjk.family).toBe(display.family);
      expect(display).toMatchObject({ capability: "display", fontSizeScale: 1, scaleX: 1, baselineShiftEm: 0 });
      expect(cjk).toMatchObject({ capability: "cjk", fontSizeScale: 1, scaleX: 1, baselineShiftEm: 0 });
      expect(option.fontSpec).toMatch(/^15px /);
      expect(option.loadSamples).toEqual(["AgWi09", "世界，。"]);
      expect(resolve(id, "\ue0b0").family).toMatch(/^'Symbols Nerd Font Mono'/);
      expect(resolve(id, "─").family).toMatch(/^'Noto Sans Symbols 2'/);
      expect(resolve(id, "👋").family).toMatch(/^'Noto Emoji'/);
    });
  }
});
