import { expect, test } from "@playwright/test";
import { canvasFor, cellPoint, copyCellRange, ownerBounds, readCellProbe } from "./helpers/cell-probe";

test("ordinary article drag copies a linear selection across its preview", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#/components/button");
  const article = page.locator('[data-cell-probe="article-button"]');
  const rows = (await readCellProbe(article)).text.split("\n");
  const first = rows.findIndex((line) => line.includes("## Preview"));
  const last = rows.findIndex((line) => line.includes("## Installation"));
  expect(first).toBeGreaterThanOrEqual(0);
  expect(last).toBeGreaterThan(first);
  const start = await cellPoint(article, 3, first, { scrollIntoView: false });
  const end = await cellPoint(article, 16, last, { scrollIntoView: false });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await expect(article).toHaveAttribute("data-cell-range");
  const copied = await copyCellRange(article);
  expect(copied).toContain("Preview");
  expect(copied).toContain("presentation");
  expect(copied).toContain("Installation");
});

test("holding a linear drag at the viewport edge scrolls the article and extends its selection", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/#/components/button");
  const article = page.locator('[data-cell-probe="article-button"]');
  const rows = (await readCellProbe(article)).text.split("\n");
  const startRow = rows.findIndex((line) => line.includes("## Preview"));
  expect(startRow).toBeGreaterThanOrEqual(0);
  const start = await cellPoint(article, 3, startRow);
  const initialScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 20, 595, { steps: 8 });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialScroll + 250);
  expect(await copyCellRange(article)).toContain("Installation");
  const bottomScroll = await page.evaluate(() => window.scrollY);
  await page.mouse.move(start.x + 20, 5);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(bottomScroll - 100);
  await page.mouse.move(start.x + 20, 300);
  const stoppedScroll = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.scrollY)).toBe(stoppedScroll);
  await page.mouse.move(start.x + 20, 595);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(stoppedScroll + 30);
  await page.mouse.up();
  const releasedScroll = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.scrollY)).toBe(releasedScroll);
  await expect(article).toHaveAttribute("data-cell-range");
  expect(await copyCellRange(article)).toContain("Preview");
});

test("ordinary drag does not select on a CellSurface without linear selection", async ({ page }) => {
  await page.goto("/#/__fixtures/text");
  const surface = page.locator('[data-cell-probe="component-text"]');
  const snapshot = await readCellProbe(surface);
  const first = ownerBounds(snapshot, "component-text-plain");
  const last = ownerBounds(snapshot, "component-text-status");
  const start = await cellPoint(surface, first.x + 1, first.y);
  const end = await cellPoint(surface, last.x + 8, last.y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
  await expect(surface).not.toHaveAttribute("data-cell-range");
});

test("ordinary drag selects Markdown preview text instead of panning it", async ({ page }) => {
  await page.goto("/#/guides/markdown");
  const article = page.locator('[data-cell-probe="article-markdown"]');
  const preview = page.locator('[data-cell-probe="markdown-example"]');
  await expect(preview).toHaveAttribute("data-cell-probe-origin", /\d+,\d+/u);
  const [originX, originY] = (await preview.getAttribute("data-cell-probe-origin"))!.split(",").map(Number);
  const start = await cellPoint(article, originX!, originY!);
  const end = await cellPoint(article, originX! + 16, originY! + 2);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
  await expect(article).toHaveAttribute("data-cell-range");
  const copied = await copyCellRange(article);
  expect(copied).toContain("# Field Notes");
  expect(copied).toContain("Cells make");
});

test("document range crosses the interactive preview in one Cell Scene", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#/components/button");
  const article = page.locator('.docs-page [data-cell-probe="article-button"]');
  await expect(page.locator(".docs-page canvas")).toHaveCount(1);
  const snapshot = await readCellProbe(article);
  const lines = snapshot.text.split("\n");
  const startRow = lines.findIndex((line) => line.includes("## Preview"));
  const endRow = lines.findIndex((line) => line.includes("## Installation"));
  expect(startRow).toBeGreaterThanOrEqual(0);
  expect(endRow).toBeGreaterThan(startRow);
  expect(lines.slice(startRow, endRow).join("\n")).toContain("presentation");
  const start = await cellPoint(article, 0, startRow, { scrollIntoView: false });
  const end = await cellPoint(article, 28, endRow, { scrollIntoView: false });
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
  await expect(article.getByRole("listbox", { name: "presentation options" })).toHaveCount(0);
  await expect(article.getByRole("heading", { name: "Installation" })).toBeAttached();
  await article.getByRole("button", { name: "Copy preview" }).evaluate((element: HTMLElement) => element.click());
  await expect.poll(() => article.locator('[data-cell-semantic-id="preview-copy-component-button"]').getAttribute("aria-label"))
    .toBe("Copied");
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("preview-copy")))
    .toContain("cell-ui/probe@5  component-button");
});

test("multi-demo guide keeps independent interactions in one document Scene", async ({ page }) => {
  await page.goto("/#/guides/introduction");
  const article = page.locator('.docs-page [data-cell-probe="article-introduction"]');
  await expect(page.locator(".docs-page canvas")).toHaveCount(1);
  await expect(article.getByRole("button", { name: "Start" })).toBeAttached();
  await article.getByRole("button", { name: "Start" }).evaluate((element: HTMLElement) => element.click());
  await expect.poll(async () => Number(await article.getByRole("progressbar", { name: "Upload" })
    .getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  await expect(article.getByRole("textbox", { name: "Notes" })).toBeAttached();
  await expect(article.getByRole("heading", { name: "Edit Unicode in place" })).toBeAttached();
});

test("guide examples center within the article and stay contained on narrow screens", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const [slug, examples] of [
    ["introduction", [["intro-settings", 32], ["intro-progress", 32], ["intro-notes", 32]]],
    ["classic-macintosh", [["classic-macintosh-example", 34]]],
    ["markdown", [["markdown-example", 44]]],
  ] as const) {
    await page.goto(`/#/guides/${slug}`);
    const article = page.locator(`[data-cell-probe="article-${slug}"]`);
    await expect(page.locator(".docs-page canvas")).toHaveCount(1);
    for (const [probeId, width] of examples) {
      const example = page.locator(`[data-cell-probe="${probeId}"]`);
      await expect.poll(async () => {
        const origin = await example.getAttribute("data-cell-probe-origin");
        const articleWidth = (await readCellProbe(article)).viewport.width;
        if (!origin) return -1;
        const x = Number(origin.split(",")[0]);
        return Math.abs(x - (articleWidth - x - width));
      }, { timeout: 15_000 }).toBeLessThanOrEqual(1);
    }
  }

  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/#/guides/introduction");
  const article = page.locator('[data-cell-probe="article-introduction"]');
  const example = page.locator('[data-cell-probe="intro-settings"]');
  await expect.poll(async () => (await readCellProbe(article)).viewport.width).toBeLessThan(32);
  await expect.poll(async () => (await readCellProbe(example)).viewport.width).toBe(32);
  await expect.poll(async () => Number((await example.getAttribute("data-cell-probe-origin"))?.split(",")[0]))
    .toBe(0);
  const before = (await readCellProbe(article)).text;
  const originY = Number((await example.getAttribute("data-cell-probe-origin"))!.split(",")[1]);
  const point = await cellPoint(article, 10, originY + 1);
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(160, 0);
  await expect.poll(async () => (await readCellProbe(article)).text).not.toBe(before);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(320);
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
    await canvasFor(surface).first().scrollIntoViewIfNeeded();
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
