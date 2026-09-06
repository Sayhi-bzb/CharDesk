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
    expect(CHARDESK_SYSTEM_FONT_PROFILE.id).toBe("chardesk/system-v1");
    expect(CHARDESK_SYSTEM_FONT_PROFILE_ID).toBe(CHARDESK_SYSTEM_FONT_PROFILE.id);
    expect(CHARDESK_SYSTEM_FONT_PROFILE.families.text).toBe(
      CHARDESK_SYSTEM_FONT_FAMILY
    );
    expect(CHARDESK_SYSTEM_FONT_PROFILE.families.emoji).toContain("'Noto Emoji'");
    expect(CHARDESK_SYSTEM_FONT_PROFILE.families.emoji).toContain(CHARDESK_SYSTEM_FONT_FAMILY);
    expect(CHARDESK_SYSTEM_FONT_PROFILE.capabilities.display.families.regular).toBe(
      CHARDESK_SYSTEM_FONT_FAMILY
    );
    expect(CHARDESK_SYSTEM_FONT_PROFILE.capabilities.emoji.families.regular)
      .toBe(CHARDESK_SYSTEM_FONT_PROFILE.families.emoji);
    expect(CHARDESK_SYSTEM_FONT_PROFILE.sources.map(({ id }) => id)).toEqual([
      "noto-sans-symbols-2",
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
  });

  it("classifies graphemes by font capability without changing render routes", () => {
    expect(resolveCharDeskFontCapability("A")).toBe("display");
    expect(resolveCharDeskFontCapability("中")).toBe("cjk");
    expect(resolveCharDeskFontCapability("あ")).toBe("cjk");
    expect(resolveCharDeskFontCapability("。")).toBe("cjk");
    expect(resolveCharDeskFontCapability("，")).toBe("cjk");
    expect(resolveCharDeskFontCapability("\ue0b0")).toBe("nerd");
    expect(resolveCharDeskFontCapability("─")).toBe("symbol");
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
    ) as Record<string, Array<{ char: string }>>;
    const codePoints = new Set(
      Object.values(catalog).flat().map(({ char }) => char.codePointAt(0)!)
    );

    expect(codePoints.size).toBe(10_385);
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
    expect(manifest.assets.filter(({ path }) => path.endsWith(".woff2")).length).toBe(29);
  });
});
