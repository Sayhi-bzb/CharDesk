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
  await expect(page.locator("#installation-command .docs-code__line-numbers")).toHaveCount(0);

  const usage = page.locator("#usage + .docs-code code");
  await expect(usage).toHaveAttribute("data-code-language", "tsx");
  await expect(usage.locator("span")).not.toHaveCount(0);
  const original = await usage.textContent();
  const numbers = page.locator("#usage + .docs-code .docs-code__line-numbers");
  await expect(numbers).toHaveAttribute("aria-hidden", "true");
  expect(await numbers.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.userSelect || style.getPropertyValue("-webkit-user-select");
  })).toBe("none");
  await expect(numbers.locator("span")).toHaveCount(original!.split("\n").length);
  await expect(numbers.locator("span").first()).toHaveText("1");
  await expect(numbers.locator("span").last()).toHaveText(String(original!.split("\n").length));
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
  const progressBlock = page.locator('section[aria-labelledby="progress"] .docs-code');
  const progressSource = await progressBlock.locator("code").textContent();
  expect(progressSource).toContain("\n\n");
  await expect(progressBlock.locator(".docs-code__line-numbers span")).toHaveCount(progressSource!.split("\n").length);
  await page.getByRole("button", { name: "Light" }).click();
  await expect(comment).toHaveCSS("color", "rgb(102, 102, 102)");

  await page.goto("/#/guides/installation");
  const jsonBlock = page.locator('section[aria-labelledby="configure"] .docs-code');
  const jsonSource = await jsonBlock.locator("code").textContent();
  await expect(jsonBlock.locator(".docs-code__line-numbers span")).toHaveCount(jsonSource!.split("\n").length);
  await expect(page.locator('section[aria-labelledby="command"] .docs-code__line-numbers')).toHaveCount(0);
});

test("long examples fold to 20 lines while copy and navigation retain the full source", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (value: string) => { (window as Window & { __copied?: string }).__copied = value; } },
    });
  });
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/#/components/input");

  const block = page.locator("#usage + .docs-code");
  const code = block.locator("code");
  const fullSource = await code.textContent();
  expect(fullSource?.split("\n")).toHaveLength(21);
  const numbers = block.locator(".docs-code__line-numbers");
  await expect(numbers.locator("span")).toHaveCount(21);
  const toggle = block.getByRole("button", { name: "Show more" });
  await expect(block).toHaveAttribute("data-collapsed", "");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveAttribute("aria-controls", await block.locator("pre").getAttribute("id"));
  expect(await block.locator("pre").evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  const visibleLines = await block.locator("pre").evaluate((element) => {
    const style = getComputedStyle(element);
    return (element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom))
      / parseFloat(style.lineHeight);
  });
  expect(visibleLines).toBeCloseTo(20, 0);
  const visibleNumberLines = await numbers.evaluate((element) => {
    const style = getComputedStyle(element);
    return (element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom))
      / parseFloat(style.lineHeight);
  });
  expect(visibleNumberLines).toBeCloseTo(20, 0);
  const collapsedGutterHeight = await numbers.evaluate((element) => element.clientHeight);

  await block.getByRole("button", { name: "Copy" }).click();
  expect(await page.evaluate(() => (window as Window & { __copied?: string }).__copied)).toBe(fullSource);
  await toggle.click();
  const showLess = block.getByRole("button", { name: "Show less" });
  await expect(showLess).toHaveAttribute("aria-expanded", "true");
  await expect(block).not.toHaveAttribute("data-collapsed", "");
  expect(await numbers.evaluate((element) => element.clientHeight)).toBeGreaterThan(collapsedGutterHeight);
  await showLess.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await toggle.click();
  await page.getByRole("navigation", { name: "Cell UI" }).getByRole("link", { name: "Select", exact: true }).click();
  await page.getByRole("navigation", { name: "Cell UI" }).getByRole("link", { name: "Input", exact: true }).click();
  await expect(page.locator("#usage + .docs-code")).toHaveAttribute("data-collapsed", "");

  await page.goto("/#/components/badge");
  await expect(page.locator("#usage + .docs-code .docs-code__toggle")).toHaveCount(0);
});

test("line numbers stay fixed when narrow code scrolls horizontally", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/#/components/select");
  const block = page.locator("#usage + .docs-code");
  const pre = block.locator("pre");
  const gutter = block.locator(".docs-code__line-numbers");
  const left = await gutter.evaluate((element) => element.getBoundingClientRect().left);
  expect(await pre.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await pre.evaluate((element) => { element.scrollLeft = 120; });
  expect(await pre.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await gutter.evaluate((element) => element.getBoundingClientRect().left)).toBe(left);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
