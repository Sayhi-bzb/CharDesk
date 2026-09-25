import { expect, test } from "@playwright/test";
import { cellPoint, ownerBounds, ownerCells, readCellProbe, readCellProbeWithOwner } from "./helpers/cell-probe";

test("Tooltip appears after hover delay, remains Cell-owned, and yields pointer hit", async ({ page }) => {
  await page.goto("/#/components/tooltip");
  const surface = page.locator('[data-cell-probe="component-tooltip"]');
  const button = surface.getByRole("button", { name: "Save document" });
  const tooltip = surface.getByRole("tooltip", { name: "Save current document" });
  expect(ownerCells(await readCellProbe(surface), "component-tooltip-help")).toHaveLength(0);
  const buttonBounds = ownerBounds(await readCellProbe(surface), "component-tooltip-save");
  const point = await cellPoint(surface, buttonBounds.x + 1, buttonBounds.y);
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(250);
  await expect(tooltip).toHaveCount(0);
  await expect(tooltip).toBeAttached();
  await expect(button).toHaveAttribute("aria-describedby", "cell-semantic-component-tooltip-help");
  const tipBounds = ownerBounds(await readCellProbeWithOwner(surface, "component-tooltip-help"), "component-tooltip-help");
  expect(tipBounds.height).toBe(3);
  expect(tipBounds.y === buttonBounds.y + buttonBounds.height
    || tipBounds.y + tipBounds.height === buttonBounds.y).toBe(true);
  const tipPoint = await cellPoint(surface, tipBounds.x + 1, tipBounds.y + 1);
  await page.mouse.move(tipPoint.x, tipPoint.y);
  await expect(tooltip).toHaveCount(0);
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(250);
  await expect(tooltip).toHaveCount(0);
  await expect(tooltip).toBeAttached();
});

test("Tooltip opens on keyboard focus and Escape dismisses until focus changes", async ({ page }) => {
  await page.goto("/#/components/tooltip");
  const surface = page.locator('[data-cell-probe="component-tooltip"]');
  const button = surface.getByRole("button", { name: "Save document" });
  const tooltip = surface.getByRole("tooltip", { name: "Save current document" });
  await button.focus();
  await expect(tooltip).toBeAttached();
  await page.evaluate(() => window.dispatchEvent(new Event("scroll")));
  await expect(tooltip).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  await page.waitForTimeout(600);
  await expect(tooltip).toHaveCount(0);
  await page.locator('[data-cell-probe="article-tooltip-0"] canvas').click({ position: { x: 5, y: 5 } });
  await button.focus();
  await expect(tooltip).toBeAttached();
});

test("Tooltip config combines opaque variants with independent border shapes", async ({ page }) => {
  await page.goto("/#/components/tooltip");
  const surface = page.locator('[data-cell-probe="component-tooltip"]');
  const button = surface.getByRole("button", { name: "Save document" });
  const tooltip = surface.getByRole("tooltip", { name: "Save current document" });
  const border = surface.getByRole("button", { name: "border" });
  await expect(border).toBeAttached();
  await button.focus();
  await expect(tooltip).toBeAttached();
  const elevated = await readCellProbeWithOwner(surface, "component-tooltip-help");
  expect(ownerBounds(elevated, "component-tooltip-help").height).toBe(3);
  const surfaceBackground = ownerCells(elevated, "component-tooltip-help").find((cell) => cell.text === " ")?.style.backgroundColor;
  expect(surfaceBackground).toBeTruthy();

  await border.evaluate((element: HTMLElement) => element.click());
  await surface.getByRole("option", { name: "rounded" }).evaluate((element: HTMLElement) => element.click());
  await expect(border).toHaveAttribute("aria-expanded", "false");
  await button.focus();
  await expect(tooltip).toBeAttached();
  await expect.poll(async () => ownerCells(await readCellProbeWithOwner(surface, "component-tooltip-help"), "component-tooltip-help").some((cell) => cell.text === "╭")).toBe(true);

  const variant = surface.getByRole("button", { name: "variant" });
  await variant.evaluate((element: HTMLElement) => element.click());
  await surface.getByRole("option", { name: "ghost" }).evaluate((element: HTMLElement) => element.click());
  await expect(variant).toHaveAttribute("aria-expanded", "false");
  await border.evaluate((element: HTMLElement) => element.click());
  await surface.getByRole("option", { name: "none" }).evaluate((element: HTMLElement) => element.click());
  await expect(border).toHaveAttribute("aria-expanded", "false");
  await button.focus();
  await expect(tooltip).toBeAttached();
  const ghost = await readCellProbeWithOwner(surface, "component-tooltip-help");
  expect(ownerBounds(ghost, "component-tooltip-help").height).toBe(1);
  expect(ownerCells(ghost, "component-tooltip-help").map((cell) => cell.text).join(""))
    .not.toMatch(/[┌┐└┘╭╮╰╯]/u);
  const ghostBackground = ownerCells(ghost, "component-tooltip-help").find((cell) => cell.text === " ")?.style.backgroundColor;
  expect(ghostBackground).toBeTruthy();
  expect(ghostBackground).not.toBe(surfaceBackground);
});
