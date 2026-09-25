import { expect, test } from "@playwright/test";
import { cellPoint, readCellProbe } from "./helpers/cell-probe";

test("Dialog uses Canvas input, named semantics and focus restoration", async ({ page }) => {
  await page.goto("/#/components/dialog");
  const surface = page.locator('[data-cell-probe="component-dialog"]');
  const canvas = surface.locator("canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  const probe = await readCellProbe(surface);
  const cell = probe.cells.find((cell) => cell.ownerId === "dialog-open")!;
  const point = await cellPoint(surface, cell.x, cell.y);
  await page.mouse.click(point.x, point.y);
  const dialog = surface.getByRole("dialog", { name: "Continue?", exact: true });
  await expect(dialog).toBeAttached();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAccessibleDescription("This is a preview confirmation.");
  const cancel = surface.getByRole("button", { name: "Cancel", exact: true });
  await expect(surface).toHaveAttribute("data-cell-focused", "dialog-cancel");
  await page.keyboard.press("Tab");
  await expect(surface.getByRole("button", { name: "Continue", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  expect((await readCellProbe(surface)).text).toContain("Continue?");
  expect((await readCellProbe(surface)).text).toContain("└──────────────────────────────────┘");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(surface.getByRole("button", { name: "Open dialog", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
});

test("Dialog config changes its opaque variant and border", async ({ page }) => {
  await page.goto("/#/components/dialog");
  const surface = page.locator('[data-cell-probe="component-dialog"]');
  const open = surface.getByRole("button", { name: "Open dialog", exact: true });
  const select = async (label: string, value: string) => {
    const trigger = surface.getByRole("button", { name: label, exact: true });
    await trigger.evaluate((element: HTMLElement) => element.click());
    await surface.getByRole("option", { name: value, exact: true })
      .evaluate((element: HTMLElement) => element.click());
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  };
  await expect(surface.getByRole("checkbox", { name: "modal" })).toHaveCount(0);
  await expect(surface.getByRole("checkbox", { name: "closeOnOutsideClick" })).toHaveCount(0);
  await expect(surface.getByRole("button", { name: "variant" })).toBeAttached();
  await expect(surface.getByRole("button", { name: "border" })).toBeAttached();
  await open.evaluate((element: HTMLElement) => element.click());
  const dialog = surface.getByRole("dialog", { name: "Continue?", exact: true });
  await expect(dialog).toBeAttached();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  const elevated = (await readCellProbe(surface)).overlays.find((overlay) => overlay.rootId === "demo-dialog");
  expect(elevated?.text).toContain("┌");
  const elevatedBackground = elevated?.cells.find((cell) => cell.ownerId === "demo-dialog" && cell.text === " ")?.style.backgroundColor;
  expect(elevatedBackground).toBeTruthy();
  const bounds = (await surface.locator("canvas").first().boundingBox())!;
  await page.mouse.click(bounds.x + 2, bounds.y + 2);
  await expect(dialog).toHaveCount(0);

  await select("variant", "ghost");
  await select("border", "none");
  await open.evaluate((element: HTMLElement) => element.click());
  await expect(dialog).toBeAttached();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  const borderless = (await readCellProbe(surface)).overlays.find((overlay) => overlay.rootId === "demo-dialog");
  expect(borderless?.text).not.toMatch(/[┌┐└┘╭╮╰╯]/u);
  const ghostBackground = borderless?.cells.find((cell) => cell.ownerId === "demo-dialog" && cell.text === " ")?.style.backgroundColor;
  expect(ghostBackground).toBeTruthy();
  expect(ghostBackground).not.toBe(elevatedBackground);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await select("border", "rounded");
  await open.evaluate((element: HTMLElement) => element.click());
  await expect(dialog).toBeAttached();
  expect((await readCellProbe(surface)).overlays.find((overlay) => overlay.rootId === "demo-dialog")?.text)
    .toContain("╭");
});
