import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

import { create } from "fontkit";
import { describe, expect, it } from "vitest";

import {
  formatNerdFontRangesModule,
  groupNerdFontCatalog,
  nerdFontCodePoints,
} from "./nerd-font-catalog.mjs";
import { MAX_NERD_FONT_SHARD_BYTES } from "./nerd-font-subsets.mjs";

const root = new URL("../../packages/fonts/", import.meta.url);
const catalog = JSON.parse(readFileSync(
  new URL("../data/sources/nerdfonts.json", import.meta.url),
  "utf8"
));
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
const nerdAssets = manifest.assets.filter(
  ({ path }: { path: string }) =>
    path.startsWith("assets/symbols-nerd-font-mono/") && path.endsWith(".woff2")
);

const expandCssRanges = (value: string) => {
  const codePoints = [];
  for (const part of value.split(",")) {
    const match = part.trim().match(/^U\+([0-9A-F]+)(?:-([0-9A-F]+))?$/u);
    if (!match) throw new Error(`Invalid CSS unicode-range: ${part}`);
    const start = Number.parseInt(match[1]!, 16);
    const end = Number.parseInt(match[2] ?? match[1]!, 16);
    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      codePoints.push(codePoint);
    }
  }
  return codePoints;
};

describe("vendored Symbols Nerd Font Mono", () => {
  it("pins the complete official 3.5.1 catalog and generated runtime ranges", () => {
    expect(catalog.METADATA.version).toBe("3.5.1");
    expect(Object.keys(catalog)).toHaveLength(10_996);
    expect(nerdFontCodePoints(catalog).size).toBe(10_617);
    expect(groupNerdFontCatalog(catalog).map(({ id }) => id)).toEqual([
      "seti-ui-custom", "devicons", "font-awesome", "font-awesome-ext",
      "material-design", "weather-icons", "octicons", "powerline-symbols",
      "powerline-extra", "iec-power", "font-logos", "pomicons", "codicons",
      "progress-indicators",
    ]);
    expect(readFileSync(
      new URL("src/generated/nerd-font-ranges.ts", root),
      "utf8"
    )).toBe(formatNerdFontRangesModule(catalog));
  });

  it("keeps semantic shards independently loadable and under 96 KiB", () => {
    expect(nerdAssets).toHaveLength(27);
    expect(readdirSync(new URL("assets/symbols-nerd-font-mono/", root)).sort())
      .toEqual(["LICENSE.txt", ...nerdAssets.map(({ path }: { path: string }) =>
        path.split("/").at(-1)!)].sort());

    const shardCodePoints = new Set<number>();
    for (const asset of nerdAssets) {
      const bytes = readFileSync(new URL(asset.path, root));
      expect(bytes.length).toBeLessThanOrEqual(MAX_NERD_FONT_SHARD_BYTES);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
      const font = create(bytes);
      for (const codePoint of font.characterSet) {
        if (codePoint === 0xffff) continue;
        expect(shardCodePoints.has(codePoint),
          `duplicate U+${codePoint.toString(16).toUpperCase()}`).toBe(false);
        shardCodePoints.add(codePoint);
        expect(font.glyphForCodePoint(codePoint).advanceWidth / font.unitsPerEm)
          .toBeCloseTo(1, 5);
      }
    }
    expect(shardCodePoints).toEqual(nerdFontCodePoints(catalog));
  });

  it("gives each catalog code point exactly one CSS shard owner", () => {
    const css = readFileSync(new URL("fonts.css", root), "utf8");
    const nerdCss = css.slice(css.indexOf("/* Symbols Nerd Font Mono 3.5.1 */"));
    const owners = new Map<number, number>();
    for (const match of nerdCss.matchAll(/unicode-range:\s*([^;]+);/gu)) {
      for (const codePoint of expandCssRanges(match[1]!)) {
        owners.set(codePoint, (owners.get(codePoint) ?? 0) + 1);
      }
    }
    expect(new Set(owners.keys())).toEqual(nerdFontCodePoints(catalog));
    expect([...owners.values()].every((count) => count === 1)).toBe(true);
    for (const family of ["material-design", "font-awesome", "codicons", "powerline-symbols"]) {
      expect(nerdCss).toMatch(new RegExp(`/${family}(?:-\\d+)?\\.woff2\\)`));
    }
  });
});
