import { expect, test } from "@playwright/test";

const cases = [
  [0xf0001, "material-design-01.woff2"],
  [0xed00, "font-awesome-01.woff2"],
  [0xea60, "codicons.woff2"],
  [0xe0a0, "powerline-symbols.woff2"],
] as const;

test("loads one bounded Nerd shard for each representative glyph", async ({ page }) => {
  const responses = new Map<string, boolean[]>();
  page.on("response", (response) => {
    const file = new URL(response.url()).pathname.split("/").at(-1);
    if (!file || !response.url().includes("/assets/symbols-nerd-font-mono/")) return;
    responses.set(file, [...responses.get(file) ?? [], response.ok()]);
  });
  await page.route("**/assets/symbols-nerd-font-mono/*.woff2", (route) => route.continue());
  await page.goto("/#/__fixtures/text");
  await expect(page.locator('[data-cell-probe="component-text"]')).toBeAttached();

  for (const [codePoint, file] of cases) {
    const loaded = await page.evaluate(async (value) => {
      const glyph = String.fromCodePoint(value);
      return (await document.fonts.load(
        '15px "Symbols Nerd Font Mono"',
        glyph
      )).map(({ family }) => family);
    }, codePoint);
    expect(loaded).toEqual(["Symbols Nerd Font Mono"]);
    await expect.poll(() => responses.get(file)).toEqual([true]);
  }
});
