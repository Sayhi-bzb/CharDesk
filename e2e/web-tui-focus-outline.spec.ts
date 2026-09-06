import { expect, test } from "@playwright/test";
import { readCellProbe } from "./helpers/cell-probe";

test("Gallery has no DOM focus outline and retains keyboard and editor focus", async ({ page }) => {
  await page.goto("/exp/web-tui/#/__fixtures/all");
  const core = page.locator('[data-cell-probe="core"]');
  await core.focus();
  await page.keyboard.press("ArrowDown");
  await expect(core).toHaveCSS("outline-style", "none");
  const probe = await readCellProbe(core);
  expect(probe.cells.some((cell) => cell.ownerId === probe.focusedId && cell.style.bold && cell.style.backgroundColor)).toBe(true);
  await page.keyboard.press("Enter");
  await expect(core).toHaveAttribute("data-cell-focused", "core-save");
  await core.locator("canvas").click({ position: { x: 40, y: 26 } });
  await expect(core).toHaveCSS("outline-style", "none");
  await page.getByRole("button", { name: "Dark" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveCSS("outline-style", "none");
  const editor = page.getByRole("textbox", { name: "File name", exact: true });
  await editor.fill("test.txt");
  await expect(editor).toBeFocused();
  await expect(editor).toHaveCSS("outline-style", "none");
  await expect(editor).toHaveValue("test.txt");
});
