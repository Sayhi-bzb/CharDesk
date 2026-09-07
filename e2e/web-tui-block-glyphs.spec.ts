import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

type GlyphCall = Readonly<{ text: string; font: string }>;

test("component chrome uses Core Unicode glyphs across all display fonts", async ({ page }) => {
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
    const calls = await glyphCalls();
    return {
      border: calls.some(({ text, font }) => "┌─│".includes(text) && font.includes("JuliaMono")),
      thumb: calls.some(({ text, font }) => "█▀▄▌▐".includes(text) && font.includes("JuliaMono")),
    };
  }).toEqual({ border: true, thumb: true });

  await page.getByRole("button", { name: "Rounded", exact: true }).click();
  await expect.poll(async () => (await glyphCalls()).some(({ text }) => text === "╭")).toBe(true);

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
    await expect.poll(async () => (await glyphCalls()).some(({ text, font }) =>
      text === "╭" && font.includes("JuliaMono"))).toBe(true);
    const boxes = (await glyphCalls()).filter(({ text }) => /^[\u2500-\u259F]$/u.test(text));
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.every(({ font }) => font.includes("JuliaMono") && !font.includes("700"))).toBe(true);
    await expect.poll(async () => (await readCellProbe(page.locator('[data-cell-probe="editor"]')))
      .presentation?.requestedFontRoutes["cell-glyph"].family).toBe("'JuliaMono'");
  }
});
