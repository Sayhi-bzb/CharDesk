import { expect, test } from "@playwright/test";
import { readCellProbe, readCellPixel } from "./helpers/cell-probe";

test("Gallery light and dark modes expose the Classic Macintosh token hierarchy", async ({ page }) => {
  await page.goto("/exp/web-tui/#/__fixtures/all");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", scheme);
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string) => style.getPropertyValue(name).trim();
      return {
        background: read("--cell-background"),
        foreground: read("--cell-foreground"),
        surface: read("--cell-surface"),
        buttonPrimary: read("--cell-button-primary"),
        buttonPrimaryForeground: read("--cell-button-primary-foreground"),
        buttonPrimaryHover: read("--cell-button-primary-hover"),
        highlight: read("--cell-highlight"),
        highlightForeground: read("--cell-highlight-foreground"),
        hover: read("--cell-hover"),
        muted: read("--cell-muted-foreground"),
        disabled: read("--cell-disabled-foreground"),
        border: read("--cell-border"),
        accent: read("--cell-accent"),
        selection: read("--cell-selection"),
        selectionForeground: read("--cell-selection-foreground"),
        rangeSurface: read("--cell-range-surface"),
        rangeSurfaceEffect: read("--cell-range-surface-effect"),
        scrollbarThumb: read("--cell-scrollbar-thumb"),
        scrollbarTrack: read("--cell-scrollbar-track"),
      };
    });
    expect(tokens).toEqual(scheme === "light" ? {
      background: "#ffffff",
      foreground: "#000000",
      surface: "#ffffff",
      buttonPrimary: "#000000",
      buttonPrimaryForeground: "#ffffff",
      buttonPrimaryHover: "#1a1a1a",
      highlight: "#000000",
      highlightForeground: "#ffffff",
      hover: "#e6e6e6",
      muted: "#555555",
      disabled: "#777777",
      border: "#000000",
      accent: "#000000",
      selection: "#000000",
      selectionForeground: "#ffffff",
      rangeSurface: "rgba(0, 0, 0, 0.22)",
      rangeSurfaceEffect: "tint",
      scrollbarThumb: "#000000",
      scrollbarTrack: "#777777",
    } : {
      background: "#000000",
      foreground: "#ffffff",
      surface: "#000000",
      buttonPrimary: "#ffffff",
      buttonPrimaryForeground: "#000000",
      buttonPrimaryHover: "#e6e6e6",
      highlight: "#ffffff",
      highlightForeground: "#000000",
      hover: "#1a1a1a",
      muted: "#aaaaaa",
      disabled: "#888888",
      border: "#ffffff",
      accent: "#ffffff",
      selection: "#ffffff",
      selectionForeground: "#000000",
      rangeSurface: "rgba(255, 255, 255, 0.18)",
      rangeSurfaceEffect: "contrast",
      scrollbarThumb: "#ffffff",
      scrollbarTrack: "#888888",
    });
  }
});

