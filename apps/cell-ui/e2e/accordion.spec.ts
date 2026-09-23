import { expect, test } from "@playwright/test";
import { cellPoint, readCellMetrics, readCellProbe } from "./helpers/cell-probe";

test("Accordion preview scrolls overflow and reveals keyboard-focused items", async ({ page }) => {
  await page.goto("/#/components/accordion");
  const surface = page.locator('[data-cell-probe="component-accordion"]');
  const general = surface.getByRole("button", { name: "General", exact: true });
  const appearance = surface.getByRole("button", { name: "Appearance", exact: true });
  const advanced = surface.getByRole("button", { name: "Advanced", exact: true });
  await surface.getByRole("checkbox", { name: "separator", exact: true })
    .evaluate((element: HTMLElement) => element.click());
  for (const trigger of [general, appearance, advanced]) {
    await trigger.evaluate((element: HTMLElement) => element.click());
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  }

  const before = await readCellProbe(surface);
  expect(before.cells.some((cell) => cell.ownerId === "component-accordion-playground-preview-scroll" && "█▀▄".includes(cell.text))).toBe(true);
  expect(before.cells.some((cell) => cell.ownerId === "accordion-advanced-trigger")).toBe(false);
  const previewPoint = await cellPoint(surface, 8, 3);
  await page.mouse.move(previewPoint.x, previewPoint.y);
  for (let index = 0; index < 3; index += 1) await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await readCellProbe(surface)).cells
    .some((cell) => cell.ownerId === "accordion-advanced-trigger")).toBe(true);

  for (let index = 0; index < 3; index += 1) await page.mouse.wheel(0, -120);
  await general.evaluate((element: HTMLElement) => element.focus());
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(advanced).toBeFocused();
  expect((await readCellProbe(surface)).cells.some((cell) => cell.ownerId === "accordion-advanced-trigger")).toBe(true);

  for (const trigger of [advanced, appearance, general]) {
    await trigger.evaluate((element: HTMLElement) => element.click());
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  }
  await expect.poll(async () => (await readCellProbe(surface)).cells
    .some((cell) => cell.ownerId === "accordion-general-trigger")).toBe(true);
});

test("Accordion separators are opt-in and do not interrupt item state or navigation", async ({ page }) => {
  await page.goto("/#/components/accordion");
  const surface = page.locator('[data-cell-probe="component-accordion"]');
  const separator = surface.getByRole("checkbox", { name: "separator", exact: true });
  const general = surface.getByRole("button", { name: "General", exact: true });
  const appearance = surface.getByRole("button", { name: "Appearance", exact: true });
  await expect(separator).toHaveAttribute("aria-checked", "false");
  await expect(surface.getByRole("separator")).toHaveCount(0);

  await appearance.evaluate((element: HTMLElement) => element.click());
  const sound = surface.getByRole("checkbox", { name: "Sound", exact: true });
  await expect(sound).toHaveAttribute("aria-checked", "true");
  await separator.evaluate((element: HTMLElement) => element.click());
  await expect(separator).toHaveAttribute("aria-checked", "true");
  await expect(surface.getByRole("separator")).toHaveCount(2);
  const frame = await readCellProbe(surface);
  for (const ownerId of ["accordion-appearance-separator", "accordion-advanced-separator"]) {
    expect(frame.cells.some((cell) => cell.ownerId === ownerId && cell.text === "─")).toBe(true);
  }

  await general.evaluate((element: HTMLElement) => element.focus());
  await page.keyboard.press("ArrowDown");
  await expect(appearance).toBeFocused();
  await separator.evaluate((element: HTMLElement) => element.click());
  await expect(surface.getByRole("separator")).toHaveCount(0);
  await expect(appearance).toHaveAttribute("aria-expanded", "true");
  await expect(sound).toHaveAttribute("aria-checked", "true");
});

test("Accordion nested controls share a column without extending Checkbox hit area", async ({ page }) => {
  await page.goto("/#/components/accordion");
  const surface = page.locator('[data-cell-probe="component-accordion"]');
  await surface.getByRole("button", { name: "Appearance", exact: true }).evaluate((element: HTMLElement) => element.click());
  const sound = surface.getByRole("checkbox", { name: "Sound", exact: true });
  await expect(sound).toHaveAttribute("aria-checked", "true");

  const frame = await readCellProbe(surface);
  const soundMark = frame.cells.find((cell) => cell.ownerId === "accordion-sound" && cell.text === "[")!;
  const selectArrow = frame.cells.find((cell) => cell.ownerId === "accordion-theme-trigger" && cell.text === "▾")!;
  const controlStart = soundMark.x - 1;
  const controlEnd = controlStart + 15;
  expect(selectArrow.x).toBe(controlEnd - 2);

  const inside = await cellPoint(surface, controlEnd - 1, soundMark.y);
  const outside = await cellPoint(surface, controlEnd, soundMark.y);
  await page.mouse.move(inside.x, inside.y);
  await expect(surface).toHaveAttribute("data-cell-hovered", "accordion-sound");
  await page.mouse.move(outside.x, outside.y);
  await expect(surface).not.toHaveAttribute("data-cell-hovered", "accordion-sound");
  await page.mouse.click(outside.x, outside.y);
  await expect(sound).toHaveAttribute("aria-checked", "true");
  await page.mouse.click(inside.x, inside.y);
  await expect(sound).toHaveAttribute("aria-checked", "false");
});

