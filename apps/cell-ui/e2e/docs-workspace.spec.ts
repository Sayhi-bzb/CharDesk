import { expect, test } from "@playwright/test";
import { cellPoint, ownerBounds, readCellProbe } from "./helpers/cell-probe";

test("mobile docs start with the work and disclose one Cell navigation", async ({ page }) => {
  for (const [width, height] of [[390, 844], [320, 700]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/#/components/button");
    const nav = page.getByRole("navigation", { name: "Cell UI" });
    const trigger = nav.getByRole("button", { name: "Browse documentation: Components / Button" });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("navigation", { name: "On This Page" })).toHaveCount(0);
    await expect(nav.getByRole("link")).toHaveCount(0);
    await expect.poll(() => page.locator(".docs-preview").evaluate((element) =>
      element.getBoundingClientRect().top)).toBeLessThan(height);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(nav.getByRole("link", { name: "Select", exact: true })).toBeAttached();
    await expect(nav.getByRole("link", { name: "Usage", exact: true })).toBeAttached();
    await nav.getByRole("link", { name: "Select", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();

    const surface = page.locator('[data-cell-probe="gallery-mobile-nav"]');
    await surface.locator("canvas").first().scrollIntoViewIfNeeded();
    const bounds = ownerBounds(await readCellProbe(surface), "gallery-mobile-nav-trigger");
    const point = await cellPoint(surface, bounds.x, bounds.y);
    await page.mouse.click(point.x, point.y);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await nav.getByRole("link", { name: "Usage", exact: true })
      .evaluate((element: HTMLElement) => element.click());
    await expect(page).toHaveURL(/#\/components\/button\?section=usage$/);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#usage")).toBeInViewport();
  }
});

test("desktop TOC follows reading position without rewriting history", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#/components/button");
  const toc = page.getByRole("navigation", { name: "On This Page" });
  await page.locator("#usage").evaluate((element) => element.scrollIntoView());
  await expect(toc.getByRole("link", { name: "Usage" })).toHaveAttribute("aria-current", "location");
  await expect(page).toHaveURL(/#\/components\/button$/);
  await page.locator("#api").evaluate((element) => element.scrollIntoView());
  await expect(toc.getByRole("link", { name: "API" })).toHaveAttribute("aria-current", "location");
  await expect(page).toHaveURL(/#\/components\/button$/);
});

test("unknown docs route keeps a Cell-rendered recovery path", async ({ page }) => {
  await page.goto("/#/components/unknown");
  await expect(page.locator('[data-cell-probe="gallery-not-found"]')).toBeAttached();
  await expect(page.getByRole("heading", { name: "Page not found", level: 1 })).toBeAttached();
  const home = page.getByRole("link", { name: "Open Introduction" });
  await home.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/guides\/introduction$/);
});
