import { expect, test } from "@playwright/test";

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
  const stars = page.locator(".gallery-github-stars");
  await expect(stars).toHaveText("—");
  await expect(stars).toHaveAttribute("aria-label", "CharDesk on GitHub, star count loading");
  await expect(stars).toHaveAttribute("href", repositoryUrl);
  await expect(stars).toHaveAttribute("target", "_blank");
  await expect(stars.locator("svg path")).toHaveAttribute("fill", "currentColor");
  expect(await page.evaluate(() => {
    const github = document.querySelector<SVGSVGElement>(".gallery-github-stars > svg")!;
    const theme = document.querySelector<SVGSVGElement>(".gallery-icon-button > svg")!;
    const githubBounds = github.getBoundingClientRect();
    const themeBounds = theme.getBoundingClientRect();
    return [githubBounds.width, githubBounds.height, themeBounds.width, themeBounds.height];
  })).toEqual([15, 15, 15, 15]);
  releaseResponse();
  await expect(stars).toHaveText("1,234");
  await expect(stars).toHaveAttribute("aria-label", "CharDesk on GitHub, 1,234 stars");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
  expect(await stars.evaluate((link) => {
    const path = link.querySelector("svg path")!;
    return getComputedStyle(path).fill === getComputedStyle(link).color;
  })).toBe(true);

  await page.evaluate(() => { window.location.hash = "#/__fixtures/text"; });
  await expect(page.getByRole("heading", { name: "Cell UI Fixture", level: 1 })).toBeVisible();
  await expect(page.locator(".gallery-github-stars")).toHaveText("1,234");
  expect(requests).toBe(1);
});

test("header keeps its GitHub link when the count is unavailable", async ({ page }) => {
  await page.route(starsUrl, (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "unavailable" }),
  }));
  await page.goto("/#/components/button");
  const stars = page.locator(".gallery-github-stars");
  await expect(stars).toHaveText("—");
  await expect(stars).toHaveAttribute("aria-label", "CharDesk on GitHub, star count unavailable");
  await expect(stars).toHaveAttribute("href", repositoryUrl);
});
