import { expect, test, type Page } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

async function choose(page: Page, label: string, option: string) {
  const trigger = page.getByRole("button", { name: label, exact: true });
  await trigger.evaluate((element: HTMLElement) => element.click());
  await page.getByRole("option", { name: option, exact: true })
    .evaluate((element: HTMLElement) => element.click());
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
}

test("Box and ScrollArea keep local surface and frame choices", async ({ page }) => {
  await page.goto("/#/__fixtures/box");
  const box = page.getByLabel("Box component");
  await choose(page, "variant", "surface");
  const surface = await readCellProbe(box);
  expect(surface.cells.find((cell) => cell.ownerId === "component-box-preview" && cell.text === " ")?.style.backgroundColor)
    .toBeTruthy();
  await choose(page, "frame", "bordered");
  await expect(page.getByRole("button", { name: "border shape", exact: true })).toBeAttached();
  expect((await readCellProbe(box)).cells.some((cell) => cell.ownerId === "component-box-preview" && cell.text === "┌"))
    .toBe(true);
  await choose(page, "border shape", "rounded");
  expect((await readCellProbe(box)).cells.some((cell) => cell.ownerId === "component-box-preview" && cell.text === "╭"))
    .toBe(true);
  await choose(page, "frame", "none");
  await expect(page.getByRole("button", { name: "border shape", exact: true })).toHaveCount(0);
  await choose(page, "frame", "bordered");
  await page.getByRole("button", { name: "border shape", exact: true }).focus();
  await expect.poll(async () => (await readCellProbe(box)).text).toContain("rounded");

  await page.goto("/#/components/scroll-area");
  const scroll = page.getByLabel("ScrollArea component");
  await choose(page, "variant", "surface");
  await choose(page, "frame", "bordered");
  await choose(page, "border shape", "rounded");
  const framed = await readCellProbe(scroll);
  expect(framed.cells.some((cell) => cell.ownerId === "component-scroll-area" && cell.text === "╭"))
    .toBe(true);
  expect(framed.cells.some((cell) => cell.ownerId === "component-scroll-area" && cell.text === " "
    && cell.style.backgroundColor !== undefined)).toBe(true);
});

test("Button and Input variant controls change Cell backgrounds and chrome", async ({ page }) => {
  await page.goto("/#/components/button");
  const button = page.getByLabel("Button component");
  await choose(page, "variant", "outline");
  expect((await readCellProbe(button)).cells.some((cell) => cell.ownerId === "component-button-save" && cell.text === "["))
    .toBe(true);
  await choose(page, "variant", "surface");
  expect((await readCellProbe(button)).cells.some((cell) => cell.ownerId === "component-button-save"
    && cell.style.backgroundColor !== undefined)).toBe(true);

  await page.goto("/#/components/input");
  const input = page.getByLabel("Input component");
  const background = (await readCellProbe(input)).cells.find((cell) =>
    cell.ownerId === "component-input-field" && cell.text === " ")?.style.backgroundColor;
  expect(background).toBeTruthy();
  await choose(page, "variant", "ghost");
  expect((await readCellProbe(input)).cells.find((cell) =>
    cell.ownerId === "component-input-field" && cell.text === " ")?.style.backgroundColor).toBeUndefined();
});

test("Select and Combobox apply dropdown frames and ghost surfaces", async ({ page }) => {
  await page.goto("/#/components/select");
  const select = page.getByLabel("Select component");
  await choose(page, "variant", "ghost");
  expect((await readCellProbe(select)).cells.find((cell) =>
    cell.ownerId === "component-select-trigger" && cell.text === " ")?.style.backgroundColor).toBeUndefined();
  await choose(page, "dropdown frame", "bordered");
  await choose(page, "border shape", "rounded");
  await select.getByRole("button", { name: "Theme" }).evaluate((element: HTMLElement) => element.click());
  expect((await readCellProbe(select)).overlays.find((overlay) => overlay.rootId === "component-select-content")?.text)
    .toContain("╭");

  await page.goto("/#/components/combobox");
  const combo = page.getByLabel("Combobox component");
  await choose(page, "variant", "ghost");
  expect((await readCellProbe(combo)).cells.find((cell) =>
    cell.ownerId === "component-combobox-input" && cell.text === " ")?.style.backgroundColor).toBeUndefined();
  await choose(page, "dropdown frame", "bordered");
  await choose(page, "border shape", "rounded");
  await page.getByRole("combobox", { name: "Font" }).click();
  await expect.poll(async () => (await readCellProbe(combo)).overlays
    .find((overlay) => overlay.rootId === "component-combobox-content")?.text).toContain("╭");
});

test("Progress and Separator variants change their tracks and glyphs", async ({ page }) => {
  await page.goto("/#/components/progress");
  const progress = page.getByLabel("Progress component");
  await choose(page, "variant", "outline");
  const progressCells = (await readCellProbe(progress)).cells.filter((cell) => cell.ownerId === "component-progress-bar");
  expect(progressCells.map((cell) => cell.text).join("")).toMatch(/^\[[/-]{18}\]$/);
  await expect(progress.getByRole("checkbox", { name: "number" })).toHaveAttribute("aria-checked", "false");

  await page.goto("/#/components/separator");
  const separator = page.getByLabel("Separator component");
  await choose(page, "variant", "slash");
  const cells = (await readCellProbe(separator)).cells.filter((cell) => cell.ownerId === "component-separator-line");
  expect(cells.map((cell) => cell.text).join("")).toBe("/".repeat(20));
  await expect(separator.getByRole("separator")).toHaveAttribute("aria-orientation", "horizontal");
});
