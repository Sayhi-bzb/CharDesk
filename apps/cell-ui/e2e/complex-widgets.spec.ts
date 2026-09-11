import { expect, test } from "@playwright/test";
import { copyCellRange, readCellMetrics, readCellProbe } from "./helpers/cell-probe";

test("Grid has one remembered Tab entry and range copy never selects a cell", async ({ page }) => {
  await page.goto("/#/__fixtures/all");
  const surface = page.getByLabel("Complex widget surface");
  await surface.scrollIntoViewIfNeeded();
  await surface.evaluate((element) => {
    const after = document.createElement("input");
    after.id = "grid-exit-sentinel";
    after.setAttribute("aria-label", "After Grid");
    element.after(after);
  });
  const preview = surface.getByRole("tab", { name: "Preview", exact: true });
  await preview.focus();
  await page.keyboard.press("Tab");
  await expect(surface.getByRole("gridcell", { name: "Name", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const value = surface.getByRole("gridcell", { name: "Value", exact: true });
  await expect(value).toBeFocused();
  await expect(value).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("Tab");
  await expect(page.locator("#grid-exit-sentinel")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(value).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(preview).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(value).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(value).toHaveAttribute("aria-selected", "true");
  await expect(surface).not.toHaveAttribute("data-cell-confirmation-phase");

  const probe = await readCellProbe(surface);
  const row = probe.cells.find((cell) => cell.ownerId === "property-value" && cell.text === "✓")!;
  expect(row).toBeDefined();
  const metrics = await readCellMetrics(surface);
  const bounds = (await surface.locator("canvas").boundingBox())!;
  await page.keyboard.down("Alt");
  await page.keyboard.down("Meta");
  await page.mouse.move(bounds.x + 0.5 * metrics.cellWidth, bounds.y + (row.y + 0.5) * metrics.cellHeight);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 35.5 * metrics.cellWidth, bounds.y + (row.y + 1.5) * metrics.cellHeight, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await page.keyboard.up("Alt");
  await expect(value).toHaveAttribute("aria-selected", "true");
  await expect(surface.getByRole("gridcell", { name: "Dark", exact: true })).toHaveAttribute("aria-selected", "false");
  const copied = await copyCellRange(surface);
  expect(copied).toContain("✓ Value");
  expect(copied).toContain("Theme");
});

test("Menu, Tree, Tabs, and Grid share keyboard, pointer, and semantic state", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/#/__fixtures/all");
  await page.waitForLoadState("networkidle");
  expect(pageErrors).toEqual([]);

  const section = page.locator("#complex");
  const surface = section.getByLabel("Complex widget surface");
  const menu = section.getByRole("menu", { name: "File menu" });
  const tree = section.getByRole("tree", { name: "Files" });
  const tabs = section.getByRole("tablist", { name: "Views" });
  const grid = section.getByRole("grid", { name: "Properties" });
  await expect(menu).toBeAttached();
  await expect(tree).toBeAttached();
  await expect(tabs).toHaveAttribute("aria-orientation", "horizontal");
  await expect(grid).toHaveAttribute("aria-rowcount", "2");
  await expect(grid).toHaveAttribute("aria-colcount", "2");

  await section.getByRole("menuitem", { name: "Open file" }).focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(surface).toHaveAttribute("data-cell-focused", "menu-save");
  await expect(section.getByRole("menuitem", { name: "Save" })).toBeFocused();

  const source = section.getByRole("treeitem", { name: /src/ });
  await source.focus();
  await source.evaluate((element: HTMLElement) => element.click());
  await expect(source).toHaveAttribute("aria-expanded", "false");
  await expect(section.getByRole("treeitem", { name: /index\.ts/ })).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(source).toHaveAttribute("aria-expanded", "true");
  await expect(section.getByRole("treeitem", { name: /index\.ts/ })).toHaveCount(1);
  await page.keyboard.press("ArrowLeft");
  await expect(source).toHaveAttribute("aria-expanded", "false");
  await expect(section.getByRole("treeitem", { name: /index\.ts/ })).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(source).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  await expect(surface).toHaveAttribute("data-cell-focused", "tree-index");
  await expect(section.getByRole("treeitem", { name: /index\.ts/ })).toBeFocused();

  await section.getByRole("tab", { name: "Code" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(section.getByRole("tab", { name: "Preview" }))
    .toHaveAttribute("aria-selected", "true");
  await expect(section.getByRole("tab", { name: "Preview" })).toBeFocused();
  await expect(section.getByRole("tabpanel", { name: "Preview" })).toBeAttached();

  await section.getByRole("gridcell", { name: "Name" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(surface).toHaveAttribute("data-cell-focused", "property-dark");
  await expect(section.getByRole("gridcell", { name: "Dark" })).toBeFocused();

  const canvas = surface.locator("canvas");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Complex widget Canvas is not visible.");
  await canvas.click({
    position: {
      x: 5.5 * bounds.width / 44,
      y: 0.5 * bounds.height / 16,
    },
  });
  await expect(surface).toHaveAttribute("data-cell-focused", "menu-new");
  await expect(surface).toHaveAttribute("data-cell-confirmation-phase", /[0-3]/);

  await section.getByRole("menuitem", { name: "Open file" })
    .evaluate((element: HTMLElement) => element.click());
  await expect(surface).toHaveAttribute("data-cell-focused", "menu-new");
  await expect(surface).not.toHaveAttribute("data-cell-confirmation-phase");
  await section.getByRole("menuitem", { name: "Open file" })
    .evaluate((element: HTMLElement) => element.click());
  await expect(surface).toHaveAttribute("data-cell-focused", "menu-open");
});

test("CellSurface owns rectangle selection without product wiring", async ({ page }) => {
  await page.goto("/#/__fixtures/all");
  await page.waitForLoadState("networkidle");
  const surface = page.getByLabel("Complex widget surface");
  const canvas = surface.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Complex widget Canvas is not visible.");
  const cellWidth = bounds.width / 44;
  const cellHeight = bounds.height / 16;

  await page.keyboard.down("Alt");
  await page.keyboard.down("Meta");
  await page.mouse.move(bounds.x + 0.5 * cellWidth, bounds.y + 8.5 * cellHeight);
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + 43.5 * cellWidth,
    bounds.y + 10.5 * cellHeight,
    { steps: 8 }
  );
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await page.keyboard.up("Alt");

  await expect(surface).toHaveAttribute("data-cell-range", "0,8,44,3");
  const border = `┌${"─".repeat(42)}┐`;
  const expected = [
    border,
    `│Code content${" ".repeat(30)}│`,
    `└${"─".repeat(42)}┘`,
  ].join("\n");
  const copied = await surface.evaluate((element) => {
    const clipboard = new DataTransfer();
    element.dispatchEvent(new ClipboardEvent("copy", {
      bubbles: true,
      cancelable: true,
      clipboardData: clipboard,
    }));
    return clipboard.getData("text/plain");
  });
  expect(copied).toBe(expected);

  await surface.press("Escape");
  await expect(surface).not.toHaveAttribute("data-cell-range");
});
