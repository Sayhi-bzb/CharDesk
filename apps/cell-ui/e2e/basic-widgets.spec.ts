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
  await page.goto("/#/components/toggle");
  const surface = page.locator('[data-cell-probe="component-toggle"]');
  const toggle = surface.getByRole("button", { name: "Bold", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await clickCellOwner(page, surface, "component-toggle-bold");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(0, 0);
  await expect(surface).not.toHaveAttribute("data-cell-hovered");
  await page.getByRole("heading", { name: "Toggle", exact: true }).click();
  await expect(surface).not.toHaveAttribute("data-cell-activation-flash");
  await expect(surface).not.toHaveAttribute("data-cell-confirmation-phase");
  const idle = await readCellProbe(surface);
  expect(idle.text).toContain("● Bold");
  expect(idle.cells.filter((cell) => cell.ownerId === "component-toggle-bold"
    && cell.style.backgroundColor !== undefined)).toHaveLength(0);
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(await readCellText(surface)).toContain("○ Bold");
});

test("Radio mouse and arrow selection share one semantic group", async ({ page }) => {
  await page.goto("/#/components/radio");
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
  await expect(surface).not.toHaveAttribute("data-cell-confirmation-phase");
  await page.keyboard.press("ArrowDown");
  await expect(group.getByRole("radio", { name: "Light", exact: true })).toHaveAttribute("aria-checked", "true");
  expect(await readCellText(surface)).toContain("(●) Light");
  await page.keyboard.press("Tab");
  await expect(surface.getByRole("checkbox", { name: "disabled", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(group.getByRole("radio", { name: "Light", exact: true })).toBeFocused();
});

test("Progress preview has no redundant value control or empty props panel", async ({ page }) => {
  await page.goto("/#/components/progress");
  const surface = page.locator('[data-cell-probe="component-progress"]');
  const bar = surface.getByRole("progressbar");
  await expect(bar).toHaveAttribute("aria-valuenow", "60");
  await expect(surface.getByRole("slider")).toHaveCount(0);
  expect(await readCellText(surface)).toContain("█".repeat(12) + "░".repeat(8));
  expect(await readCellText(surface)).not.toContain("│");
});

test("Separator changes orientation through its Cell Select", async ({ page }) => {
  await page.goto("/#/components/separator");
  const surface = page.locator('[data-cell-probe="component-separator"]');
  await expect(surface.getByRole("separator")).toHaveAttribute("aria-orientation", "horizontal");
  await surface.getByRole("button", { name: "direction" }).evaluate((element: HTMLElement) => element.click());
  await surface.getByRole("option", { name: "vertical" }).evaluate((element: HTMLElement) => element.click());
  await expect(surface.getByRole("separator")).toHaveAttribute("aria-orientation", "vertical");
  expect((await readCellText(surface)).split("\n").filter((line) => line.includes("│")).length).toBeGreaterThanOrEqual(5);
});
