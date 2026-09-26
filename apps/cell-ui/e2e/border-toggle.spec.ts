import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test("Gallery headers expose font and theme without per-component controls", async ({ page }) => {
  for (const route of ["/#/components/input", "/#/__fixtures/all"]) {
    await page.goto(route);
    const controls = page.locator('[data-cell-probe="gallery-header"]');
    await expect(controls.getByRole("button", { name: "Rich" })).toHaveCount(0);
    await expect(controls.getByRole("button", { name: "Font: Fusion" })).toBeAttached();
    await expect(controls.getByRole("button", { name: "Dark" })).toBeAttached();
    await expect(controls.getByRole("button", { name: /^(Rounded|Square)$/ })).toHaveCount(0);
    await expect(controls.locator('[data-gallery-icon="rounded"], [data-gallery-icon="square"]')).toHaveCount(0);
  }
});

test("unframed components do not inherit border glyphs", async ({ page }) => {
  await page.goto("/#/components/scroll-area");
  const surface = page.getByLabel("ScrollArea component");

  const initial = await readCellProbe(surface);
  expect(initial.cells.some((cell) => (
    cell.ownerId === "component-scroll-area" && "┌┐└┘╭╮╰╯".includes(cell.text)
  ))).toBe(false);

  await page.goto("/#/components/input");
  const input = await readCellProbe(page.getByLabel("Input component"));
  expect(input.cells.some((cell) => (
    cell.ownerId === "component-input-field" && "┌┐└┘╭╮╰╯".includes(cell.text)
  ))).toBe(false);
});
