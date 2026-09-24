import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test("Combobox shows its default interaction", async ({ page }) => {
  await page.goto("/#/components/combobox");
  const surface = page.getByLabel("Combobox component");
  const input = surface.getByRole("combobox", { name: "Font" });
  await expect(page.getByRole("button", { name: "value", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "variant", exact: true })).toBeAttached();
  await expect(page.getByRole("button", { name: "dropdown frame", exact: true })).toBeAttached();
  const initial = await readCellProbe(surface);
  const elevatedBackground = initial.cells.find((cell) =>
    cell.ownerId === "component-combobox-input" && cell.text === " "
  )?.style.backgroundColor;
  expect(elevatedBackground).toBeTruthy();

  await input.click();
  const elevatedOverlay = (await readCellProbe(surface)).overlays.find((overlay) =>
    overlay.rootId === "component-combobox-content"
  );
  expect(elevatedOverlay?.cells.find((cell) =>
    cell.ownerId === "component-combobox-fusion" && cell.text === " "
  )?.style.backgroundColor).toBe(elevatedBackground);
  await input.press("Escape");
});

test("Combobox input row opens on click, keeps editing open, and closes from its arrow", async ({ page }) => {
  await page.goto("/#/components/combobox");
  const surface = page.getByLabel("Combobox component");
  const input = surface.getByRole("combobox", { name: "Font" });
  const probe = await readCellProbe(surface);
  const arrow = probe.cells.find((cell) => cell.ownerId === "component-combobox-input" && cell.text === "▾");
  const firstInputCell = probe.cells.find((cell) => cell.ownerId === "component-combobox-input" && cell.y === arrow?.y);
  expect(arrow).toBeDefined();
  expect(firstInputCell).toBeDefined();
  expect(firstInputCell?.text).toBe(">");
  expect(probe.cells.find((cell) => cell.ownerId === "component-combobox-input"
    && cell.x === firstInputCell!.x + 1 && cell.y === firstInputCell!.y)?.text).toBe(" ");
  const canvas = surface.locator("canvas").first();
  const bounds = await canvas.boundingBox();
  const metrics = probe.presentation!.metrics;
  const clickCell = (x: number, y: number) => page.mouse.click(
    bounds!.x + (x + 0.5) * metrics.cellWidth,
    bounds!.y + (y + 0.5) * metrics.cellHeight,
  );

  await clickCell(arrow!.x - 3, arrow!.y);
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await clickCell(firstInputCell!.x + 3, arrow!.y);
  await expect(input).toHaveAttribute("aria-expanded", "true");
  const selection = await input.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd]);
  expect(selection[0]).toBeGreaterThan(0);
  expect(selection[0]).toBe(selection[1]);
  await expect(input).toBeFocused();
  await clickCell(arrow!.x, arrow!.y);
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await input.click();
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await clickCell(arrow!.x + 1, arrow!.y);
  await expect(input).toHaveAttribute("aria-expanded", "false");
});

test("Combobox filters without moving DOM focus and restores uncommitted text", async ({ page }) => {
  await page.goto("/#/components/combobox");
  const surface = page.getByLabel("Combobox component");
  const input = surface.getByRole("combobox", { name: "Font" });

  await expect(input).toHaveValue("Maple Mono");
  const closed = await readCellProbe(surface);
  const closedText = closed.cells.find((cell) => cell.ownerId === "component-combobox-input" && cell.text === "M");
  const closedBlank = closed.cells.find((cell) => cell.ownerId === "component-combobox-input" && cell.text === " ");
  expect(closedText?.style.backgroundColor).toBe(closedBlank?.style.backgroundColor);
  expect(closedText?.style.underline).not.toBe(true);
  await input.focus();
  await expect(page.getByRole("listbox", { name: "Font" })).toHaveCount(0);
  await expect.poll(async () => (await readCellProbe(surface)).cells.find((cell) => (
    cell.ownerId === "component-combobox-input" && cell.text === "M"
  ))?.style.backgroundColor).not.toBe(closedBlank?.style.backgroundColor);
  const active = await readCellProbe(surface);
  expect(active.cells.find((cell) => cell.ownerId === "component-combobox-input" && cell.text === "M")?.style.underline)
    .not.toBe(true);

  await input.fill("xiao");
  await expect(page.getByRole("option", { name: "Xiaolai Mono" })).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(1);
  const filtered = await readCellProbe(surface);
  expect(filtered.overlays.find(({ rootId }) => rootId === "component-combobox-content")?.text)
    .toContain("Xiaolai Mono");
  await input.press("Escape");
  await expect(input).toHaveValue("Maple Mono");
  await expect(page.getByRole("listbox", { name: "Font" })).toHaveCount(0);

  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-expanded", "true");
  await expect(input).toHaveAttribute("aria-activedescendant", "cell-semantic-component-combobox-maple");
  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", "cell-semantic-component-combobox-fusion");
  await expect(input).toBeFocused();
  await input.press("Enter");
  await expect(input).toHaveValue("Fusion Pixel 12px Mono");
  await expect(page.getByRole("listbox", { name: "Font" })).toHaveCount(0);
});

test("Preview blank space ends Combobox editing without losing its navigation anchor", async ({ page }) => {
  await page.goto("/#/components/combobox");
  const surface = page.getByLabel("Combobox component");
  const input = surface.getByRole("combobox", { name: "Font" });

  await input.click();
  await expect(surface).toHaveAttribute("data-cell-active-focus", "component-combobox-input");
  const active = await readCellProbe(surface);
  expect(active.activeFocusId).toBe("component-combobox-input");

  const bounds = await surface.boundingBox();
  const metrics = active.presentation!.metrics;
  await page.mouse.click(
    bounds!.x + 2.5 * metrics.cellWidth,
    bounds!.y + 2.5 * metrics.cellHeight,
  );

  await expect(surface).toHaveAttribute("data-cell-focused", "component-combobox-input");
  await expect(surface).not.toHaveAttribute("data-cell-active-focus");
  await expect.poll(async () => (await readCellProbe(surface)).activeFocusId).toBeNull();
  await expect(page.getByRole("listbox", { name: "Font" })).toHaveCount(0);
});
