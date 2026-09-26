import { expect, test } from "@playwright/test";
import { cellPoint, readCellProbe } from "./helpers/cell-probe";

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
  expect((await readCellProbe(header)).text).toContain(" —");
  releaseResponse();
  await expect(stars).toHaveText("CharDesk on GitHub, 1,234 stars");
  await expect(stars).toHaveAttribute("aria-label", "CharDesk on GitHub, 1,234 stars");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await page.getByRole("button", { name: "Dark" }).evaluate((element: HTMLElement) => element.click());
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
  expect((await readCellProbe(header)).text).toContain(" 1,234");

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

test("GitHub Cell link opens a new tab without opener access", async ({ page }) => {
  await page.goto("/#/components/button");
  await page.evaluate(() => {
    window.open = (...args) => {
      document.body.dataset.githubPopup = JSON.stringify(args);
      return null;
    };
  });
  const header = page.locator('[data-cell-probe="gallery-header"]');
  const githubCell = (await readCellProbe(header)).cells.find((cell) => cell.text === "");
  expect(githubCell).toBeDefined();
  const point = await cellPoint(header, githubCell!.x, githubCell!.y);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator("body")).toHaveAttribute("data-github-popup",
    JSON.stringify([repositoryUrl, "_blank", "noopener,noreferrer"]));
});
