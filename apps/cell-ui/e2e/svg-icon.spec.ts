import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test("Button SVG stays in the visual layer of preview and article", async ({ page }) => {
  await page.goto("/#/components/button");
  const preview = page.locator('[data-cell-probe="component-button"]');
  const article = page.locator('[data-cell-probe="article-button"]');
  await expect(preview.getByRole("button", { name: "icon source" })).toHaveCount(0);

  const choose = async (label: string, value: string) => {
    const trigger = preview.getByRole("button", { name: label, exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const option = page.getByRole("option", { name: value, exact: true });
    await option.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  };

  await choose("content", "icon-only");
  await expect(preview.getByRole("button", { name: "icon source" })).toBeAttached();
  await choose("icon source", "SVG");
  await expect(article.locator('[data-cell-svg-icon="component-button-save-icon"] svg')).toBeVisible();
  expect((await readCellProbe(preview)).text).not.toContain("\uEB4B");
  expect((await readCellProbe(article)).text).not.toContain("\uEB4B");
  await expect(preview.getByRole("button", { name: "Save document" })).toBeAttached();

  await choose("content", "text");
  await expect(preview.getByRole("button", { name: "icon source" })).toHaveCount(0);
  await expect(article.locator("[data-cell-svg-icon]")).toHaveCount(0);
  await choose("content", "icon + text");
  await expect(preview.getByRole("button", { name: "icon source" })).toBeAttached();
  await expect(article.locator('[data-cell-svg-icon="component-button-save-icon"] svg')).toBeVisible();

  await choose("presentation", "Text");
  await expect(preview.getByRole("button", { name: "icon source" })).toHaveCount(0);
  await expect(preview.locator("[data-cell-svg-icon]")).toHaveCount(0);
  await expect(article.locator("[data-cell-svg-icon]")).toHaveCount(0);
  expect((await readCellProbe(preview)).text).toContain("\uEB4B");
});
