import { expect, test } from "@playwright/test";

test("TSX examples use monochrome syntax levels without changing code or copy", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => { (window as Window & { __copied?: string }).__copied = value; } },
    });
  });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/#/components/button");

  const command = page.locator("#installation-command code");
  await expect(command).toHaveAttribute("data-code-language", "text");
  await expect(command.locator("span")).toHaveCount(0);

  const usage = page.locator("#usage + .docs-code code");
  await expect(usage).toHaveAttribute("data-code-language", "tsx");
  await expect(usage.locator("span")).not.toHaveCount(0);
  const original = await usage.textContent();
  const keyword = usage.locator('span.docs-code__emphasis').filter({ hasText: /^import$/ }).first();
  const component = usage.locator('span.docs-code__emphasis').filter({ hasText: /^Button$/ }).first();
  const string = usage.locator('span[style*="--gallery-code-token-string-expression"]').first();
  const assignment = usage.locator('span[style*="--gallery-code-token-keyword"]').filter({ hasText: /^=$/ }).first();
  await expect(keyword).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(keyword).toHaveCSS("font-weight", "700");
  await expect(component).toHaveCSS("font-weight", "700");
  await expect(string).toHaveCSS("color", "rgb(85, 85, 85)");
  await expect(assignment).toHaveCSS("font-weight", "400");
  await page.locator("#usage + .docs-code").getByRole("button", { name: "Copy" }).click();
  const copied = await page.evaluate(() => (window as Window & { __copied?: string }).__copied ?? "");
  expect(copied).toBe(original);

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(keyword).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(string).toHaveCSS("color", "rgb(170, 170, 170)");
  await expect(usage).toHaveText(original!);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await page.goto("/#/guides/introduction");
  const comment = page.locator('section[aria-labelledby="settings"] .docs-code span[style*="--gallery-code-token-comment"]');
  await expect(comment).toHaveCSS("color", "rgb(153, 153, 153)");
  await page.getByRole("button", { name: "Light" }).click();
  await expect(comment).toHaveCSS("color", "rgb(102, 102, 102)");
});
