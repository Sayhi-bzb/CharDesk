import { expect, test } from "@playwright/test";

test("Menu, Tree, Tabs, and Grid share keyboard, pointer, and semantic state", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/exp/web-tui/#/__fixtures/all");
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

  await section.getByRole("menuitem", { name: "Open file" })
    .evaluate((element: HTMLElement) => element.click());
  await expect(surface).toHaveAttribute("data-cell-focused", "menu-open");
});

test("CellSurface owns rectangle selection without product wiring", async ({ page }) => {
  await page.goto("/exp/web-tui/#/__fixtures/all");
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
