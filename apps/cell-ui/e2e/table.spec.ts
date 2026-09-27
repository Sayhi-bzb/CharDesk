import { expect, test } from "@playwright/test";
import { cellPoint, copyCellRange, readCellMetrics, readCellProbe } from "./helpers/cell-probe";

const outlinedRows = [
  "┌────────────┬──────────┬───────┐",
  "│ Name       │ Status   │ Size  │",
  "├────────────┼──────────┼───────┤",
  "│ Notes.txt  │ Synced   │ 12 KB │",
  "│ Draft.md   │ Editing  │  3 KB │",
  "└────────────┴──────────┴───────┘",
] as const;

const expectOutlinedRows = (text: string) => {
  for (const row of outlinedRows) expect(text).toContain(row);
};

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
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain(outlinedRows[0]);
  expectOutlinedRows((await readCellProbe(surface)).text);
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

test("Table keeps its full outline and copied Unicode in Text presentation", async ({ page }) => {
  await page.goto("/#/components/table");
  const surface = page.locator('[data-cell-probe="component-table"]');
  await expect(surface.getByRole("table", { name: "Files" })).toBeAttached();
  const presentation = surface.getByRole("button", { name: "presentation", exact: true });
  await presentation.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await readCellProbe(surface)).text).toContain(outlinedRows[0]);
  const probe = await readCellProbe(surface);
  expectOutlinedRows(probe.text);
  const top = probe.cells.find((cell) => cell.ownerId === "component-table-example" && cell.text === "┌")!;
  const bottom = probe.cells.find((cell) => cell.ownerId === "component-table-example" && cell.text === "┘")!;
  await readCellMetrics(surface);
  const start = await cellPoint(surface, top.x, top.y);
  const end = await cellPoint(surface, bottom.x, bottom.y);
  await page.keyboard.down("Alt");
  await page.keyboard.down("Meta");
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await page.keyboard.up("Alt");
  expect(await copyCellRange(surface)).toContain(outlinedRows[2]);
});
