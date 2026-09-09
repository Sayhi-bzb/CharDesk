import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test("discrete Cell controls share press and activation-flash feedback", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/button");
  const buttonSurface = page.getByLabel("Button component");
  const initial = await readCellProbe(buttonSurface);
  const saveCell = initial.cells.find((cell) => cell.ownerId === "component-button-save");
  const canvas = buttonSurface.locator("canvas").first();
  const bounds = await canvas.boundingBox();
  expect(saveCell).toBeDefined();
  expect(bounds).not.toBeNull();
  const point = {
    x: bounds!.x + (saveCell!.x + 0.5) * bounds!.width / initial.viewport.width,
    y: bounds!.y + (saveCell!.y + 0.5) * bounds!.height / initial.viewport.height,
  };

  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await expect(buttonSurface).toHaveAttribute("data-cell-press-active", "component-button-save");
  const pressed = await readCellProbe(buttonSurface);
  const pressedCell = pressed.cells.find((cell) => (
    cell.ownerId === "component-button-save" && cell.x === saveCell!.x && cell.y === saveCell!.y
  ));
  expect(pressed.text).toContain("Save");
  expect(pressed.text).not.toContain("Saved");
  expect(pressedCell?.style.backgroundColor).toBeTruthy();
  expect(pressedCell?.style.color).toBeTruthy();

  await page.mouse.move(bounds!.x + bounds!.width + 10, point.y);
  await expect(buttonSurface).not.toHaveAttribute("data-cell-press-active");
  await page.mouse.move(point.x, point.y);
  await expect(buttonSurface).toHaveAttribute("data-cell-press-active", "component-button-save");
  await page.mouse.up();
  await expect(buttonSurface).not.toHaveAttribute("data-cell-press-active");
  await expect(buttonSurface).toHaveAttribute("data-cell-activation-flash", "component-button-save");
  await expect(buttonSurface).not.toHaveAttribute("data-cell-activation-flash", { timeout: 1_000 });
  expect((await readCellProbe(buttonSurface)).text).not.toContain("Saved");

  await page.goto("/exp/web-tui/#/components/select");
  const selectSurface = page.getByLabel("Select component");
  await selectSurface.focus();
  await page.keyboard.down("Enter");
  await expect(selectSurface).toHaveAttribute("data-cell-press-active", "component-select-trigger");
  await expect(page.getByRole("button", { name: "Theme" })).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.up("Enter");
  await expect(selectSurface).not.toHaveAttribute("data-cell-press-active");
  await expect(selectSurface).toHaveAttribute("data-cell-activation-flash", "component-select-trigger");

  await page.goto("/exp/web-tui/#/components/checkbox");
  const checkboxSurface = page.getByLabel("Checkbox component");
  const autosave = page.getByRole("checkbox", { name: "Autosave" });
  await checkboxSurface.focus();
  await page.keyboard.down("Space");
  await expect(checkboxSurface).toHaveAttribute("data-cell-press-active", "component-checkbox-autosave");
  await expect(autosave).toHaveAttribute("aria-checked", "false");
  await page.keyboard.up("Space");
  await expect(checkboxSurface).not.toHaveAttribute("data-cell-press-active");
  await expect(checkboxSurface).toHaveAttribute("data-cell-activation-flash", "component-checkbox-autosave");
});
