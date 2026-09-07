import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { create } from "fontkit";
import { describe, expect, it } from "vitest";

const root = new URL("../../packages/font-ark/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));

describe("vendored Ark Mono", () => {
  it("verifies the pinned local release without network access", () => {
    const output = execFileSync(process.execPath, ["scripts/fonts/vendor-fonts.mjs", "--verify", "--target=ark"], {
      encoding: "utf8",
      env: { ...process.env, HTTP_PROXY: "http://127.0.0.1:1", HTTPS_PROXY: "http://127.0.0.1:1" },
    });
    expect(output).toContain("Verified 3 self-hosted ark font assets.");
    expect(manifest.sources[0].version).toBe("2026.09.01");
    const css = readFileSync(new URL("fonts.css", root), "utf8");
    expect(css).not.toMatch(/https?:|local\(/);
  });

  it("uses the official full font, including real CJK and full-width symbols", () => {
    const asset = manifest.assets.find((entry: { path: string }) => entry.path.endsWith(".woff2"));
    const bytes = readFileSync(new URL(asset.path, root));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
    const font = create(bytes);
    for (const text of "A世界│█▀▄─┌└→") {
      expect(font.hasGlyphForCodePoint(text.codePointAt(0)!)).toBe(true);
      const advance = font.glyphForCodePoint(text.codePointAt(0)!).advanceWidth * 15 / font.unitsPerEm;
      expect(advance).toBe(text === "A" ? 7.5 : 15);
    }
  });
});
