import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

import { create } from "fontkit";
import { describe, expect, it } from "vitest";

const root = new URL("../../packages/font-xiaolai/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
const source = manifest.sources[0] as {
  id: string;
  family: string;
  version: string;
  binarySha256: string;
  subsets: Array<{ id: string; file: string; unicodeRange: string }>;
};
const fontAssets = manifest.assets.filter(
  ({ path }: { path: string }) => path.endsWith(".woff2")
);
const parseUnicodeRange = (value: string) => value.split(",").map((part) => {
  const match = part.trim().match(/^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/u);
  if (!match) throw new Error(`Invalid unicode-range: ${part}`);
  return [
    Number.parseInt(match[1]!, 16),
    Number.parseInt(match[2] ?? match[1]!, 16),
  ] as const;
});

describe("vendored Xiaolai Mono", () => {
  it("verifies the pinned package without network access", () => {
    const output = execFileSync(
      process.execPath,
      ["scripts/fonts/vendor-fonts.mjs", "--verify", "--target=xiaolai"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          HTTP_PROXY: "http://127.0.0.1:1",
          HTTPS_PROXY: "http://127.0.0.1:1",
        },
      }
    );
    expect(output).toContain("Verified 7 self-hosted xiaolai font assets.");
    expect(source).toMatchObject({
      id: "xiaolai-mono",
      family: "Xiaolai Mono",
      version: "3.126",
      binarySha256:
        "802b658db492e02ae5b659f5b56d7d4ef8f77609515bdcc82f462ae912888c33",
    });
    expect(readdirSync(new URL("assets/xiaolai-mono/", root)).sort()).toEqual([
      "OFL.txt",
      ...source.subsets.map(({ file }) => file),
    ].sort());
    const css = readFileSync(new URL("fonts.css", root), "utf8");
    expect(css).not.toMatch(/https?:|local\(/);
    for (const { file, unicodeRange } of source.subsets) {
      expect(css).toContain(`url(./assets/xiaolai-mono/${file})`);
      expect(css).toContain(`unicode-range: ${unicodeRange};`);
    }
  });

  it("preserves full coverage in five independently loadable shards", () => {
    expect(source.subsets.map(({ id }) => id)).toEqual([
      "base", "cjk-extension-a", "cjk-unified", "hangul", "supplementary",
    ]);
    expect(fontAssets).toHaveLength(5);
    expect(fontAssets.reduce(
      (bytes: number, asset: { size: number }) => bytes + asset.size,
      0
    )).toBe(11_929_788);
    expect(fontAssets.find(({ path }: { path: string }) =>
      path.endsWith("/base.woff2"))?.size).toBeLessThanOrEqual(700_000);

    const codePoints = new Set<number>();
    for (const subset of source.subsets) {
      const asset = fontAssets.find(({ path }: { path: string }) =>
        path.endsWith(`/${subset.file}`));
      if (!asset) throw new Error(`Missing ${subset.file}`);
      const bytes = readFileSync(new URL(asset.path, root));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
      const font = create(bytes);
      expect(font.unitsPerEm).toBe(1_000);
      expect(font.ascent).toBe(880);
      expect(font.descent).toBe(-144);
      const ranges = parseUnicodeRange(subset.unicodeRange);
      for (const codePoint of font.characterSet) {
        if (codePoint === 0xffff) continue;
        expect(ranges.some(([start, end]) =>
          codePoint >= start && codePoint <= end
        ), `out-of-range U+${codePoint.toString(16).toUpperCase()}`).toBe(true);
        expect(codePoints.has(codePoint),
          `duplicate U+${codePoint.toString(16).toUpperCase()}`).toBe(false);
        codePoints.add(codePoint);
      }
    }
    expect(codePoints.size).toBe(44_871);
  });

  it("keeps representative scripts and fixed advances", () => {
    for (const [file, text, advance] of [
      ["base.woff2", "A", 500],
      ["cjk-extension-a.woff2", "㐀", 1_000],
      ["cjk-unified.woff2", "世", 1_000],
      ["hangul.woff2", "한", 1_000],
      ["supplementary.woff2", "𲸰", 1_000],
    ] as const) {
      const font = create(readFileSync(new URL(`assets/xiaolai-mono/${file}`, root)));
      const codePoint = text.codePointAt(0)!;
      expect(font.hasGlyphForCodePoint(codePoint)).toBe(true);
      expect(font.glyphForCodePoint(codePoint).advanceWidth).toBe(advance);
    }
  });
});