test("Accordion content keeps layout transparent while Select owns its surface", async ({ page }) => {
  await page.goto("/#/components/accordion");
  const surface = page.locator('[data-cell-probe="component-accordion"]');
  const appearance = surface.getByRole("button", { name: "Appearance", exact: true });

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", scheme);
    if (await appearance.getAttribute("aria-expanded") === "false") {
      await appearance.evaluate((element: HTMLElement) => element.click());
    }
    await expect(appearance).toHaveAttribute("aria-expanded", "true");
    const frame = await readCellProbe(surface);
    const themeLabel = frame.cells.find((cell) => cell.text === "T");
    const soundMark = frame.cells.find((cell) => cell.ownerId === "accordion-sound" && cell.text === "[");
    const selectArrow = frame.cells.find((cell) => cell.ownerId === "accordion-theme-trigger" && cell.text === "▾");
    expect(themeLabel?.style.backgroundColor).toBeUndefined();
    expect(soundMark?.style.backgroundColor).toBeUndefined();
    expect(selectArrow?.style.backgroundColor).toBe(scheme === "light"
      ? "rgb(230, 230, 230)" : "rgb(26, 26, 26)");
  }
});

test("Accordion independently expands, preserves content, and shares keyboard and pointer feedback", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/#/components/accordion");
  const surface = page.locator('[data-cell-probe="component-accordion"]');
  const general = surface.getByRole("button", { name: "General", exact: true });
  const appearance = surface.getByRole("button", { name: "Appearance", exact: true });
  await expect(general).toHaveAttribute("aria-expanded", "false");
  await expect(appearance).toHaveAttribute("aria-expanded", "false");
  await expect(surface.getByRole("checkbox", { name: "Sound" })).toHaveCount(0);
  const canvas = surface.locator("canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  const metrics = await readCellMetrics(surface);
  const trigger = (await readCellProbe(surface)).cells.find((cell) => cell.ownerId === "accordion-appearance-trigger" && cell.text === "▸")!;
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.click(bounds.x + (trigger.x + 0.5) * metrics.cellWidth, bounds.y + (trigger.y + 0.5) * metrics.cellHeight);
  await expect(appearance).toHaveAttribute("aria-expanded", "true");
  await expect(surface.getByRole("region", { name: "Appearance", exact: true })).toBeAttached();
  await page.keyboard.press("Home");
  await expect(general).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(general).toHaveAttribute("aria-expanded", "true");
  await expect(appearance).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowDown");
  await expect(appearance).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(surface.getByRole("button", { name: "Theme", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  const opened = await readCellProbe(surface);
  const popup = opened.overlays.find(({ rootId }) => rootId === "accordion-theme-content");
  expect(popup).toBeDefined();
  expect(popup!.cells).toHaveLength(popup!.bounds.width * popup!.bounds.height);
  expect(popup!.cells.every((cell) => cell.style.backgroundColor !== undefined)).toBe(true);
  expect(popup!.cells.some((cell) => cell.style.backgroundColor === "rgb(230, 230, 230)")).toBe(true);
  expect(opened.text).toContain("Dark");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(surface.getByRole("listbox")).toHaveCount(0);
  await page.keyboard.press("Tab");
  const sound = surface.getByRole("checkbox", { name: "Sound", exact: true });
  await expect(sound).toBeFocused();
  await page.keyboard.press("Space");
  await expect(sound).toHaveAttribute("aria-checked", "false");
  await appearance.evaluate((element: HTMLElement) => element.click());
  await expect(appearance).toHaveAttribute("aria-expanded", "false");
  await appearance.evaluate((element: HTMLElement) => element.click());
  await expect(sound).toHaveAttribute("aria-checked", "false");
  expect((await readCellProbe(surface)).text).toContain("Light");
  await surface.getByRole("checkbox", { name: "disabled", exact: true }).evaluate((element: HTMLElement) => element.click());
  await expect(general).toHaveAttribute("aria-disabled", "true");
  await expect(sound).toHaveAttribute("aria-disabled", "true");
  await appearance.evaluate((element: HTMLElement) => element.click());
  await expect(appearance).toHaveAttribute("aria-expanded", "true");
});
