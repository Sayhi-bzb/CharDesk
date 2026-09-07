import { expect, test } from "@playwright/test";

type GlyphCall = Readonly<{ text: string; font: string }>;

test("component chrome is rendered as Unicode in the active display font", async ({ page }) => {
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
      border: calls.some(({ text, font }) => "┌─│".includes(text) && font.includes("Maple Mono NF CN")),
      thumb: calls.some(({ text, font }) => "█▀▄▌▐".includes(text) && font.includes("Maple Mono NF CN")),
    };
  }).toEqual({ border: true, thumb: true });

  await page.getByRole("button", { name: "Rounded", exact: true }).click();
  await expect.poll(async () => (await glyphCalls()).some(({ text }) => text === "╭")).toBe(true);

  await page.getByRole("button", { name: "Use Ark Pixel 12px Mono" }).click();
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-font", "ark-mono");
  await expect.poll(async () => (await glyphCalls()).some(({ text, font }) =>
    "╭─│█▀▄▌▐".includes(text) && font.includes("Ark Pixel 12px Mono latin"))).toBe(true);
});
