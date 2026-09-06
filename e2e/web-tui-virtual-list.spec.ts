import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test("100k-row virtual List stays bounded across keyboard, pointer, and scroll", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/exp/web-tui/#/__fixtures/all");
  await page.waitForLoadState("networkidle");
  expect(pageErrors).toEqual([]);

  const section = page.locator("#virtualization");
  const surface = section.getByLabel("Virtual file list");
  const canvas = surface.locator("canvas");
  await expect(section.getByRole("listbox", { name: "Virtual files" })).toBeAttached();
  await expect(section.getByRole("option")).toHaveCount(11);
  await expect(section.getByRole("option")).toHaveCount(11);
  await expect(section.getByRole("option", { name: /000001\s+src\/file-000001\.ts/ }))
    .toHaveAttribute("aria-posinset", "1");
  await expect(section.getByRole("option", { name: /000001\s+src\/file-000001\.ts/ }))
    .toHaveAttribute("aria-setsize", "100000");

  await surface.focus();
  await expect(section.getByRole("option", { name: /000001\s+src\/file-000001\.ts/ }))
    .toBeFocused();
  await page.keyboard.press("PageDown");
  await expect.poll(async () => (await readCellProbe(surface)).focusedId)
    .toBe("virtual-file-9");
  const pageProbe = await readCellProbe(surface);
  expect(pageProbe.cells.some((cell) => cell.text === "▶")).toBe(false);
  expect(pageProbe.cells.filter((cell) => cell.style.bold).length).toBeGreaterThan(0);
  await expect(section.getByRole("option", { name: /000010\s+src\/file-000010\.ts/ }))
    .toBeFocused();
  await expect(section.getByRole("option", { name: /000010\s+src\/file-000010\.ts/ })).toBeFocused();
  await page.keyboard.press("PageUp");
  await expect.poll(async () => (await readCellProbe(surface)).focusedId)
    .toBe("virtual-file-0");
  await expect(section.getByRole("option", { name: /000001\s+src\/file-000001\.ts/ })).toBeFocused();

  for (let index = 0; index < 10; index += 1) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(surface).toHaveAttribute("data-cell-focused", "virtual-file-10");
  await expect(section.getByRole("option", { name: /000011\s+src\/file-000011\.ts/ }))
    .toHaveAttribute("aria-posinset", "11");
  await expect(section.getByRole("option", { name: /000011\s+src\/file-000011\.ts/ }))
    .toBeFocused();
  expect(await section.getByRole("option").count()).toBeLessThanOrEqual(13);

  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Virtual list Canvas is not visible.");
  const cellWidth = bounds.width / 38;
  const cellHeight = bounds.height / 12;
  await canvas.click({
    position: { x: 5.5 * cellWidth, y: 5.5 * cellHeight },
  });
  await expect(surface).toHaveAttribute("data-cell-focused", "virtual-file-5");

  await canvas.hover({ position: { x: 5.5 * cellWidth, y: 8.5 * cellHeight } });
  await page.mouse.down();
  await page.mouse.move(bounds.x + 5.5 * cellWidth, bounds.y + 5.5 * cellHeight);
  await page.mouse.up();
  const dragged = await readCellProbe(surface);
  expect(dragged.text).not.toBe(pageProbe.text);
  expect(await section.getByRole("option").count()).toBeLessThanOrEqual(13);

  await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await readCellProbe(surface)).text).not.toBe(dragged.text);
  await expect(section.getByRole("option")).not.toHaveCount(100_000);
});
