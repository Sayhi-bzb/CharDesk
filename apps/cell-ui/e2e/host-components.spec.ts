import { expect, test } from "@playwright/test";
import { canvasFor, cellPoint, ownerBounds, ownerCells, readCellMetrics, readCellProbe } from "./helpers/cell-probe";

test("Menu page switches menubar categories, opens a submenu, and returns focus", async ({ page }) => {
  await page.goto("/#/components/menu");
  await expect(page.getByRole("heading", { name: "Menu", level: 1 })).toBeVisible();
  const trigger = page.getByRole("button", { name: "File menu" });
  for (const title of ["Edit", "View"]) {
    await expect(page.getByRole("button", { name: `${title} menu` })).toBeVisible();
  }
  const preview = page.locator('[data-cell-probe="component-menu"]');
  const idle = await readCellProbe(preview);
  expect(idle.text).not.toContain("Cell UI");
  expect(idle.text).not.toContain("Choose a command");
  const file = ownerBounds(idle, "component-menu-file-trigger/text[0]");
  const edit = ownerBounds(idle, "component-menu-edit-trigger/text[0]");
  expect(edit.x - file.x - file.width).toBe(4);
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu", { name: "File" })).toBeVisible();
  const active = await readCellProbe(preview);
  expect(ownerCells(active, "component-menu-file-trigger").length).toBe(2);
  expect(ownerCells(active, "component-menu-file-trigger/text[0]")
    .some((cell) => cell.style.backgroundColor !== undefined)).toBe(true);
  expect(ownerCells(active, "component-menu-edit-trigger/text[0]")[0]?.style.backgroundColor)
    .not.toBe(ownerCells(active, "component-menu-file-trigger/text[0]")[0]?.style.backgroundColor);
  const editPoint = await cellPoint(preview, edit.x + 1, edit.y);
  await page.mouse.click(editPoint.x, editPoint.y);
  await expect(page.getByRole("menu", { name: "Edit" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Undo" }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("menu", { name: "File" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("menu", { name: "Edit" })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("menu", { name: "File" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Export" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("menu", { name: "Export" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "As Text" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-cell-overlay-portal=""]')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("Menu uses one command model in Rich and Text presentations", async ({ page }) => {
  await page.goto("/#/components/menu");
  const preview = page.locator('[data-cell-probe="component-menu"]');
  const trigger = page.getByRole("button", { name: "File menu" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const richMenu = page.getByRole("menu", { name: "File" });
  await expect(richMenu).toBeVisible();
  const richProbe = await readCellProbe(page.locator('[data-cell-probe="component-menu"]'));
  expect(richProbe.text).toContain("File");
  await page.keyboard.press("Escape");
  const presentation = page.getByRole("button", { name: "presentation" });
  await presentation.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("option", { name: "Text" }).focus();
  await page.keyboard.press("Enter");
  await expect(presentation).toHaveAttribute("aria-expanded", "false");
  await expect.poll(async () => (await readCellProbe(preview)).text).toContain("[ File ]");
  await expect.poll(async () => (await readCellProbe(preview)).text).toContain("[ View ]");
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu", { name: "File" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Open…" }).focus();
  const textMenu = page.locator('[data-cell-overlay-portal=""] [role="menu"]');
  await expect(textMenu).toBeVisible();
  await expect.poll(async () => (await readCellProbe(
    page.locator('[data-cell-probe="component-menu-popup"]'),
  )).text).toContain("> Open…");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu", { name: "File" })).toHaveCount(0);
  await presentation.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("option", { name: "Rich" }).focus();
  await page.keyboard.press("Enter");
  await expect(presentation).toHaveAttribute("aria-expanded", "false");
  await expect.poll(async () => (await readCellProbe(preview)).text).not.toContain("[ File ]");
});

test("Menu hover highlights items and switches an open menubar", async ({ page }) => {
  await page.goto("/#/components/menu");
  const preview = page.locator('[data-cell-probe="component-menu"]');
  const edit = ownerBounds(await readCellProbe(preview), "component-menu-edit-trigger/text[0]");
  const editPoint = await cellPoint(preview, edit.x + 1, edit.y);
  await page.mouse.move(editPoint.x, editPoint.y);
  await expect(page.getByRole("menu", { name: "Edit" })).toHaveCount(0);
  const file = ownerBounds(await readCellProbe(preview), "component-menu-file-trigger/text[0]");
  const filePoint = await cellPoint(preview, file.x + 1, file.y);
  await page.mouse.click(filePoint.x, filePoint.y);
  await expect(page.getByRole("menu", { name: "File" })).toBeVisible();
  const popup = page.locator('[data-cell-probe="component-menu-popup"]');
  const open = ownerBounds(await readCellProbe(popup), "component-menu-open");
  const idleColor = ownerCells(await readCellProbe(popup), "component-menu-open")[0]?.style.backgroundColor;
  const openPoint = await cellPoint(popup, open.x + 1, open.y);
  await page.mouse.move(openPoint.x, openPoint.y);
  await expect(popup).toHaveAttribute("data-cell-hovered", "component-menu-open");
  await expect.poll(async () => ownerCells(await readCellProbe(popup), "component-menu-open")
    .some((cell) => cell.style.backgroundColor !== idleColor)).toBe(true);
  const nextEditPoint = await cellPoint(preview, edit.x + 1, edit.y);
  await page.mouse.move(nextEditPoint.x, nextEditPoint.y);
  await expect(page.getByRole("menu", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("menu", { name: "File" })).toHaveCount(0);
});

test("Menu item hover remains visible in dark Text presentation", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/#/components/menu");
  const presentation = page.getByRole("button", { name: "presentation" });
  await presentation.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("option", { name: "Text" }).focus();
  await page.keyboard.press("Enter");
  await expect(presentation).toHaveAttribute("aria-expanded", "false");
  await expect.poll(async () => (await readCellProbe(page.locator('[data-cell-probe="component-menu"]'))).text)
    .toContain("[ File ]");
  const trigger = page.getByRole("button", { name: "File menu" });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  const popup = page.locator('[data-cell-probe="component-menu-popup"]');
  await expect(popup).toBeVisible();
  const open = ownerBounds(await readCellProbe(popup), "component-menu-open");
  const idleColor = ownerCells(await readCellProbe(popup), "component-menu-open")[0]?.style.backgroundColor;
  const point = await cellPoint(popup, open.x + 1, open.y);
  await page.mouse.move(point.x, point.y);
  await expect(popup).toHaveAttribute("data-cell-hovered", "component-menu-open");
  await expect.poll(async () => ownerCells(await readCellProbe(popup), "component-menu-open")
    .some((cell) => cell.style.backgroundColor !== idleColor)).toBe(true);
});

test("Menu content touches its trigger while the hosted guard stays transparent", async ({ page }) => {
  await page.goto("/#/components/menu");
  const preview = page.locator('[data-cell-probe="component-menu"]');
  const triggerBounds = ownerBounds(await readCellProbe(preview), "component-menu-file-trigger/text[0]");
  const triggerPoint = await cellPoint(preview, triggerBounds.x, triggerBounds.y);
  const metrics = await readCellMetrics(preview);
  await page.mouse.click(triggerPoint.x, triggerPoint.y);
  const popup = page.locator('[data-cell-probe="component-menu-popup"]');
  await expect(popup).toBeVisible();
  const popupMetrics = await readCellMetrics(popup);
  const canvas = canvasFor(popup);
  await expect.poll(async () => {
    const rect = await canvas.boundingBox();
    return rect && {
      left: rect.x + popupMetrics.cellWidth,
      top: rect.y + popupMetrics.cellHeight,
    };
  }).toEqual({
    left: triggerPoint.x - metrics.cellWidth * 1.5,
    top: triggerPoint.y + metrics.cellHeight / 2,
  });
  const guardAlpha = await canvas.evaluate((element) =>
    (element as HTMLCanvasElement).getContext("2d")!.getImageData(0, 0, 1, 1).data[3]);
  expect(guardAlpha).toBe(0);
});

test("Menu config applies one surface and frame recipe to both popup levels", async ({ page }) => {
  await page.goto("/#/components/menu");
  const choose = async (control: string, option: string) => {
    const trigger = page.getByRole("button", { name: control, exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("option", { name: option, exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  };
  const file = page.getByRole("button", { name: "File menu" });
  await file.focus();
  await page.keyboard.press("Enter");
  const popup = page.locator('[data-cell-probe="component-menu-popup"]');
  const surfaceColor = ownerCells(await readCellProbe(popup), "component-menu-open")[0]?.style.backgroundColor;
  expect((await readCellProbe(popup)).text).not.toContain("┌");
  expect((await readCellProbe(popup)).viewport.height).toBe(3);
  await page.getByRole("menuitem", { name: "Export" }).focus();
  await page.keyboard.press("ArrowRight");
  const submenu = page.locator('[data-cell-probe="component-menu-submenu-popup"]');
  await expect(submenu).toBeVisible();
  expect((await readCellProbe(submenu)).viewport.height).toBe(2);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  await choose("variant", "ghost");
  await choose("dropdown frame", "bordered");
  await expect(page.getByRole("button", { name: "border shape" })).toBeVisible();
  await file.focus();
  await page.keyboard.press("Enter");
  await expect(popup).toBeVisible();
  const framed = await readCellProbe(popup);
  expect(framed.viewport.height).toBe(5);
  expect(framed.text).toContain("┌");
  expect(ownerCells(framed, "component-menu-open")[0]?.style.backgroundColor).not.toBe(surfaceColor);
  await page.getByRole("menuitem", { name: "Export" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(submenu).toBeVisible();
  const framedSubmenu = await readCellProbe(submenu);
  expect(framedSubmenu.viewport.height).toBe(4);
  expect(framedSubmenu.text).toContain("┌");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await choose("dropdown frame", "none");
  await choose("presentation", "Text");
  await expect(page.getByRole("button", { name: "dropdown frame" })).toHaveCount(0);
  await file.focus();
  await page.keyboard.press("Enter");
  await expect(popup).toBeVisible();
  const textPopup = await readCellProbe(popup);
  expect(textPopup.viewport.height).toBe(5);
  expect(textPopup.text).toContain("┌");
});

test("Menu disabled configuration closes open menus and prevents activation", async ({ page }) => {
  await page.goto("/#/components/menu");
  const preview = page.locator('[data-cell-probe="component-menu"]');
  const file = page.getByRole("button", { name: "File menu" });
  await file.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu", { name: "File" })).toBeVisible();
  await page.getByRole("checkbox", { name: "disabled" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByRole("checkbox", { name: "disabled" })).toHaveAttribute("aria-checked", "true");
  await expect(preview).not.toHaveAttribute("data-cell-confirmation-phase");
  await expect(page.getByRole("menu", { name: "File" })).toHaveCount(0);
  await expect(preview).not.toHaveAttribute("data-cell-confirmation-phase");
  await expect(file).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("checkbox", { name: "disabled" }).focus();
  await page.getByRole("checkbox", { name: "disabled" }).evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("checkbox", { name: "disabled" })).toHaveAttribute("aria-checked", "false");
  await file.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu", { name: "File" })).toBeVisible();
});

test("Sheet page opens a modal side panel and restores trigger focus", async ({ page }) => {
  await page.goto("/#/components/sheet");
  const trigger = page.getByRole("button", { name: "Open sheet" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Workspace settings" });
  await expect(sheet).toBeVisible();
  await expect(page.locator("#root")).toHaveAttribute("inert", "");
  await expect(sheet.getByRole("button", { name: "Close sheet" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("Toast page shows a timed notice without moving focus", async ({ page }) => {
  await page.goto("/#/components/toast");
  const trigger = page.getByRole("button", { name: "Show toast" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const toast = page.locator('[data-cell-toast="component-toast-saved"]');
  await expect(toast).toBeVisible();
  await expect.poll(async () => (await readCellProbe(
    page.locator('[data-cell-probe="component-toast-notice"]'),
  )).text).toContain("Saved to workspace");
  await expect(trigger).toBeFocused();
  await expect(toast).toHaveCount(0, { timeout: 5000 });
});

test("hosted component previews fit a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/#/components/menu");
  await page.getByRole("button", { name: "File menu" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("menuitem", { name: "Export" }).focus();
  await page.keyboard.press("ArrowRight");
  const portals = page.locator('[data-cell-overlay-portal=""]');
  await expect(portals).toHaveCount(2);
  for (const portal of await portals.all()) {
    const surface = portal.locator('[data-cell-surface]');
    const metrics = await readCellMetrics(surface);
    const rect = (await canvasFor(surface).boundingBox())!;
    expect(rect.x + metrics.cellWidth).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width - metrics.cellWidth).toBeLessThanOrEqual(390);
  }
  await page.goto("/#/components/sheet");
  await page.getByRole("button", { name: "Open sheet" }).focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Workspace settings" });
  await expect(sheet).toBeVisible();
  const sheetSurface = sheet.locator('[data-cell-surface]');
  const sheetMetrics = await readCellMetrics(page.locator('[data-cell-probe="component-sheet"]'));
  const rect = (await sheetSurface.locator("canvas").first().boundingBox())!;
  expect(rect.x + sheetMetrics.cellWidth).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width - sheetMetrics.cellWidth).toBeLessThanOrEqual(390);
});
