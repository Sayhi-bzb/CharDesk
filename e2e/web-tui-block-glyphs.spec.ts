import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

type GlyphCall = Readonly<{ text: string; font: string }>;

test("component chrome uses Cell graphics across all display fonts without JuliaMono", async ({ page }) => {
  await page.route(/julia-mono/i, route => route.abort());
  await page.addInitScript(() => {
    const calls: Array<{ text: string; font: string }> = [];
    Object.defineProperty(window, "__chardeskGlyphCalls", { value: calls });
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (
      text: string,
      x: number,
      y: number,
      maxWidth?: number
    ) {
      calls.push({ text, font: this.font });
      if (maxWidth === undefined) original.call(this, text, x, y);
      else original.call(this, text, x, y, maxWidth);
    };
  });
  await page.goto("/exp/web-tui/#/__fixtures/all");

  const glyphCalls = () => page.evaluate(() =>
    (window as Window & { __chardeskGlyphCalls: GlyphCall[] }).__chardeskGlyphCalls);
  await expect.poll(async () => {
    const probe = await readCellProbe(page.locator('[data-cell-probe="editor"]'));
    const cells = probe.presentation?.cellGraphics?.cells ?? [];
    return {
      border: cells.some(({ text }) => "┌─│".includes(text)),
    };
  }).toEqual({ border: true });

  await page.getByRole("button", { name: "Rounded", exact: true }).click();
  await expect.poll(async () => (await readCellProbe(page.locator('[data-cell-probe="editor"]')))
    .presentation?.cellGraphics?.cells.some(({ text }) => text === "╭")).toBe(true);

  for (const [label, id, family] of [
    ["Ark Pixel 12px Mono", "ark-mono", "Ark Pixel"],
    ["Xiaolai Mono", "xiaolai-mono", "Xiaolai Mono"],
    ["Maple Mono", "maple", "Maple Mono"],
  ]) {
    await page.evaluate(() => { (window as Window & { __chardeskGlyphCalls: GlyphCall[] }).__chardeskGlyphCalls.length = 0; });
    await page.getByRole("button", { name: `Use ${label}` }).click();
    await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-font", id);
    await expect.poll(async () => (await glyphCalls()).some(({ text, font }) =>
      /^[A-Za-z]$/.test(text) && font.includes(family))).toBe(true);
    const boxes = (await glyphCalls()).filter(({ text }) => /^[\u2500-\u259F]$/u.test(text));
    expect(boxes).toHaveLength(0);
    const expandedGraphics = (await glyphCalls()).filter(({ text }) =>
      ["⣿", "\ue0b0", "\uee03", "\uf5ee", "\u{1fb95}", "\u{1fbb0}", "\u{1fbc5}"].includes(text));
    expect(expandedGraphics).toHaveLength(0);
    await expect.poll(async () => (await readCellProbe(page.locator('[data-cell-probe="editor"]')))
      .presentation?.cellGraphics?.source).toBe("cell-graphics");
    expect((await readCellProbe(page.locator('[data-cell-probe="editor"]')))
      .presentation?.requestedFontRoutes["cell-glyph"]).toBeUndefined();
  }
});
