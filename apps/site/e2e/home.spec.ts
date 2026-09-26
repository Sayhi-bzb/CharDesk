import { expect, test } from "@playwright/test";

for (const width of [320, 375, 1440]) {
  test(`Cell UI navigation remains complete at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const surface = page.locator('[data-cell-probe="site-home"]');
    await expect(surface).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Canvas" })).toHaveAttribute("href", "https://canvas.chardesk.com/");
    await expect(page.getByRole("link", { name: "Open Cell UI" })).toHaveAttribute("href", "https://ui.chardesk.com/");
    await expect.poll(() => surface.evaluate((element) => {
      const probe = (element as HTMLElement & { __chardeskCellProbeV5?: { text: string } }).__chardeskCellProbeV5;
      return probe?.text.includes("Documentation") && probe.text.includes("GitHub");
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}

test("keyboard follows the four product links", async ({ page }) => {
  await page.goto("/");
  const surface = page.locator('[data-cell-probe="site-home"]');
  await expect(surface).toBeVisible();
  for (const id of ["site-canvas-link", "site-cell-ui-link", "site-docs", "site-github"]) {
    await page.keyboard.press("Tab");
    await expect.poll(() => surface.evaluate((element) =>
      (element as HTMLElement & { __chardeskCellProbeV5?: { focusedId: string | null } }).__chardeskCellProbeV5?.focusedId
    )).toBe(id);
  }
});

test("static product links remain when JavaScript is unavailable", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:5199/");
  await expect(page.locator(".site-fallback a")).toHaveCount(4);
  await context.close();
});
