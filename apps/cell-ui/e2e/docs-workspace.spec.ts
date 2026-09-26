import { expect, test } from "@playwright/test";
import { cellPoint, copyCellRange, ownerBounds, readCellProbe } from "./helpers/cell-probe";

test("document range crosses the interactive preview in one Cell Scene", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#/components/button");
  const article = page.locator('.docs-page [data-cell-probe="article-button"]');
  await expect(page.locator(".docs-page [data-cell-probe]")).toHaveCount(1);
  const snapshot = await readCellProbe(article);
  const lines = snapshot.text.split("\n");
  const startRow = lines.findIndex((line) => line.includes("## Preview"));
  const endRow = lines.findIndex((line) => line.includes("## Installation"));
  expect(startRow).toBeGreaterThanOrEqual(0);
  expect(endRow).toBeGreaterThan(startRow);
  expect(lines.slice(startRow, endRow).join("\n")).toContain("presentation");
  const start = await cellPoint(article, 0, startRow);
  const end = await cellPoint(article, 28, endRow);
  await page.keyboard.down("Alt");
  await page.keyboard.down("Meta");
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await page.keyboard.up("Alt");
  await expect(article).toHaveAttribute("data-cell-range", /,\d+,29,\d+$/);
  const copied = await copyCellRange(article);
  expect(copied).toContain("## Preview");
  expect(copied).toContain("Save");
  expect(copied).toContain("## Installation");
});

test("embedded playground keeps local presentation and preview copy", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => { sessionStorage.setItem("preview-copy", value); } },
    });
  });
  await page.goto("/#/components/button");
  const article = page.locator('[data-cell-probe="article-button"]');
  await expect(article.getByRole("button", { name: "Save document" })).toBeAttached();
  const presentation = article.getByRole("button", { name: "presentation" });
  await presentation.focus();
  await page.keyboard.press("Enter");
  await article.getByRole("option", { name: "Text" }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await readCellProbe(article)).cells.some((cell) =>
    cell.ownerId === "component-button-save" && cell.text === "[")).toBe(true);
  await expect(article.getByRole("heading", { name: "Installation" })).toBeAttached();
  await article.getByRole("button", { name: "Copy preview" }).evaluate((element: HTMLElement) => element.click());
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("preview-copy")))
    .toContain("cell-ui/probe@5  component-button");
});

test("multi-demo guide keeps independent interactions in one document Scene", async ({ page }) => {
  await page.goto("/#/guides/introduction");
  const article = page.locator('.docs-page [data-cell-probe="article-introduction"]');
  await expect(page.locator(".docs-page [data-cell-probe]")).toHaveCount(1);
  await expect(article.getByRole("button", { name: "Start" })).toBeAttached();
  await article.getByRole("button", { name: "Start" }).evaluate((element: HTMLElement) => element.click());
  await expect.poll(async () => (await readCellProbe(article)).text).toContain("Uploading files");
  await expect(article.getByRole("textbox", { name: "Notes" })).toBeAttached();
  await expect(article.getByRole("heading", { name: "Edit Unicode in place" })).toBeAttached();
});

test("embedded dialog stays inside its preview scope", async ({ page }) => {
  await page.goto("/#/components/dialog");
  const article = page.locator('[data-cell-probe="article-dialog"]');
  await article.getByRole("button", { name: "Open dialog" }).evaluate((element: HTMLElement) => element.click());
  await expect(article.getByRole("dialog", { name: "Continue?" })).toBeAttached();
  const probe = await readCellProbe(article);
  const rows = probe.text.split("\n");
  const previewRow = rows.findIndex((line) => line.includes("## Preview"));
  const installationRow = rows.findIndex((line) => line.includes("## Installation"));
  const overlay = probe.overlays.find(({ rootId }) => rootId === "demo-dialog");
  expect(overlay).toBeDefined();
  expect(overlay!.bounds.y).toBeGreaterThan(previewRow);
  expect(overlay!.bounds.y + overlay!.bounds.height).toBeLessThan(installationRow);
});

test("mobile docs start with the work and disclose one Cell navigation", async ({ page }) => {
  for (const [width, height] of [[390, 844], [320, 700]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/#/components/button");
    const nav = page.getByRole("navigation", { name: "Cell UI" });
    const trigger = nav.getByRole("button", { name: "Browse documentation: Components / Button" });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("navigation", { name: "On This Page" })).toHaveCount(0);
    await expect(nav.getByRole("link")).toHaveCount(0);
    await expect.poll(() => page.locator("#preview").evaluate((element) =>
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
