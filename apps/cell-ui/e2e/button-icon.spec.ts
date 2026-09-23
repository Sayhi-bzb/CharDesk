import { expect, test } from "@playwright/test";
import { cellPoint, readCellProbe } from "./helpers/cell-probe";

const saveGlyph = "\uEB4B"; // cod-save in the pinned Nerd Fonts 3.5.1 catalog.

test("Button content choices keep Cell geometry, semantics, and input behavior", async ({ page }) => {
  await page.goto("/#/components/button");
  const surface = page.getByLabel("Button component");
  const save = surface.getByRole("button", { name: "Save document" });
  const buttonCells = async () => (await readCellProbe(surface)).cells
    .filter((cell) => cell.ownerId === "component-button-save"
      || cell.ownerId?.startsWith("component-button-save/text"))
    .sort((left, right) => left.x - right.x);

  expect((await buttonCells()).map((cell) => cell.text).join("")).toBe(" Save ");
  await surface.getByRole("button", { name: "content" }).evaluate((element: HTMLElement) => element.click());
  await surface.getByRole("option", { name: "icon-only" }).evaluate((element: HTMLElement) => element.click());
  await expect.poll(async () => (await buttonCells()).map((cell) => cell.text).join(""))
    .toBe(` ${saveGlyph} `);
  await expect(save).toHaveAccessibleName("Save document");
  expect((await buttonCells())).toHaveLength(3);

  await expect.poll(() => page.evaluate((glyph) =>
    document.fonts.check("12px 'Symbols Nerd Font Mono'", glyph), saveGlyph)).toBe(true);

  const iconCell = (await buttonCells()).find((cell) => cell.text === saveGlyph)!;
  const point = await cellPoint(surface, iconCell.x, iconCell.y);
  await page.mouse.move(point.x, point.y);
  await expect(surface).toHaveAttribute("data-cell-hovered", "component-button-save");
  await page.mouse.down();
  await expect(surface).toHaveAttribute("data-cell-press-active", "component-button-save");
  await page.mouse.up();
  await expect(surface).not.toHaveAttribute("data-cell-press-active");
  await surface.focus();
  await page.keyboard.down("Enter");
  await expect(surface).toHaveAttribute("data-cell-press-active", "component-button-save");
  await page.keyboard.up("Enter");
  await expect(surface).not.toHaveAttribute("data-cell-press-active");

  await expect(surface).not.toHaveAttribute("data-cell-confirmation-phase");
  await surface.getByRole("button", { name: "content" }).evaluate((element: HTMLElement) => element.click());
  await surface.getByRole("option", { name: "icon + text" }).evaluate((element: HTMLElement) => element.click());
  await expect.poll(async () => (await buttonCells()).map((cell) => cell.text).join(""))
    .toBe(` ${saveGlyph} Save `);
  await expect(save).toHaveAccessibleName("Save document");
  expect((await buttonCells())).toHaveLength(8);
  await expect(surface).not.toHaveAttribute("data-cell-confirmation-phase");

  await surface.getByRole("button", { name: "variant" }).evaluate((element: HTMLElement) => element.click());
  await surface.getByRole("option", { name: "outline" }).evaluate((element: HTMLElement) => element.click());
  await expect.poll(async () => (await readCellProbe(surface)).text)
    .toContain(`[ ${saveGlyph} Save ]`);
  await expect(surface).not.toHaveAttribute("data-cell-confirmation-phase");
  await surface.getByRole("checkbox", { name: "disabled" }).evaluate((element: HTMLElement) => element.click());
  await expect(save).toHaveAttribute("aria-disabled", "true");
  const outlinedIcon = (await buttonCells()).find((cell) => cell.text === saveGlyph)!;
  const outlinedPoint = await cellPoint(surface, outlinedIcon.x, outlinedIcon.y);
  await page.mouse.move(outlinedPoint.x, outlinedPoint.y);
  await expect(surface).not.toHaveAttribute("data-cell-hovered", "component-button-save");
});
