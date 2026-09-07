import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

const componentLinks = [
  ["Text", "#/components/text"],
  ["Box", "#/components/box"],
  ["List", "#/components/list"],
  ["ScrollArea", "#/components/scroll-area"],
] as const;

test("component catalog drives concise, addressable documentation", async ({ page }) => {
  await page.goto("/exp/web-tui/");
  const nav = page.getByRole("navigation", { name: "Components" });
  await expect(page.getByRole("heading", { name: "Text", level: 1 })).toBeVisible();
  await expect(nav.locator(".gallery-nav__title")).toHaveText("Components");
  await expect(nav.getByRole("link")).toHaveCount(4);
  for (const [name, href] of componentLinks) {
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }
  await expect(nav.getByRole("link", { name: "Text", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "Preview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Distribution" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "API" })).toBeVisible();
  await expect(page.getByText("private workspace package", { exact: false })).toBeVisible();
  await expect(page.getByText("not published to npm", { exact: false })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator("#core, #complex, #editor, #overlay, #virtualization")).toHaveCount(0);

  await nav.getByRole("link", { name: "Box", exact: true }).click();
  await expect(page).toHaveURL(/#\/components\/box$/);
  await expect(page.getByRole("heading", { name: "Box", level: 1 })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Box", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Text", level: 1 })).toBeVisible();

  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("unknown component routes fail honestly", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/missing");
  await expect(page.getByRole("heading", { name: "Component not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Text" })).toHaveAttribute("href", "#/components/text");
});

test("Text and Box expose Cell-native content and layout", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/text");
  const text = await readCellProbe(page.locator('[data-cell-probe="component-text"]'));
  for (const line of [
    "◆ Plain text · READY",
    "→ Unicode: 世界 👋",
    "↔ Move: ← ↑ ↓ →",
    "✓ Status: PASS · IDLE",
    "∞ Math: ≠ ≤ ≥ ± × ÷",
    "▓ Signal: ░▒▓█",
    "↳ Wraps on integer Cell",
  ]) expect(text.text).toContain(line);
  expect(text.viewport).toEqual({ width: 36, height: 12 });
  const wrappedRows = new Set(text.cells
    .filter((cell) => cell.ownerId === "component-text-wrap" && cell.text !== " ")
    .map((cell) => cell.y));
  expect(wrappedRows.size).toBeGreaterThan(1);

  await page.goto("/exp/web-tui/#/components/box");
  const box = await readCellProbe(page.locator('[data-cell-probe="component-box"]'));
  expect(box.text).toContain("Nested boxes");
  expect(box.text).toContain("Left");
  expect(box.text).toContain("Right");
  expect(box.cells.filter((cell) => cell.text === "┌").length).toBe(3);
});

test("Cell Range clears when Preview focus moves outside its Surface", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/text");
  const surface = page.getByLabel("Text component");
  const canvas = surface.locator("canvas");
  const probe = await readCellProbe(surface);
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const selectRange = async () => {
    await page.keyboard.down("Alt");
    await page.keyboard.down("Meta");
    await page.mouse.move(bounds!.x + bounds!.width / probe.viewport.width / 2, bounds!.y + bounds!.height / probe.viewport.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up("Meta");
    await page.keyboard.up("Alt");
    await expect(surface).toHaveAttribute("data-cell-range");
  };

  await selectRange();
  await page.getByRole("heading", { name: "Text", level: 1 }).click();
  await expect(surface).not.toHaveAttribute("data-cell-range");

  await selectRange();
  await page.getByRole("button", { name: /^(Dark|Light)$/ }).click();
  await expect(surface).not.toHaveAttribute("data-cell-range");
});

test("List shares focus, selection, disabled state, and semantic actions", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/list");
  const surface = page.getByLabel("List component");
  const beta = page.getByRole("option", { name: "Beta" });
  const disabled = page.getByRole("option", { name: "Disabled" });
  await expect(page.getByRole("option")).toHaveCount(4);
  await expect(beta).toHaveAttribute("aria-selected", "true");
  await expect(disabled).toHaveAttribute("aria-disabled", "true");

  await surface.focus();
  await expect(beta).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Gamma" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: "Gamma" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("option", { name: "Alpha" }).evaluate((element: HTMLElement) => element.click());
  await expect(surface).toHaveAttribute("data-cell-focused", "component-list-alpha");
  await expect(page.getByRole("option", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
});

test("ScrollArea responds to keyboard, wheel, and thumb drag without scrolling the page", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/scroll-area");
  const surface = page.getByLabel("ScrollArea component");
  const canvas = surface.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  await surface.focus();
  const initial = await readCellProbe(surface);

  await page.keyboard.press("PageDown");
  await expect.poll(async () => (await readCellProbe(surface)).text).not.toBe(initial.text);
  const paged = await readCellProbe(surface);
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
  await page.mouse.move(bounds!.x + (thumb!.x + 0.5) * cellWidth, bounds!.y + (thumb!.y + 0.5) * cellHeight);
  await page.mouse.down();
  await page.mouse.move(
    bounds!.x + (thumb!.x + 0.5) * cellWidth,
    bounds!.y + Math.min(beforeDrag.viewport.height - 1.5, thumb!.y + 2.5) * cellHeight,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect.poll(async () => (await readCellProbe(surface)).text).not.toBe(beforeDrag.text);
});
