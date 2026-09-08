import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  CHARDESK_SYSTEM_FONT_PROFILE,
  CHARDESK_SYSTEM_FONT_PROFILE_ID,
  CHARDESK_SYSTEM_FONT_FAMILY,
  createCharDeskFontProfile,
  isNerdFontCodePoint,
  resolveCharDeskFontCapability,
} from "./index.js";

describe("core font profile", () => {
  it("keeps its stable id, routes, and pinned source versions together", () => {
    expect(CHARDESK_SYSTEM_FONT_PROFILE.id).toBe("chardesk/system-v5");
    expect(CHARDESK_SYSTEM_FONT_PROFILE_ID).toBe(CHARDESK_SYSTEM_FONT_PROFILE.id);
    expect(CHARDESK_SYSTEM_FONT_PROFILE.families.text).toBe(
      CHARDESK_SYSTEM_FONT_FAMILY
    );
    expect(CHARDESK_SYSTEM_FONT_PROFILE.families.emoji).toContain("'Noto Emoji'");
    expect(CHARDESK_SYSTEM_FONT_PROFILE.families.emoji).toContain(CHARDESK_SYSTEM_FONT_FAMILY);
    expect(CHARDESK_SYSTEM_FONT_PROFILE.capabilities.display.families.regular).toBe(
      CHARDESK_SYSTEM_FONT_FAMILY
    );
    expect(CHARDESK_SYSTEM_FONT_PROFILE.capabilities.display.boldStrategy).toBe("native");
    expect(CHARDESK_SYSTEM_FONT_PROFILE.capabilities["cell-glyph"].boldStrategy).toBe("none");
    expect(CHARDESK_SYSTEM_FONT_PROFILE.capabilities.emoji.families.regular)
      .toBe(CHARDESK_SYSTEM_FONT_PROFILE.families.emoji);
    expect(CHARDESK_SYSTEM_FONT_PROFILE.sources.map(({ id }) => id)).toEqual([
      "julia-mono",
      "noto-emoji",
      "symbols-nerd-font-mono",
    ]);
  });

  it("composes a replaceable display layer into core fallback stacks", () => {
    const profile = createCharDeskFontProfile({
      id: "test/display",
      display: { families: { regular: "Test Latin" } },
      cjk: { families: { regular: "Test CJK" } },
    });
    expect(profile.capabilities.display.families.regular).toBe("Test Latin");
    expect(profile.capabilities.cjk.families.regular).toBe("Test CJK");
    expect(profile.capabilities.nerd.families.regular).toContain("Symbols Nerd Font Mono");
    expect(profile.capabilities.symbol.families.regular).toContain("Test Latin");
    expect(profile.capabilities.symbol.families.regular).toContain("Test CJK");
    expect(profile.capabilities.symbol.families.regular.indexOf("Test Latin"))
      .toBeLessThan(profile.capabilities.symbol.families.regular.indexOf("JuliaMono"));
    expect(profile.capabilities.symbol.families.regular.indexOf("Test CJK"))
      .toBeLessThan(profile.capabilities.symbol.families.regular.indexOf("JuliaMono"));
    expect(profile.capabilities.display.boldStrategy).toBe("overdraw");
    expect(profile.capabilities.cjk.boldStrategy).toBe("overdraw");
    expect(profile.capabilities.symbol.boldStrategy).toBe("none");
  });

  it("keeps structural, symbol, Nerd, and emoji capabilities regular-only", () => {
    const profile = createCharDeskFontProfile({
      id: "test/display-weight",
      display: { families: { regular: "Display Regular", bold: "Display Bold" } },
      cjk: { families: { regular: "CJK Regular", bold: "CJK Bold" } },
    });

    expect(profile.capabilities.symbol.families.regular)
      .toBe("Display Regular, CJK Regular, 'JuliaMono'");
    expect(profile.capabilities.symbol.families.bold)
      .toBe("Display Bold, CJK Bold, 'JuliaMono'");
    expect(profile.capabilities["cell-glyph"].boldStrategy).toBe("none");
    expect(profile.capabilities.symbol.boldStrategy).toBe("none");
    expect(profile.capabilities.nerd.boldStrategy).toBe("none");
    expect(profile.capabilities.emoji.boldStrategy).toBe("none");
    expect(profile.capabilities.nerd.families.regular)
      .toMatch(/^'Symbols Nerd Font Mono'/);
    expect(profile.capabilities.emoji.families.regular)
      .toMatch(/^'Noto Emoji', 'JuliaMono'/);
  });

  it("normalizes the deprecated regular-only policy at the profile boundary", () => {
    const profile = createCharDeskFontProfile({
      id: "test/regular-display",
      display: { families: { regular: "Regular Only" }, weightPolicy: "regular" },
    });
    expect(profile.capabilities.display.boldStrategy).toBe("none");
    expect(profile.capabilities.symbol.boldStrategy).toBe("none");
    expect(profile.capabilities.symbol.families.regular).toContain("Regular Only");
    expect(profile.capabilities.nerd.boldStrategy).toBe("none");
    expect(profile.capabilities.emoji.boldStrategy).toBe("none");

    const legacyOverdraw = createCharDeskFontProfile({
      id: "test/legacy-overdraw",
      display: {
        families: { regular: "Regular Only" },
        weightPolicy: "regular",
        boldOverdrawEm: 1 / 15,
      },
    });
    expect(legacyOverdraw.capabilities.display.boldStrategy).toBe("overdraw");
    expect(legacyOverdraw.capabilities.display.boldOverdrawEm).toBe(1 / 15);
  });

  it("automatically uses native bold when declared and overdraw when absent", () => {
    const profile = createCharDeskFontProfile({
      id: "test/overdraw",
      display: { families: { regular: "Display" } },
      cjk: { families: { regular: "CJK" }, boldOverdrawEm: 1 / 15 },
    });

    expect(profile.capabilities.display.boldStrategy).toBe("overdraw");
    expect(profile.capabilities.cjk.boldStrategy).toBe("overdraw");
    expect(profile.capabilities.display.boldOverdrawEm).toBe(1 / 15);
    expect(profile.capabilities.cjk.boldOverdrawEm).toBe(1 / 15);
    expect(profile.capabilities["cell-glyph"].boldOverdrawEm).toBe(0);
    expect(profile.capabilities.symbol.boldOverdrawEm).toBe(0);
    expect(profile.capabilities.nerd.boldOverdrawEm).toBe(0);
    expect(profile.capabilities.emoji.boldOverdrawEm).toBe(0);

    const native = createCharDeskFontProfile({
      id: "test/native",
      display: { families: { regular: "Regular", bold: "Bold" } },
    });
    expect(native.capabilities.display.boldStrategy).toBe("native");
    expect(native.capabilities.display.boldOverdrawEm).toBe(0);
  });

  it("rejects contradictory or incomplete bold declarations", () => {
    expect(() => createCharDeskFontProfile({
      id: "test/conflict",
      display: {
        families: { regular: "Regular" },
        boldStrategy: "overdraw",
        weightPolicy: "regular",
      },
    })).toThrow(/cannot combine boldStrategy/);
    expect(() => createCharDeskFontProfile({
      id: "test/native-without-face",
      display: { families: { regular: "Regular" }, boldStrategy: "native" },
    })).toThrow(/requires families.bold/);
    expect(() => createCharDeskFontProfile({
      id: "test/invalid-overdraw",
      display: {
        families: { regular: "Regular" },
        boldStrategy: "overdraw",
        boldOverdrawEm: 0,
      },
    })).toThrow(/positive finite/);
  });

  it("classifies graphemes by font capability without changing render routes", () => {
    expect(resolveCharDeskFontCapability("A")).toBe("display");
    expect(resolveCharDeskFontCapability("中")).toBe("cjk");
    expect(resolveCharDeskFontCapability("あ")).toBe("cjk");
    expect(resolveCharDeskFontCapability("。")).toBe("cjk");
    expect(resolveCharDeskFontCapability("，")).toBe("cjk");
    expect(resolveCharDeskFontCapability("\ue0b0")).toBe("nerd");
    for (const glyph of ["┌", "─", "╭", "│", "█", "▀", "▄", "▌", "▐"]) {
      expect(resolveCharDeskFontCapability(glyph)).toBe("cell-glyph");
    }
    expect(resolveCharDeskFontCapability("∞")).toBe("symbol");
    expect(resolveCharDeskFontCapability("♥")).toBe("nerd");
    expect(resolveCharDeskFontCapability("♥️")).toBe("emoji");
    expect(resolveCharDeskFontCapability("👩🏽‍💻")).toBe("emoji");
  });

  it("covers every code point in the pinned Nerd Fonts catalog", async () => {
    const catalog = JSON.parse(
      await readFile(
        new URL("../../../scripts/data/sources/nerdfonts.json", import.meta.url),
        "utf8"
      )
    ) as Record<string, { char?: string }>;
    const entries = Object.entries(catalog).filter(([name]) => name !== "METADATA");
    const codePoints = new Set(entries.map(([, { char }]) => char!.codePointAt(0)!));

    expect(entries).toHaveLength(10_995);
    expect(codePoints.size).toBe(10_617);
    expect([...codePoints].every(isNerdFontCodePoint)).toBe(true);
  });

  it("matches the published canvas manifest without UI fonts", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../manifest.json", import.meta.url), "utf8")
    ) as {
      profileId: string;
      sources: Array<{ id: string; family: string; version: string }>;
      assets: Array<{ path: string; size: number }>;
    };

    expect(manifest.profileId).toBe(CHARDESK_SYSTEM_FONT_PROFILE.id);
    expect(
      manifest.sources.map(({ id, family, version }) => ({
        id,
        family,
        version,
      }))
    ).toEqual(CHARDESK_SYSTEM_FONT_PROFILE.sources);
    expect(manifest.sources.map(({ family }) => family)).not.toContain("Inter");
    expect(manifest.sources.map(({ family }) => family)).not.toContain(
      "Noto Sans SC"
    );
    expect(JSON.stringify(manifest)).not.toMatch(/maple/i);
    expect(manifest.assets.reduce((total, asset) => total + asset.size, 0)).toBeLessThan(5 * 1024 * 1024);
    expect(manifest.assets.filter(({ path }) => path.endsWith(".woff2")).length).toBe(45);
  });
});
