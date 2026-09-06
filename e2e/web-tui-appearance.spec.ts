import { expect, test } from "@playwright/test";
import { copyCellRange, readCellProbe } from "./helpers/cell-probe";

test("theme icon toggles, persists, and preserves Cell state", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/exp/web-tui/");
  const editor = page.locator('[data-cell-probe="editor"]');
  const input = page.getByRole("textbox", { name: "File name" });
  await input.fill("hello世界");
  const before = await readCellProbe(editor);
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  const after = await readCellProbe(editor);
  expect(after.text).toBe(before.text);
  expect(after.revision).toBeGreaterThan(before.revision);
  await expect(input).toHaveValue("hello世界");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
  await page.reload();
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
  const toggle = page.getByRole("button", { name: "Light" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveCount(0);
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "light");
  await page.keyboard.press("Space");
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
});

for (const storage of ["invalid", "unavailable"] as const) {
  test(`theme icon works with ${storage} storage`, async ({ page }) => {
    await page.addInitScript((mode) => {
      if (mode === "invalid") localStorage.setItem("chardesk-web-tui-theme", "invalid");
      else Object.defineProperty(window, "localStorage", { get: () => { throw new DOMException("Unavailable", "SecurityError"); } });
    }, storage);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/exp/web-tui/");
    await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
    await page.getByRole("button", { name: "Light" }).click();
    await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "light");
  });
}

test("system appearance preserves editing and Cell projections", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/exp/web-tui/");
  const editor = page.locator('[data-cell-probe="editor"]');
  const input = page.getByRole("textbox", { name: "File name" });
  await input.fill("hello世界");
  await input.press("Shift+ArrowLeft");
  const before = await readCellProbe(editor);
  const selection = await input.evaluate((element: HTMLTextAreaElement) =>
    [element.selectionStart, element.selectionEnd]);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("hello世界");
  expect(await input.evaluate((element: HTMLTextAreaElement) =>
    [element.selectionStart, element.selectionEnd])).toEqual(selection);
  const after = await readCellProbe(editor);
  expect(after.revision).toBeGreaterThan(before.revision);
  expect(after.text).toBe(before.text);
  expect(after.viewport).toEqual(before.viewport);
  expect(after.focusedId).toBe(before.focusedId);
  expect(after.cells.map(({ text, ownerId }) => ({ text, ownerId })))
    .toEqual(before.cells.map(({ text, ownerId }) => ({ text, ownerId })));

  const virtual = page.locator('[data-cell-probe="virtualization"]');
  await virtual.focus();
  await page.keyboard.press("PageDown");
  const virtualBefore = await readCellProbe(virtual);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "light");
  expect((await readCellProbe(virtual)).text).toBe(virtualBefore.text);
  await expect(virtual).toHaveAttribute("data-cell-focused", "virtual-file-9");

  const overlay = page.locator('[data-cell-probe="overlay"]');
  await overlay.focus();
  await page.keyboard.press("Enter");
  const overlayBefore = await readCellProbe(overlay);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeAttached();
  expect((await readCellProbe(overlay)).text).toBe(overlayBefore.text);
  await expect(page.locator("#overlay").getByRole("option", { name: "Open file" })).toBeFocused();
  await page.keyboard.press("Escape");

  const canvas = editor.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Editor Canvas is not visible.");
  await page.keyboard.down("Alt");
  await page.keyboard.down("Meta");
  await page.mouse.move(bounds.x + 4, bounds.y + 28);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 350, bounds.y + 65, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await page.keyboard.up("Alt");
  const range = await editor.getAttribute("data-cell-range");
  expect(range).not.toBeNull();
  const copied = await copyCellRange(editor);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "light");
  await expect(editor).toHaveAttribute("data-cell-range", range!);
  expect(await copyCellRange(editor)).toBe(copied);
});

test.describe("font raster invalidation", () => {
test.use({ deviceScaleFactor: 1 });
test("late fonts repaint Canvas without waiting for an interaction", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\.(woff2?|ttf|otf)(\?.*)?$/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/exp/web-tui/", { waitUntil: "domcontentloaded" });
  const canvas = page.locator('[data-cell-probe="core"] canvas');
  await expect(canvas).toBeVisible();
  const fallback = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  release();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  await expect.poll(async () =>
    canvas.evaluate((node: HTMLCanvasElement, previous) => node.toDataURL() !== previous, fallback)
  ).toBe(true);
  const loaded = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await canvas.evaluate(async (node: HTMLCanvasElement) => {
    node.style.width = `${node.getBoundingClientRect().width + 1}px`;
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  expect(await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).toBe(loaded);
});
});

test("snapshot copy feedback expires and a failed copy can be retried", async ({ page }) => {
  await page.addInitScript(() => {
    let attempts = 0;
    Object.defineProperty(navigator, "clipboard", { value: {
      writeText: async () => {
        document.body.dataset.copyAttempts = String(++attempts);
        await new Promise((resolve) => setTimeout(resolve, 30));
        if (attempts === 1) throw new Error("Clipboard denied");
      },
    } });
  });
  await page.goto("/exp/web-tui/");
  const section = page.locator("#core");
  const button = section.locator("[data-copy-state]");
  await button.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
  await expect(button).toHaveAttribute("data-copy-state", "error");
  await expect(button).toHaveAttribute("aria-label", "Copy failed");
  await button.hover();
  await expect(button.locator(".gallery-control-tooltip")).toHaveText("Copy");
  await expect(button.locator(".gallery-control-tooltip")).toBeVisible();
  await expect(button.locator(".lucide-circle-x")).toHaveCount(1);
  await expect(page.locator("body")).toHaveAttribute("data-copy-attempts", "1");
  await button.click();
  await expect(button).toHaveAttribute("data-copy-state", "success");
  await expect(button).toHaveAttribute("aria-label", "Copied");
  await expect(button.locator(".lucide-check")).toHaveCount(1);
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute("data-copy-state", "idle", { timeout: 5000 });
  await expect(button).toHaveAttribute("aria-label", "Copy");
  await expect(section.getByLabel("Copy feedback")).toHaveCount(0);
});

test("gallery fits desktop and narrow screens in both appearances", async ({ page }, testInfo) => {
  await page.goto("/exp/web-tui/");
  await page.evaluate(() => document.fonts.ready);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", colorScheme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`gallery-${width}-${colorScheme}.png`) });
    }
  }
});
