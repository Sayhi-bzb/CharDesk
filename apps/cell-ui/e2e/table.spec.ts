import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test("Table switches between plain, outlined, and surface Cell layouts", async ({ page }) => {
  await page.goto("/#/components/table");
  await expect(page.getByRole("heading", { name: "Table", level: 1 })).toBeVisible();
  const surface = page.locator('[data-cell-probe="component-table"]');
  await expect(surface.getByRole("table", { name: "Files" })).toBeAttached();
  await expect(surface.getByRole("columnheader")).toHaveCount(3);
  await expect(surface.getByRole("cell")).toHaveCount(6);
  await expect(surface.getByRole("row")).toHaveCount(3);
  await expect(surface.getByRole("grid")).toHaveCount(0);
  expect((await readCellProbe(surface)).text).not.toContain("┌");

  const variant = surface.getByRole("button", { name: "variant", exact: true });
  await variant.focus();
  await page.keyboard.press("Enter");
  await expect(surface.getByRole("option", { name: "outline" })).toBeAttached();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain("┌────────────┬──────────┬───────┐");
  await expect(surface.getByRole("table", { name: "Files" })).toBeAttached();
  await expect(variant).toHaveAttribute("aria-expanded", "false");

  await variant.focus();
  await page.keyboard.press("Enter");
  await surface.getByRole("option", { name: "surface" }).evaluate((element: HTMLElement) => element.click());
  await expect.poll(async () => (await readCellProbe(surface)).text).not.toContain("┌");
  const probe = await readCellProbe(surface);
  const notesBackground = probe.cells.find((cell) => cell.ownerId === "component-table-notes")?.style.backgroundColor;
  const draftBackground = probe.cells.find((cell) => cell.ownerId === "component-table-draft")?.style.backgroundColor;
  expect(notesBackground).toBeTruthy();
  expect(draftBackground).toBeTruthy();
  expect(notesBackground).not.toBe(draftBackground);
  await expect(surface.getByRole("table", { name: "Files" })).toBeAttached();
});
