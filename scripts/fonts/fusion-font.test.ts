import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { create } from "fontkit";
import { describe, expect, it } from "vitest";

const root = new URL("../../packages/font-fusion/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));

describe("vendored Fusion Mono", () => {
  it("verifies the pinned local release without network access", () => {
    const output = execFileSync(process.execPath, ["scripts/fonts/vendor-fonts.mjs", "--verify", "--target=fusion"], {
      encoding: "utf8",
      env: { ...process.env, HTTP_PROXY: "http://127.0.0.1:1", HTTPS_PROXY: "http://127.0.0.1:1" },
    });
    expect(output).toContain("Verified 6 self-hosted fusion font assets.");
    expect(manifest.sources[0].version).toBe("2026.09.01");
    const css = readFileSync(new URL("fonts.css", root), "utf8");
    expect(css).not.toMatch(/https?:|local\(/);
  });

  it("uses the official full font with supplemental CJK, Hangul, and stable Cell metrics", () => {
    const asset = manifest.assets.find((entry: { path: string }) => entry.path.endsWith(".woff2"));
    const bytes = readFileSync(new URL(asset.path, root));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
    const font = create(bytes);
    expect(font.characterSet).toHaveLength(36_539);
    expect(font.unitsPerEm).toBe(1_200);
    expect(font.ascent).toBe(1_000);
    expect(font.descent).toBe(-200);
    expect(font.lineGap).toBe(0);
    for (const text of "A世界势垦한│█▀▄─┌└→") {
      expect(font.hasGlyphForCodePoint(text.codePointAt(0)!)).toBe(true);
      const advance = font.glyphForCodePoint(text.codePointAt(0)!).advanceWidth * 15 / font.unitsPerEm;
      expect(advance).toBe(text === "A" ? 7.5 : 15);
    }
  });
});
