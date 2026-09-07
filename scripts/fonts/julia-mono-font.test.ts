import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { create } from "fontkit";
import { describe, expect, it } from "vitest";

const root = new URL("../../packages/fonts/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));

describe("vendored JuliaMono symbol fallback", () => {
  it("verifies the pinned Core assets without network access", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/fonts/vendor-fonts.mjs", "--verify", "--target=canvas-core"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          HTTP_PROXY: "http://127.0.0.1:1",
          HTTPS_PROXY: "http://127.0.0.1:1",
        },
      }
    );
    expect(output).toContain("Verified 49 self-hosted canvas-core font assets.");
    expect(manifest.sources[0]).toMatchObject({
      id: "julia-mono",
      family: "JuliaMono",
      version: "0.63.2",
    });
    const css = readFileSync(new URL("fonts.css", root), "utf8");
    expect(css).not.toMatch(/https?:|local\(/);
    const subsets = manifest.sources[0].subsets as Array<{
      file: string;
      unicodeRange: string;
    }>;
    expect(readdirSync(new URL("assets/julia-mono/", root)).sort()).toEqual([
      "OFL.txt",
      ...subsets.map(({ file }) => file),
    ].sort());
    for (const { file, unicodeRange } of subsets) {
      expect(css).toContain(`url(./assets/julia-mono/${file})`);
      expect(css).toContain(`unicode-range: ${unicodeRange};`);
    }
  });

  it("preserves full coverage across eight independently verified shards", () => {
    const assets = manifest.assets.filter(
      (entry: { path: string }) =>
        entry.path.startsWith("assets/julia-mono/") && entry.path.endsWith(".woff2")
    );
    expect(assets).toHaveLength(8);
    const fonts = assets.map((asset: { path: string; sha256: string }) => {
      const bytes = readFileSync(new URL(asset.path, root));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
      return create(bytes);
    });
    const codePoints = new Set(fonts.flatMap((font) => font.characterSet));
    codePoints.delete(0xffff); // Added by FontTools --recommended-glyphs.
    expect(codePoints.size).toBe(11_191);

    for (const [start, end] of [
      [0x2190, 0x21ff],
      [0x2200, 0x22ff],
      [0x2500, 0x257f],
      [0x2580, 0x259f],
      [0x2800, 0x28ff],
    ]) {
      for (let codePoint = start; codePoint <= end; codePoint += 1) {
        const font = fonts.find((candidate) => candidate.hasGlyphForCodePoint(codePoint));
        expect(font, `U+${codePoint.toString(16).toUpperCase()}`).toBeDefined();
        expect(font!.hasGlyphForCodePoint(codePoint))
          .toBe(true);
        expect(font!.glyphForCodePoint(codePoint).advanceWidth / font!.unitsPerEm)
          .toBeCloseTo(0.6, 5);
      }
    }
  });
});
