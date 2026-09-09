import { expect, test, type Locator, type Page } from "@playwright/test";
import { readCellMetrics, readCellProbe, readCellText } from "./helpers/cell-probe";

async function clickCellOwner(page: Page, surface: Locator, id: string) {
  const canvas = surface.locator("canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  const metrics = await readCellMetrics(surface);
  const frame = await readCellProbe(surface);
  const cell = frame.cells.find((cell) => cell.ownerId === id);
  expect(cell).toBeDefined();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.click(bounds.x + (cell!.x + 0.5) * metrics.cellWidth,
    bounds.y + (cell!.y + 0.5) * metrics.cellHeight);
}

test("Toggle keeps pressed state after mouse exit and supports keyboard release", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/toggle");
  const surface = page.locator('[data-cell-probe="component-toggle"]');
  const toggle = surface.getByRole("button", { name: "Bold", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await clickCellOwner(page, surface, "component-toggle-bold");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(0, 0);
  await expect(surface).not.toHaveAttribute("data-cell-hovered");
  await page.getByRole("heading", { name: "Toggle", exact: true }).click();
  await expect(surface).not.toHaveAttribute("data-cell-activation-flash");
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(await readCellText(surface)).toContain("[ B ]");
});

test("Radio mouse and arrow selection share one semantic group", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/radio");
  const surface = page.locator('[data-cell-probe="component-radio"]');
  const group = surface.getByRole("radiogroup", { name: "Appearance" });
  await expect(group.getByRole("radio")).toHaveCount(3);
  await clickCellOwner(page, surface, "component-radio-dark");
  await expect(group.getByRole("radio", { name: "Dark", exact: true })).toHaveAttribute("aria-checked", "true");
  // Focus exit cancels any optional confirmation before keyboard navigation.
  await page.getByRole("heading", { name: "Radio", exact: true }).click();
  await group.getByRole("radio", { name: "Dark", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(group.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("ArrowDown");
  await expect(group.getByRole("radio", { name: "Light", exact: true })).toHaveAttribute("aria-checked", "true");
  expect(await readCellText(surface)).toContain("(●) Light");
  await page.keyboard.press("Tab");
  await expect(surface.getByRole("button", { name: "value", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(group.getByRole("radio", { name: "Light", exact: true })).toBeFocused();
});

test("Progress playground changes both block snapshot and accessible value", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/progress");
  const surface = page.locator('[data-cell-probe="component-progress"]');
  const bar = surface.getByRole("progressbar");
  await expect(bar).toHaveAttribute("aria-valuenow", "60");
  await surface.getByRole("slider", { name: "value", exact: true }).focus();
  await page.keyboard.press("End");
  await expect(bar).toHaveAttribute("aria-valuenow", "100");
  expect(await readCellText(surface)).toContain("█".repeat(20));
  await page.keyboard.press("Home");
  await expect(bar).toHaveAttribute("aria-valuenow", "0");
  expect(await readCellText(surface)).toContain("░".repeat(20));
});

test("Separator changes orientation through its Cell Select", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/separator");
  const surface = page.locator('[data-cell-probe="component-separator"]');
  await expect(surface.getByRole("separator")).toHaveAttribute("aria-orientation", "horizontal");
  await surface.getByRole("button", { name: "direction" }).evaluate((element: HTMLElement) => element.click());
  await surface.getByRole("option", { name: "vertical" }).evaluate((element: HTMLElement) => element.click());
  await expect(surface.getByRole("separator")).toHaveAttribute("aria-orientation", "vertical");
  expect((await readCellText(surface)).split("\n").filter((line) => line.includes("│")).length).toBeGreaterThanOrEqual(5);
});
