import { expect, test } from "@playwright/test";
import { cellPoint, ownerBounds, readCellMetrics, readCellProbe } from "./helpers/cell-probe";

const starsUrl = "**/api/github-stars";
const repositoryUrl = "https://github.com/Sayhi-bzb/CharDesk";

test("header displays the shared star snapshot across routes and appearances", async ({ page }) => {
  let requests = 0;
  let releaseResponse!: () => void;
  const responseReady = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route(starsUrl, async (route) => {
    requests += 1;
    await responseReady;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 1234, updatedAt: "2026-09-23T00:00:00.000Z" }),
    });
  });

  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/#/components/button");
  const header = page.locator('[data-cell-probe="gallery-header"]');
  const stars = header.locator('[data-cell-semantic-id="gallery-header-github"]');
  await expect(stars).toHaveText("CharDesk on GitHub, star count loading");
  await expect(stars).toHaveAttribute("aria-label", "CharDesk on GitHub, star count loading");
  await expect(stars).toHaveAttribute("href", repositoryUrl);
  await expect(stars).toHaveAttribute("target", "_blank");
  expect((await readCellProbe(header)).text).toContain("—");
  const githubIcon = header.locator('[data-cell-svg-icon="gallery-header-github"] svg');
  await expect(githubIcon).toBeVisible();
  await expect(githubIcon).toHaveAttribute("viewBox", "0 0 48 48");
  await expect(githubIcon).toHaveAttribute("shape-rendering", "crispEdges");
  releaseResponse();
  await expect(stars).toHaveText("CharDesk on GitHub, 1,234 stars");
  await expect(stars).toHaveAttribute("aria-label", "CharDesk on GitHub, 1,234 stars");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await page.getByRole("button", { name: "Dark" }).evaluate((element: HTMLElement) => element.click());
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
  expect((await readCellProbe(header)).text).toContain("1,234");

  await page.evaluate(() => { window.location.hash = "#/__fixtures/text"; });
  await expect(page.getByRole("heading", { name: "Cell UI Fixture", level: 1 })).toBeVisible();
  await expect(page.locator('[data-cell-semantic-id="gallery-header-github"]')).toHaveText("CharDesk on GitHub, 1,234 stars");
  expect(requests).toBe(1);
});

test("header keeps its GitHub link when the count is unavailable", async ({ page }) => {
  await page.route(starsUrl, (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "unavailable" }),
  }));
  await page.goto("/#/components/button");
  const stars = page.locator('[data-cell-semantic-id="gallery-header-github"]');
  await expect(stars).toHaveText("CharDesk on GitHub, star count unavailable");
  await expect(stars).toHaveAttribute("aria-label", "CharDesk on GitHub, star count unavailable");
  await expect(stars).toHaveAttribute("href", repositoryUrl);
});

test("header SVG icons keep their Cell slots across widths and themes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.route(starsUrl, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ count: 1234, updatedAt: "2026-09-23T00:00:00.000Z" }),
  }));
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/#/components/button");

  const header = page.locator('[data-cell-probe="gallery-header"]');
  const githubIcon = header.locator('[data-cell-svg-icon="gallery-header-github"] svg');
  const themeSlot = header.locator('[data-cell-svg-icon="gallery-header-theme-icon"]');
  const themeIcon = themeSlot.locator("svg");
  await expect(header.locator('[data-cell-semantic-id="gallery-header-github"]'))
    .toHaveText("CharDesk on GitHub, 1,234 stars");

  for (const width of [320, 721, 1280]) {
    await page.setViewportSize({ width, height: 700 });
    await expect(githubIcon).toBeVisible();
    await expect(themeIcon).toBeVisible();
    const metrics = await readCellMetrics(header);
    const snapshot = await readCellProbe(header);
    const github = ownerBounds(snapshot, "gallery-header-github");
    const font = ownerBounds(snapshot, "gallery-font-trigger");
    const theme = ownerBounds(snapshot, "gallery-header-theme");
    expect(theme.width).toBe(4);
    expect(github.x + github.width).toBeLessThan(font.x);
    expect(font.x + font.width).toBeLessThan(theme.x);

    const firstDigit = snapshot.cells.find((cell) => cell.ownerId === "gallery-header-github" && cell.text === "1");
    expect(firstDigit).toBeDefined();
    const digitCenter = await cellPoint(header, firstDigit!.x, firstDigit!.y);
    const iconBounds = await githubIcon.boundingBox();
    expect(iconBounds).not.toBeNull();
    expect(digitCenter.x - metrics.cellWidth / 2 - iconBounds!.x - iconBounds!.width)
      .toBeGreaterThanOrEqual(metrics.cellWidth * 0.75);

    const clipping = await themeSlot.evaluate((element) => getComputedStyle(element).clipPath);
    expect(clipping).toMatch(/^inset\(0px(?: 0px){0,3}\)$/);
    const slotBounds = await themeSlot.boundingBox();
    const themeIconBounds = await themeIcon.boundingBox();
    expect(slotBounds).not.toBeNull();
    expect(themeIconBounds).not.toBeNull();
    expect(themeIconBounds!.x).toBeGreaterThanOrEqual(slotBounds!.x);
    expect(themeIconBounds!.x + themeIconBounds!.width).toBeLessThanOrEqual(slotBounds!.x + slotBounds!.width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    await page.getByRole("button", { name: width === 320 ? "Dark" : width === 721 ? "Light" : "Dark" })
      .evaluate((element: HTMLElement) => element.click());
    await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", width === 721 ? "light" : "dark");
    await expect(themeSlot).toHaveCSS("clip-path", /^inset\(0px(?: 0px){0,3}\)$/);
  }
});

test("GitHub Cell link opens a new tab without opener access", async ({ page }) => {
  await page.goto("/#/components/button");
  await page.evaluate(() => {
    window.open = (...args) => {
      document.body.dataset.githubPopup = JSON.stringify(args);
      return null;
    };
  });
  const header = page.locator('[data-cell-probe="gallery-header"]');
  const github = ownerBounds(await readCellProbe(header), "gallery-header-github");
  const point = await cellPoint(header, github.x, github.y);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator("body")).toHaveAttribute("data-github-popup",
    JSON.stringify([repositoryUrl, "_blank", "noopener,noreferrer"]));
});
