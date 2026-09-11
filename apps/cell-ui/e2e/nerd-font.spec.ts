import { expect, test } from "@playwright/test";

const cases = [
  [0xf0001, "material-design-01.woff2"],
  [0xed00, "font-awesome-01.woff2"],
  [0xea60, "codicons.woff2"],
  [0xe0a0, "powerline-symbols.woff2"],
] as const;

test("loads one bounded Nerd shard for each representative glyph", async ({ page }) => {
  await page.goto("/#/__fixtures/all");

  for (const [codePoint, file] of cases) {
    const response = page.waitForResponse((candidate) =>
      new URL(candidate.url()).pathname.endsWith(
        `/assets/symbols-nerd-font-mono/${file}`
      ));
    const loaded = page.evaluate(async (value) => {
      const glyph = String.fromCodePoint(value);
      return (await document.fonts.load(
        '15px "Symbols Nerd Font Mono"',
        glyph
      )).map(({ family }) => family);
    }, codePoint);
    await expect((await response).ok()).toBe(true);
    await expect(loaded).resolves.toEqual(["Symbols Nerd Font Mono"]);
  }
});
