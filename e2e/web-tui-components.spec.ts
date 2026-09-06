import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

const componentLinks = [
  ["Text", "#component-text"],
  ["Box", "#component-box"],
  ["List", "#component-list"],
  ["ScrollArea", "#component-scroll-area"],
] as const;

test("Gallery navigation groups Core and Components from one manifest", async ({ page }) => {
  await page.goto("/exp/web-tui/");
  const nav = page.getByRole("navigation", { name: "Gallery sections" });
  await expect(nav.locator(".gallery-nav__section-title")).toHaveText(["Core", "Components"]);
  await expect(nav.locator(".gallery-nav__subgroup")).toHaveText([
    "Display and layout",
    "Input and selection",
    "Scrolling",
  ]);
  for (const [name, href] of componentLinks) {
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    await expect(page.locator(href)).toBeVisible();
  }

  await page.setViewportSize({ width: 320, height: 700 });
  await expect(nav.locator(".gallery-nav__section")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("Text and Box expose Cell-native content and layout", async ({ page }) => {
  await page.goto("/exp/web-tui/");
  const text = await readCellProbe(page.locator('[data-cell-probe="component-text"]'));
  expect(text.text).toContain("Plain text");
  expect(text.text).toContain("Unicode: 世界 👋");
  const wrappedRows = new Set(text.cells
    .filter((cell) => cell.ownerId === "component-text-wrap" && cell.text !== " ")
    .map((cell) => cell.y));
  expect(wrappedRows.size).toBeGreaterThan(1);

  const box = await readCellProbe(page.locator('[data-cell-probe="component-box"]'));
  expect(box.text).toContain("Nested boxes");
  expect(box.text).toContain("Left");
  expect(box.text).toContain("Right");
  expect(box.cells.filter((cell) => cell.text === "┌").length).toBe(3);
});

test("List shares focus, selection, disabled state, and semantic actions", async ({ page }) => {
  await page.goto("/exp/web-tui/");
  const section = page.locator("#component-list");
  const surface = section.getByLabel("List component");
  const beta = section.getByRole("option", { name: "Beta" });
  const disabled = section.getByRole("option", { name: "Disabled" });
  await expect(section.getByRole("option")).toHaveCount(4);
  await expect(beta).toHaveAttribute("aria-selected", "true");
  await expect(disabled).toHaveAttribute("aria-disabled", "true");

  await surface.focus();
  await expect(beta).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(section.getByRole("option", { name: "Gamma" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(section.getByRole("option", { name: "Gamma" })).toHaveAttribute("aria-selected", "true");
  await section.getByRole("option", { name: "Alpha" }).evaluate((element: HTMLElement) => element.click());
  await expect(surface).toHaveAttribute("data-cell-focused", "component-list-alpha");
  await expect(section.getByRole("option", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
});

test("ScrollArea responds to keyboard, wheel, and thumb drag without scrolling the page", async ({ page }) => {
  await page.goto("/exp/web-tui/");
  const section = page.locator("#component-scroll-area");
  const surface = section.getByLabel("ScrollArea component");
  const canvas = surface.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  await surface.focus();
  const initial = await readCellProbe(surface);

  await page.keyboard.press("PageDown");
  await expect.poll(async () => (await readCellProbe(surface)).text).not.toBe(initial.text);
  const paged = await readCellProbe(surface);
  expect(paged.text).not.toBe(initial.text);

  const pageY = await page.evaluate(() => window.scrollY);
  await canvas.hover({ position: { x: 80, y: 50 } });
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await readCellProbe(surface)).text).not.toBe(paged.text);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageY);

  const beforeDrag = await readCellProbe(surface);
  const thumb = beforeDrag.cells.find((cell) => "█▀▄".includes(cell.text)
    && cell.ownerId === "component-scroll-area");
  expect(thumb).toBeDefined();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const cellWidth = bounds!.width / beforeDrag.viewport.width;
  const cellHeight = bounds!.height / beforeDrag.viewport.height;
  await page.mouse.move(
    bounds!.x + (thumb!.x + 0.5) * cellWidth,
    bounds!.y + (thumb!.y + 0.5) * cellHeight
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + (thumb!.x + 0.5) * cellWidth,
    bounds!.y + Math.min(beforeDrag.viewport.height - 1.5, thumb!.y + 2.5) * cellHeight,
    { steps: 6 }
  );
  await page.mouse.up();
  await expect.poll(async () => (await readCellProbe(surface)).text).not.toBe(beforeDrag.text);
});
