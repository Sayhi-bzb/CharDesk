import { expect, test } from "@playwright/test";
import { canvasFor, readCellProbe, readCellText } from "./helpers/cell-probe";

test("aggregate fixtures mount every scenario with unique semantics", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/#/__fixtures/all");
  await page.waitForLoadState("networkidle");
  expect(pageErrors).toEqual([]);
  await expect(page.getByRole("heading", { name: "Cell UI Fixtures" })).toBeVisible();
  for (const probeId of ["core", "complex", "editor", "overlay", "virtualization"]) {
    await expect(page.locator(`[data-cell-probe="${probeId}"]`)).toHaveCount(1);
  }
  await expect(page.locator('output[role="status"]')).toHaveCount(0);
  await expect(page.getByText(/^Border:/)).toHaveCount(0);
  await expect(page.getByText("No Cell range selected")).toHaveCount(0);
  await expect(page.getByLabel("Selected Cell text")).toHaveCount(0);
  const semanticIds = await page.locator('[id^="cell-semantic-"]').evaluateAll(
    (elements) => elements.map((element) => element.id)
  );
  expect(new Set(semanticIds).size).toBe(semanticIds.length);
});

test("Cell UI shares keyboard, pointer, scroll, and semantic state", async ({ page }) => {
  await page.goto("/#/__fixtures/core");
  const section = page.locator("#core");
  const surface = section.getByLabel("File commands and files");
  await expect(surface).toBeVisible();
  await surface.focus();
  await page.keyboard.press("Enter");
  await expect(surface).toHaveAttribute("data-cell-focused", "core-open");

  const canvas = canvasFor(surface);
  await expect.poll(() => readCellText(surface)).toContain("Open file");
  const initialProbe = await readCellProbe(surface);
  expect(initialProbe).toMatchObject({
    schemaVersion: 5,
    probeId: "core",
    viewport: { width: 32, height: 10 },
    focusedId: "core-open",
  });
  await canvas.click({ position: { x: 49, y: 63 } });
  await expect(surface).toHaveAttribute("data-cell-focused", "core-save");

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => readCellText(surface)).toContain("offset: 1 / 3");
  await page.keyboard.press("PageDown");
  await expect.poll(() => readCellText(surface)).toContain("offset: 3 / 3");
  await page.keyboard.press("PageUp");
  await expect.poll(() => readCellText(surface)).toContain("offset: 0 / 3");

  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await canvas.dispatchEvent("wheel", {
    clientX: bounds!.x + 49,
    clientY: bounds!.y + 118,
    deltaX: 0,
    deltaY: 100,
  });
  await expect.poll(() => readCellText(surface)).toContain("offset: 1 / 3");

  const files = section.getByRole("listbox", { name: "Files" });
  await expect(files).toHaveAttribute(
    "aria-activedescendant",
    "cell-semantic-core-file-src/events.ts"
  );
  await section.getByRole("option", { name: "New file" }).dispatchEvent("click");
  await expect(surface).toHaveAttribute("data-cell-focused", "core-new");
});
