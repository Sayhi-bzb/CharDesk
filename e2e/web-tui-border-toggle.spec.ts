import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test("Gallery headers expose font and theme without a global border toggle", async ({ page }) => {
  for (const route of ["/exp/web-tui/#/components/input", "/exp/web-tui/#/__fixtures/all"]) {
    await page.goto(route);
    const controls = page.locator(".gallery-appearance-controls");
    await expect(controls.getByRole("button")).toHaveCount(2);
    await expect(controls.getByRole("button", { name: /^(Rounded|Square)$/ })).toHaveCount(0);
    await expect(controls.locator('[data-gallery-icon="rounded"], [data-gallery-icon="square"]')).toHaveCount(0);
  }
});

test("rounded is local to the component Preview", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/scroll-area");
  const surface = page.getByLabel("ScrollArea component");
  const rounded = page.getByRole("checkbox", { name: "rounded" });

  const initial = await readCellProbe(surface);
  expect(initial.cells.some((cell) => (
    cell.ownerId === "component-scroll-area" && "┌┐└┘".includes(cell.text)
  ))).toBe(true);

  await rounded.evaluate((element: HTMLElement) => element.click());
  const changed = await readCellProbe(surface);
  expect(changed.cells.some((cell) => (
    cell.ownerId === "component-scroll-area" && "╭╮╰╯".includes(cell.text)
  ))).toBe(true);

  await page.goto("/exp/web-tui/#/components/input");
  const input = await readCellProbe(page.getByLabel("Input component"));
  expect(input.cells.some((cell) => (
    cell.ownerId === "component-input-field" && "┌┐└┘".includes(cell.text)
  ))).toBe(true);
});
