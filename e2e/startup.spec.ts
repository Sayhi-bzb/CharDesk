import { expect, test } from "@playwright/test";

test("the first frame is the shared startup screen before application JavaScript", async ({ page }) => {
  await page.route(/\/src\/app\/main\.tsx(?:\?|$)/, (route) => route.abort());
  await page.goto("/");
  await expect(page.locator('[data-startup-phase="opening"]')).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Opening Canvas");
  await expect(page.locator(".startup-progress")).toBeVisible();
});

test("the first frame respects saved language and theme", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("chardesk-ui-language", "zh");
    localStorage.setItem("chardesk-host-theme", "dark");
  });
  await page.route(/\/src\/app\/main\.tsx(?:\?|$)/, (route) => route.abort());
  await page.goto("/");
  await expect(page.locator('[data-startup-phase="opening"]')).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("正在打开 Canvas");
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("startup stays understandable without JavaScript and without animation", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("http://localhost:5173/");
  await expect(page.locator("noscript .startup-detail")).toBeVisible();
  await expect(page.locator("noscript .startup-detail")).toHaveText("Enable JavaScript to use Canvas.");
  expect(await page.locator(".startup-progress").evaluate((element) =>
    getComputedStyle(element, "::after").animationName)).toBe("none");
  await context.close();
});
