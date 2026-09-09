import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test("Combobox filters without moving DOM focus and restores uncommitted text", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/combobox");
  const surface = page.getByLabel("Combobox component");
  const input = page.getByRole("combobox", { name: "Font" });

  await expect(input).toHaveValue("Maple Mono");
  await input.focus();
  await expect(page.getByRole("listbox", { name: "Font" })).toHaveCount(0);

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
  await page.goto("/exp/web-tui/#/components/combobox");
  const surface = page.getByLabel("Combobox component");
  const input = page.getByRole("combobox", { name: "Font" });

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
