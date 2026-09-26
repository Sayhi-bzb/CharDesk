import { expect, test } from "@playwright/test";
import { cellPoint, ownerBounds, ownerCells, readCellProbe } from "./helpers/cell-probe";

test("Alert keeps four tones visible and its optional action uses the normal command path", async ({ page }) => {
  await page.goto("/#/components/alert");
  const surface = page.locator('[data-cell-probe="component-alert"]');
  await expect(surface.getByRole("status", { name: "New version available" })).toBeAttached();
  await expect(surface.getByRole("status", { name: "Changes saved" })).toBeAttached();
  await expect(surface.getByRole("alert", { name: /Unsaved changes/ })).toBeAttached();
  await expect(surface.getByRole("alert", { name: "Save failed" })).toBeAttached();
  const initial = await readCellProbe(surface);
  expect(ownerCells(initial, "component-alert-warning").some((cell) => cell.text === "!")).toBe(true);
  expect(ownerCells(initial, "component-alert-info").some((cell) => cell.text === "╭" || cell.text === "┌")).toBe(false);
  const action = ownerBounds(initial, "component-alert-save");
  const point = await cellPoint(surface, action.x + 1, action.y);
  await page.mouse.move(point.x, point.y);
  await expect(surface).toHaveAttribute("data-cell-hovered", "component-alert-save");
  await page.mouse.click(point.x, point.y);
  await expect(surface.getByRole("button", { name: "Save now" })).toHaveCount(0);
  await expect(surface.getByRole("status", { name: /Changes saved/ })).toHaveCount(2);
});

test("Alert border selector changes Cell chrome independently of tone", async ({ page }) => {
  await page.goto("/#/components/alert");
  const surface = page.locator('[data-cell-probe="component-alert"]');
  const border = surface.getByRole("button", { name: "border" });
  const select = async (value: string) => {
    await border.evaluate((element: HTMLElement) => element.click());
    await surface.getByRole("option", { name: value }).evaluate((element: HTMLElement) => element.click());
    await expect(border).toHaveAttribute("aria-expanded", "false");
  };
  await select("rounded");
  const rounded = await readCellProbe(surface);
  expect(ownerCells(rounded, "component-alert-info").some((cell) => cell.text === "╭")).toBe(true);
  expect(ownerBounds(rounded, "component-alert-info").height).toBe(3);
  await select("none");
  expect(ownerCells(await readCellProbe(surface), "component-alert-info").some((cell) => cell.text === "╭" || cell.text === "┌")).toBe(false);
  await expect(surface.getByRole("status", { name: "New version available" })).toBeAttached();
});

test("Alert border uses each status foreground in light and dark themes", async ({ page }) => {
  await page.goto("/#/components/alert");
  const surface = page.locator('[data-cell-probe="component-alert"]');
  const border = surface.getByRole("button", { name: "border" });
  await border.evaluate((element: HTMLElement) => element.click());
  await surface.getByRole("option", { name: "square" }).evaluate((element: HTMLElement) => element.click());
  await expect(border).toHaveAttribute("aria-expanded", "false");

  for (const mode of ["light", "dark"] as const) {
    if (mode === "dark") {
      await page.getByRole("button", { name: "Dark" }).evaluate((element: HTMLElement) => element.click());
      await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
    }
    for (const tone of ["info", "success", "warning", "error"] as const) {
      const expected = await page.evaluate((name) => {
        const token = getComputedStyle(document.documentElement)
          .getPropertyValue(`--cell-tone-${name === "error" ? "danger" : name}-surface-foreground`).trim();
        const sample = document.createElement("span");
        sample.style.color = token;
        document.body.append(sample);
        const resolved = getComputedStyle(sample).color.toLowerCase();
        sample.remove();
        return resolved;
      }, tone);
      await expect.poll(async () => {
        const snapshot = await readCellProbe(surface);
        const id = `component-alert-${tone}`;
        const bounds = ownerBounds(snapshot, id);
        return ownerCells(snapshot, id).find((cell) => cell.x === bounds.x && cell.y === bounds.y)?.style.color?.toLowerCase();
      }).toBe(expected);
    }
  }
});

test("Alert ghost inherits the page fill while retaining tone text and border", async ({ page }) => {
  await page.goto("/#/components/alert");
  const surface = page.locator('[data-cell-probe="component-alert"]');
  const marker = async () => ownerCells(await readCellProbe(surface), "component-alert-info")
    .find((cell) => cell.text === "i");
  const select = async (label: string, value: string) => {
    const trigger = surface.getByRole("button", { name: label });
    await trigger.evaluate((element: HTMLElement) => element.click());
    await surface.getByRole("option", { name: value }).evaluate((element: HTMLElement) => element.click());
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  };

  await expect.poll(async () => (await marker())?.style.backgroundColor).toBe("rgb(221, 238, 255)");
  await select("variant", "ghost");
  await expect.poll(async () => (await marker())?.style.backgroundColor).toBe("rgb(255, 255, 255)");
  expect((await marker())?.style.color).toBe("rgb(23, 71, 107)");

  await select("border", "square");
  const border = ownerCells(await readCellProbe(surface), "component-alert-info")
    .find((cell) => cell.text === "┌");
  expect(border?.style.color).toBe("rgb(23, 71, 107)");

  await page.getByRole("button", { name: "Dark" }).evaluate((element: HTMLElement) => element.click());
  await expect.poll(async () => (await marker())?.style.color).toBe("rgb(184, 228, 255)");
  expect((await marker())?.style.backgroundColor).toBe("rgb(0, 0, 0)");
});
