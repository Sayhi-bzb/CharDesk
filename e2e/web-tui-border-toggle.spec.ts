import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test("border preview updates every Surface without resetting product state", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/exp/web-tui/");
  const input = page.getByRole("textbox", { name: "File name" });
  await input.fill("hello世界");
  await input.press("Shift+ArrowLeft");
  const selection = await input.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]);
  const virtual = page.locator('[data-cell-probe="virtualization"]');
  await virtual.focus();
  await page.keyboard.press("PageDown");
  const overlay = page.locator('[data-cell-probe="overlay"]');
  await overlay.focus();
  await page.keyboard.press("Enter");
  const surfaces = page.locator("[data-cell-probe]");
  // Compare shape changes with identical focus ownership; the host control blurs the Surface.
  await page.getByRole("button", { name: "Border: Square", exact: true }).focus();
  const before = await Promise.all((await surfaces.all()).map(readCellProbe));
  await page.getByRole("button", { name: "Border: Square", exact: true }).click();
  await expect(page.getByRole("button", { name: "Border: Rounded", exact: true })).toBeVisible();
  const rounded = await Promise.all((await surfaces.all()).map(readCellProbe));
  const corners: Record<string, string> = { "┌": "╭", "┐": "╮", "└": "╰", "┘": "╯" };
  for (let i = 0; i < before.length; i++) {
    expect(rounded[i].text).toBe(before[i].text.replace(/[┌┐└┘]/g, (char) => corners[char]));
    expect(rounded[i].text).toContain("╭");
    expect(rounded[i].focusedId).toBe(before[i].focusedId);
    expect(rounded[i].viewport).toEqual(before[i].viewport);
    expect(rounded[i].revision).toBeGreaterThan(before[i].revision);
    expect(rounded[i].cells.map((cell) => cell.ownerId)).toEqual(before[i].cells.map((cell) => cell.ownerId));
  }
  await expect(input).toHaveValue("hello世界");
  expect(await input.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd])).toEqual(selection);
  await expect(page.getByRole("status", { name: "Virtual list status" })).toHaveAttribute("data-scroll-y", "9");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeAttached();
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  const dark = await Promise.all((await surfaces.all()).map(readCellProbe));
  expect(dark.map((probe) => probe.text)).toEqual(rounded.map((probe) => probe.text));
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (text: string) => { document.body.dataset.copied = text; },
    } });
  });
  await page.locator("#core").getByRole("button", { name: "Copy snapshot" }).click();
  expect(await page.locator("body").getAttribute("data-copied")).toContain(rounded[0].text);
  const toggle = page.getByRole("button", { name: /^Border:/ });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveText("Border: Square");
  expect((await readCellProbe(overlay)).text).toBe(before[3].text);
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveText("Border: Rounded");
  await page.reload();
  await expect(toggle).toHaveText("Border: Square");
});

test("border preview controls fit narrow screens and apply to newly opened overlays", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/exp/web-tui/");
  const toggle = page.getByRole("button", { name: /^Border:/ });
  await toggle.click();
  await expect(toggle).toHaveText("Border: Rounded");
  const bounds = (await toggle.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const overlay = page.locator('[data-cell-probe="overlay"]');
  await overlay.focus();
  await page.keyboard.press("Enter");
  expect((await readCellProbe(overlay)).text).toContain("╭");
});
