import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test("editor blur clears the full focus surface and caret but preserves logical state", async ({ page }) => {
  await page.goto("/exp/web-tui/#/__fixtures/all");
  const surface = page.locator('[data-cell-probe="editor"]');
  const editor = page.getByRole("textbox", { name: "Document", exact: true });
  await expect(surface).not.toHaveAttribute("data-cell-focus-visible");
  await editor.fill("");
  const active = await readCellProbe(surface);
  expect(active.cells.find((cell) => cell.x === 10 && cell.y === 8)?.style.backgroundColor).toBeTruthy();
  const canvas = surface.locator("canvas");
  const caretPixel = () => canvas.evaluate((canvas) => Array.from(canvas.getContext("2d")!
    .getImageData(Math.round(9 * devicePixelRatio), Math.round(6.5 * 19 * devicePixelRatio), 1, 1).data));
  const focusedPixel = await caretPixel();
  await editor.evaluate((input) => input.blur());
  await expect(surface).not.toHaveAttribute("data-cell-focus-visible");
  await expect.poll(async () => (await readCellProbe(surface)).cells.find((cell) => cell.x === 10 && cell.y === 8)?.style.backgroundColor).toBeUndefined();
  const blurred = await readCellProbe(surface);
  expect(blurred.focusedId).toBe(active.focusedId);
  expect(blurred.text).toBe(active.text);
  expect(await caretPixel()).not.toEqual(focusedPixel);
  // Force a full Canvas presentation: it must match the blur's incremental erase.
  const erased = await canvas.evaluate((canvas) => canvas.toDataURL());
  await page.setViewportSize({ width: 1201, height: 900 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await canvas.evaluate((canvas) => canvas.toDataURL())).toBe(erased);
  await editor.focus();
  await expect(surface).toHaveAttribute("data-cell-focus-visible", "true");
  expect(await caretPixel()).toEqual(focusedPixel);
  await editor.press("x");
  await expect(editor).toHaveValue("x");
  await page.getByRole("heading", { name: "Cell UI Fixtures", exact: true }).click();
  await expect(surface).not.toHaveAttribute("data-cell-focus-visible");
  expect((await readCellProbe(surface)).focusedId).toBe(active.focusedId);
});

test("only the active Surface paints focus, while selected state survives", async ({ page }) => {
  await page.goto("/exp/web-tui/#/__fixtures/all");
  const core = page.locator('[data-cell-probe="core"]');
  const editor = page.getByRole("textbox", { name: "File name", exact: true });
  await core.focus();
  const active = await readCellProbe(core);
  expect(active.cells.some((cell) => cell.ownerId === "core-open" && cell.style.bold)).toBe(true);
  await editor.focus();
  await expect(core).not.toHaveAttribute("data-cell-focus-visible");
  const blurred = await readCellProbe(core);
  expect(blurred.focusedId).toBe(active.focusedId);
  expect(blurred.cells.some((cell) => cell.ownerId === "core-open" && cell.style.bold)).toBe(false);
  expect(blurred.cells.some((cell) => cell.ownerId === "core-open" && cell.style.backgroundColor)).toBe(true);
  await page.getByRole("button", { name: /^(Dark|Light)$/ }).focus();
  await expect(page.locator('[data-cell-probe][data-cell-focus-visible="true"]')).toHaveCount(0);
  await core.focus();
  expect((await readCellProbe(core)).focusedId).toBe(active.focusedId);
  await page.keyboard.press("Enter");
  await expect(core).toHaveAttribute("data-cell-focused", "core-open");
});

test("window focus recovery checks current ownership and never steals an external focus", async ({ page }) => {
  await page.goto("/exp/web-tui/#/__fixtures/all");
  const surface = page.locator('[data-cell-probe="editor"]');
  const editor = page.getByRole("textbox", { name: "Document", exact: true });
  await editor.focus();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(surface).not.toHaveAttribute("data-cell-focus-visible");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(surface).toHaveAttribute("data-cell-focus-visible", "true");
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const outside = page.getByRole("button", { name: /^(Dark|Light)$/ });
  await outside.focus();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(surface).not.toHaveAttribute("data-cell-focus-visible");
  await expect(outside).toBeFocused();
});