test("default Button consumes its primary surface in Cell styles and Canvas pixels", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/button");
  const surface = page.locator('[data-cell-probe="component-button"]');
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", scheme);
    const frame = await readCellProbe(surface);
    const padding = frame.cells.find((cell) => (
      cell.ownerId === "component-button-save" && cell.text === " "
    ));
    expect(padding).toBeDefined();
    expect(padding!.style).toMatchObject(scheme === "light"
      ? { color: "rgb(255, 255, 255)", backgroundColor: "rgb(0, 0, 0)" }
      : { color: "rgb(0, 0, 0)", backgroundColor: "rgb(255, 255, 255)" });
    expect(await readCellPixel(surface, padding!.x + 0.5, padding!.y + 0.5))
      .toEqual(scheme === "light" ? [0, 0, 0, 255] : [255, 255, 255, 255]);
  }
});

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
    child.style.setProperty("--cell-range-surface", "rgba(1, 2, 3, 0.25)");
    child.style.setProperty("--cell-range-border", "rgb(10, 20, 30)");
    child.style.setProperty("--cell-range-surface-effect", "tint");
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
  expect(result.local.theme.rangeStyle).toEqual({
    surface: "rgba(1, 2, 3, 0.25)",
    border: "rgb(10, 20, 30)",
    surfaceEffect: "tint",
  });
  expect(result.local.theme.cursorStyle).toMatchObject({
    shape: "block",
    color: "rgb(4, 5, 6)",
    textColor: "rgb(7, 8, 9)",
    blink: true,
  });
  expect(result.invalid.theme.selectedStyle.backgroundColor).toBe("#000000");
  expect(result.missing.theme.selectedStyle.backgroundColor).toBe("#000000");
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
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
  await expect(page.locator(".gallery-page")).toHaveCSS("background-color", "rgb(7, 8, 9)");
  await expect.poll(async () => (await readCellProbe(surface)).cells.find((cell) => cell.ownerId === "palette-title")?.style.backgroundColor)
    .toBe("rgb(30, 40, 50)");
  const after = await readCellProbe(surface);
  expect(after.text).toBe(before.text);
  expect(after.focusedId).toBe(before.focusedId);
  expect(after.revision).toBeGreaterThan(before.revision);
  await expect(surface).toHaveAttribute("data-cell-focus-visible", "true");
  const refocused = await readCellProbe(surface);
  expect(refocused.cells.some((cell) => !cell.style.bold
    && cell.style.color === "rgb(7, 8, 9)"
    && cell.style.backgroundColor === "rgb(255, 255, 255)")).toBe(true);
  expect(after.cells.some((cell) => cell.text === "┌" && cell.style.color === "rgb(90, 100, 110)")).toBe(true);
  const pixel = await readCellPixel(surface, 31.5, 7.5);
  expect(pixel).toEqual([7, 8, 9, 255]);
});

test("inverse cursor ignores fixed color tokens while rectangle overlay consumes its tokens", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/exp/web-tui/#/__fixtures/all");
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--cell-cursor", "rgb(255, 0, 0)");
    document.documentElement.style.setProperty("--cell-cursor-foreground", "rgb(0, 0, 0)");
    document.documentElement.style.setProperty("--cell-range-surface", "rgb(0, 255, 0)");
    document.documentElement.style.setProperty("--cell-range-surface-effect", "tint");
  });
  await page.getByRole("button", { name: "Dark" }).click();
  await page.getByRole("textbox", { name: "File name", exact: true }).fill("");
  const editor = page.locator('[data-cell-probe="editor"]');
  const cursor = await readCellPixel(editor, 1.5, 2.5);
  expect(cursor).toEqual([0, 0, 0, 255]);
  const input = page.getByRole("textbox", { name: "File name", exact: true });
  await input.fill("中A");
  await input.press("Home");
  expect(await readCellPixel(editor, 2.8, 2.1)).toEqual([0, 0, 0, 255]);
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

test("dark Range contrast changes final pixels without changing Cell content", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/exp/web-tui/#/__fixtures/all");
  const surface = page.locator('[data-cell-probe="complex"]');
  const canvas = surface.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  const beforeProbe = await readCellProbe(surface);
  const beforePixel = await readCellPixel(surface, 1.5, 8.5);

  await page.keyboard.down("Alt");
  await page.keyboard.down("Meta");
  await page.mouse.move(bounds.x + bounds.width / 44 / 2, bounds.y + 8.5 * bounds.height / 16);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 3.5 * bounds.width / 44, bounds.y + 9.5 * bounds.height / 16);
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await page.keyboard.up("Alt");

  await expect(surface).toHaveAttribute("data-cell-range", "0,8,4,2");
  await expect.poll(async () => await readCellPixel(surface, 1.5, 8.5))
    .not.toEqual(beforePixel);
  const afterProbe = await readCellProbe(surface);
  expect(afterProbe.cells).toEqual(beforeProbe.cells);
  expect(afterProbe.text).toBe(beforeProbe.text);
});
