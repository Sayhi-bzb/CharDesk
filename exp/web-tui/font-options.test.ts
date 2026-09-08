import { describe, expect, it } from "vitest";
import { resolveCharDeskCanvasFontFace } from "@chardesk/rendering/canvas";
import { galleryFontOptions } from "./font-options";

const resolve = (id: "fusion-mono" | "xiaolai-mono", grapheme: string) =>
  resolveCharDeskCanvasFontFace({
    grapheme,
    route: "text",
    bold: false,
    italic: false,
    fontProfile: galleryFontOptions[id].profile,
  });

describe("Web TUI gallery font profiles", () => {
  it("derives native Maple bold and Fusion/Xiaolai overdraw", () => {
    for (const id of ["maple", "fusion-mono", "xiaolai-mono"] as const) {
      const face = resolveCharDeskCanvasFontFace({
        grapheme: "A", route: "text", bold: true, italic: false,
        fontProfile: galleryFontOptions[id].profile,
      });
      expect(face.boldStrategy).toBe(id === "maple" ? "native" : "overdraw");
      expect(face.boldOverdrawEm).toBe(id === "maple" ? 0 : 1 / 15);
    }
    expect(galleryFontOptions["fusion-mono"].profile.capabilities.display.families.bold).toBeUndefined();
    expect(galleryFontOptions["fusion-mono"].profile.capabilities.cjk.boldStrategy).toBe("overdraw");
    expect(resolve("fusion-mono", "∞").boldStrategy).toBe("none");
  });
  it("exposes selectable local fonts without grid overrides", () => {
    expect(Object.keys(galleryFontOptions)).toEqual(["maple", "fusion-mono", "xiaolai-mono"]);
    expect(galleryFontOptions["xiaolai-mono"].profile.capabilities.display.cellMetrics).toBeUndefined();
    expect(galleryFontOptions["fusion-mono"].profile.capabilities.display.cellMetrics).toBeUndefined();
    expect(galleryFontOptions.maple.profile.capabilities.display.cellMetrics).toBeUndefined();
  });
  it("routes the Xiaolai trial through the existing display/CJK stack", () => {
    const option = galleryFontOptions["xiaolai-mono"];
    expect(option.stylesheet).toBe("/fonts/xiaolai-mono/fonts.css");
    expect(option.fontSpec).toBe("15px 'Xiaolai Mono'");
    expect(option.loadSamples).toEqual(["AgWi09", "世界，。"]);
    for (const text of ["A", "界", "│", "█", "→"]) {
      expect(resolve("xiaolai-mono", text)).toMatchObject({
        family: expect.stringMatching(/^'Xiaolai Mono'.*Maple Mono/),
        fontSizeScale: 1, scaleX: 1, baselineShiftEm: 0,
        boldStrategy: text === "A" || text === "界" ? "overdraw" : "none",
        boldOverdrawEm: text === "A" || text === "界" ? 1 / 15 : 0,
      });
    }
    expect(resolve("xiaolai-mono", "👋").family).toMatch(/^'Noto Emoji'/);
    expect(resolve("xiaolai-mono", "\ue0b0").family).toMatch(/^'Symbols Nerd Font Mono'/);
  });
  for (const id of ["fusion-mono"] as const) {
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
      expect(option.profile.id).toBe(`chardesk/gallery-${id}-maple-core-v6-2026.09.01`);
      expect(option.stylesheet).not.toMatch(/^https?:/);
      expect(option.profile.sources).toContainEqual(expect.objectContaining({ id: "fusion-mono", version: "2026.09.01" }));
      expect(resolve(id, "\ue0b0").family).toMatch(/^'Symbols Nerd Font Mono'/);
      expect(resolve(id, "∞").family).toMatch(/^'Fusion Pixel 12px/);
      expect(resolve(id, "∞").family.indexOf("Fusion Pixel 12px"))
        .toBeLessThan(resolve(id, "∞").family.indexOf("JuliaMono"));
      expect(resolve(id, "👋").family).toMatch(/^'Noto Emoji'/);
    });
  }
});
