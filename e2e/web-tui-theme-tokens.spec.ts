import { expect, test } from "@playwright/test";
import { readCellProbe, readCellPixel } from "./helpers/cell-probe";

test("CSS token inheritance, aliases, local overrides and fallback resolve without leaking DOM", async ({ page }) => {
  await page.goto("/exp/web-tui/#/__fixtures/all");
  const result = await page.evaluate(async () => {
    const path = "/packages/cell-ui/src/browser-theme.ts";
    const { readCellCssTheme } = await import(path);
    const host = document.createElement("div");
    host.style.setProperty("--brand", "rgb(12, 34, 56)");
    host.style.setProperty("--cell-highlight", "var(--brand)");
    document.body.append(host);
    const child = document.createElement("div");
    host.append(child);
    const inherited = readCellCssTheme(child);
    child.style.setProperty("--cell-highlight", "oklch(60% 0.1 120)");
    child.style.setProperty("--cell-range-selection", "rgba(1, 2, 3, 0.25)");
    child.style.setProperty("--cell-cursor", "rgb(4, 5, 6)");
    child.style.setProperty("--cell-cursor-foreground", "rgb(7, 8, 9)");
    const local = readCellCssTheme(child);
    child.style.setProperty("--cell-highlight", "not-a-color");
    const invalid = readCellCssTheme(child);
    child.style.setProperty("--cell-highlight", "var(--missing-token)");
    const missing = readCellCssTheme(child);
    const nodes = child.childElementCount;
    host.remove();
    return { inherited, local, invalid, missing, nodes };
  });
  expect(result.inherited.theme.selectedStyle.backgroundColor).toBe("rgb(12, 34, 56)");
  expect(result.inherited.theme.selectedStyle).toEqual(result.inherited.theme.focusedSurfaceStyle);
  expect(result.local.theme.selectedStyle.backgroundColor).toContain("oklch(");
  expect(result.local.theme.rangeSelectionColor).toBe("rgba(1, 2, 3, 0.25)");
  expect(result.local.theme.cursorStyle).toMatchObject({
    shape: "block",
    color: "rgb(4, 5, 6)",
    textColor: "rgb(7, 8, 9)",
    blink: true,
  });
  expect(result.invalid.theme.selectedStyle.backgroundColor).toBe("#1a1a1a");
  expect(result.missing.theme.selectedStyle.backgroundColor).toBe("#1a1a1a");
  expect(result.nodes).toBe(0);
});

test("root token updates reach DOM and Canvas on theme revision without losing state", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/exp/web-tui/#/__fixtures/all");
  const surface = page.locator('[data-cell-probe="overlay"]');
  await surface.focus();
  await page.keyboard.press("Enter");
  const before = await readCellProbe(surface);
  await page.evaluate(() => {
    const root = document.documentElement;
    root.style.setProperty("--cell-background", "rgb(7, 8, 9)");
    root.style.setProperty("--cell-surface", "rgb(30, 40, 50)");
    root.style.setProperty("--cell-highlight", "rgb(60, 70, 80)");
    root.style.setProperty("--cell-border", "rgb(90, 100, 110)");
  });
  expect((await readCellProbe(surface)).cells).toEqual(before.cells);
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator(".gallery-page")).toHaveCSS("background-color", "rgb(7, 8, 9)");
  await expect.poll(async () => (await readCellProbe(surface)).cells.find((cell) => cell.ownerId === "palette-title")?.style.backgroundColor)
    .toBe("rgb(30, 40, 50)");
  const after = await readCellProbe(surface);
  expect(after.text).toBe(before.text);
  expect(after.focusedId).toBe(before.focusedId);
  expect(after.revision).toBeGreaterThan(before.revision);
  await expect(surface).not.toHaveAttribute("data-cell-focus-visible");
  await surface.focus();
  const refocused = await readCellProbe(surface);
  expect(refocused.cells.some((cell) => cell.style.bold && cell.style.backgroundColor === "rgb(60, 70, 80)")).toBe(true);
  expect(after.cells.some((cell) => cell.text === "┌" && cell.style.color === "rgb(90, 100, 110)")).toBe(true);
  const pixel = await readCellPixel(surface, 31.5, 7.5);
  expect(pixel).toEqual([30, 40, 50, 255]);
});

test("terminal cursor and rectangle overlay consume theme tokens in actual pixels", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/exp/web-tui/#/__fixtures/all");
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--cell-cursor", "rgb(255, 0, 0)");
    document.documentElement.style.setProperty("--cell-cursor-foreground", "rgb(0, 0, 0)");
    document.documentElement.style.setProperty("--cell-range-selection", "rgb(0, 255, 0)");
  });
  await page.getByRole("button", { name: "Dark" }).click();
  await page.getByRole("textbox", { name: "File name", exact: true }).fill("");
  const editor = page.locator('[data-cell-probe="editor"]');
  const cursor = await readCellPixel(editor, 1.5, 2.5);
  expect(cursor).toEqual([255, 0, 0, 255]);
  const input = page.getByRole("textbox", { name: "File name", exact: true });
  await input.fill("中A");
  await input.press("Home");
  expect(await readCellPixel(editor, 2.8, 2.1)).toEqual([255, 0, 0, 255]);
  const canvas = page.locator('[data-cell-probe="complex"] canvas');
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  await page.keyboard.down("Alt");
  await page.keyboard.down("Meta");
  await page.mouse.move(bounds.x + bounds.width / 44 / 2, bounds.y + 8.5 * bounds.height / 16);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 3.5 * bounds.width / 44, bounds.y + 9.5 * bounds.height / 16);
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await page.keyboard.up("Alt");
  await expect(page.locator('[data-cell-probe="complex"]')).toHaveAttribute("data-cell-range", "0,8,4,2");
  await expect.poll(() => readCellPixel(page.locator('[data-cell-probe="complex"]'), 1.5, 8.5))
    .toEqual([0, 255, 0, 255]);
});
