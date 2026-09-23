import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test("Gallery headers expose font and theme without a global border toggle", async ({ page }) => {
  for (const route of ["/#/components/input", "/#/__fixtures/all"]) {
    await page.goto(route);
    const controls = page.locator(".gallery-appearance-controls");
    await expect(controls.getByRole("button")).toHaveCount(2);
    await expect(controls.getByRole("button", { name: /^(Rounded|Square)$/ })).toHaveCount(0);
    await expect(controls.locator('[data-gallery-icon="rounded"], [data-gallery-icon="square"]')).toHaveCount(0);
  }
});

test("rounded is local to the component Preview", async ({ page }) => {
  await page.goto("/#/components/scroll-area");
  const surface = page.getByLabel("ScrollArea component");
  const frame = page.getByRole("button", { name: "frame", exact: true });

  const initial = await readCellProbe(surface);
  expect(initial.cells.some((cell) => (
    cell.ownerId === "component-scroll-area" && "┌┐└┘╭╮╰╯".includes(cell.text)
  ))).toBe(false);

  await frame.evaluate((element: HTMLElement) => element.click());
  await page.getByRole("option", { name: "bordered", exact: true })
    .evaluate((element: HTMLElement) => element.click());
  await expect(page.getByRole("listbox", { name: "frame options" })).toHaveCount(0);

  const bordered = await readCellProbe(surface);
  expect(bordered.cells.some((cell) => (
    cell.ownerId === "component-scroll-area" && "┌┐└┘".includes(cell.text)
  ))).toBe(true);

  const borderShape = page.getByRole("button", { name: "border shape", exact: true });
  await borderShape.evaluate((element: HTMLElement) => element.click());
  await page.getByRole("option", { name: "rounded", exact: true })
    .evaluate((element: HTMLElement) => element.click());
  const changed = await readCellProbe(surface);
  expect(changed.cells.some((cell) => (
    cell.ownerId === "component-scroll-area" && "╭╮╰╯".includes(cell.text)
  ))).toBe(true);

  await page.goto("/#/components/input");
  const input = await readCellProbe(page.getByLabel("Input component"));
  expect(input.cells.some((cell) => (
    cell.ownerId === "component-input-field" && "┌┐└┘╭╮╰╯".includes(cell.text)
  ))).toBe(false);
});
