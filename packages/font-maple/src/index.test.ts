import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  MAPLE_FONT_FACE,
  MAPLE_FONT_FAMILY,
  MAPLE_FONT_PROFILE,
  MAPLE_FONT_SOURCES,
} from "./index.js";

describe("Maple display font pack", () => {
  it("composes Maple display and CJK with independent core fallbacks", () => {
    expect(MAPLE_FONT_PROFILE.id).toBe("chardesk/maple-v4");
    expect(MAPLE_FONT_PROFILE.capabilities.display.families.regular).toBe(MAPLE_FONT_FAMILY);
    expect(MAPLE_FONT_PROFILE.capabilities.cjk.families.regular).toBe(MAPLE_FONT_FAMILY);
    expect(MAPLE_FONT_PROFILE.capabilities.nerd.families.regular).toContain("Symbols Nerd Font Mono");
    expect(MAPLE_FONT_PROFILE.capabilities.symbol.families.regular).toContain("Maple Mono NF CN");
    expect(MAPLE_FONT_PROFILE.capabilities.symbol.families.regular.indexOf("Maple Mono NF CN"))
      .toBeLessThan(MAPLE_FONT_PROFILE.capabilities.symbol.families.regular.indexOf("JuliaMono"));
    expect(MAPLE_FONT_FACE.families.regular).toBe(MAPLE_FONT_FAMILY);
    expect(MAPLE_FONT_SOURCES).toHaveLength(2);
  });

  it("matches its package manifest", async () => {
    const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
    expect(manifest.profileId).toBe(MAPLE_FONT_PROFILE.id);
    expect(manifest.sources.map(({ id }: { id: string }) => id)).toEqual([
      "maple-mono-nf-cn", "maple-mono-nf-cn-bold",
    ]);
  });
});
