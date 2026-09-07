import { readFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  UNICODE_DATA_VERSION,
  WIDE_EAST_ASIAN_RANGES,
} from "../../packages/protocol/src/generated/eastAsianWidth";

const root = path.resolve("public/data/characters");
const manifest = JSON.parse(
  readFileSync(path.join(root, "manifest.json"), "utf8")
);
const readAsset = (relativePath: string) =>
  JSON.parse(readFileSync(path.join(root, relativePath), "utf8"));

describe("generated character catalog", () => {
  it("pins Unicode and Emoji versions with bounded main packs", () => {
    expect(manifest.unicodeVersion).toBe("17.0.0");
    expect(manifest.emojiVersion).toBe("17.0");
    expect(manifest.counts.main).toBeLessThanOrEqual(17_000);
    expect(manifest.counts.essentials).toBeLessThanOrEqual(2_000);
    expect(manifest.counts.unicode).toBeGreaterThan(150_000);
    const mainPackBytes = Object.values(manifest.packs).reduce(
      (total: number, assetPath) =>
        total + gzipSync(readFileSync(path.join(root, assetPath as string))).length,
      0
    );
    expect(mainPackBytes).toBeLessThanOrEqual(195 * 1024);
    expect(
      gzipSync(readFileSync(path.join(root, manifest.unicodeManifest))).length
    ).toBeLessThanOrEqual(40 * 1024);
  });

  it("builds purpose-driven Essentials with font coverage", () => {
    const asset = readAsset(manifest.packs.essentials);
    const groups = Object.fromEntries(
      asset.groups.map((group: { id: string }) => [group.id, group])
    );
    expect(groups.ascii.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ grapheme: "A", name: "LATIN CAPITAL LETTER A" }),
      ])
    );
    expect(groups.lines.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ grapheme: "─", coverage: expect.any(Number) }),
      ])
    );
    expect(groups.arrows.entries).toEqual(
      expect.arrayContaining([expect.objectContaining({ grapheme: "→" })])
    );
    expect(
      asset.groups.flatMap((group: { entries: unknown[] }) => group.entries)
    ).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ insertable: false }),
      ])
    );
  });

  it("keeps Emoji sequences and Nerd glyphs in separate packs", () => {
    const emoji = readAsset(manifest.packs.emoji);
    const nerd = readAsset(manifest.packs.nerd);
    expect(nerd.groups.flatMap((group: { entries: unknown[] }) => group.entries))
      .toHaveLength(10_995);
    expect(emoji.groups.flatMap((group: { entries: unknown[] }) => group.entries))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ grapheme: "👩🏽‍💻" }),
      ]));
    expect(nerd.groups.flatMap((group: { entries: unknown[] }) => group.entries))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ grapheme: expect.any(String), name: expect.any(String) }),
      ]));
  });

  it("provides lazy Block, Script, and Category facets", () => {
    const unicode = readAsset(manifest.unicodeManifest);
    expect(unicode.shardSize).toBe(1024);
    expect(Object.keys(unicode.shards).length).toBeGreaterThan(100);
    expect(unicode.facets.block).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Basic Latin", count: expect.any(Number) }),
      ])
    );
    expect(unicode.facets.script.length).toBeGreaterThan(100);
    expect(unicode.facets.category).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "So" })])
    );
  });

  it("keeps Unicode 17 East Asian width ranges sorted", () => {
    expect(UNICODE_DATA_VERSION).toBe("17.0.0");
    expect(
      WIDE_EAST_ASIAN_RANGES.every(
        ([start], index) =>
          index === 0 || WIDE_EAST_ASIAN_RANGES[index - 1][1] < start
      )
    ).toBe(true);
  });
});
