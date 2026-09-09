import { expect, test } from "@playwright/test";
import { copyCellRange, readCellProbe } from "./helpers/cell-probe";
import { fusionMonoFontRequest, fusionMonoStylesheetRequest } from "./helpers/fusion-mono";
import { galleryFontSelect, selectGalleryFont } from "./helpers/gallery-font-select";
import { xiaolaiStylesheetRequest } from "./helpers/xiaolai";

test.describe("display font", () => {
  test("loads the local font on demand and preserves Cell state", async ({ page }) => {
    let trialRequests = 0;
    await page.route(xiaolaiStylesheetRequest, (route) => {
      trialRequests += 1;
      return route.continue();
    });
    let releaseFirst!: () => void;
    let requests = 0;
    const firstRequest = new Promise<void>((resolve) => { releaseFirst = resolve; });
    await page.route(fusionMonoFontRequest, async (route) => {
      requests += 1;
      if (requests === 1) await firstRequest;
      await route.continue();
    });
    await page.goto("/exp/web-tui/#/__fixtures/all");
    const gallery = page.locator(".gallery-page");
    const editor = page.locator('[data-cell-probe="editor"]');
    const input = page.getByRole("textbox", { name: "File name" });
    await expect(gallery).toHaveAttribute("data-gallery-font", "maple");
    expect(requests).toBe(0);
    await input.fill("Wnotes-hello.txt");
    await input.press("Shift+ArrowLeft");
    const selection = await input.evaluate((node: HTMLTextAreaElement) =>
      [node.selectionStart, node.selectionEnd]);
    const fontSelect = galleryFontSelect(page);
    const trigger = fontSelect.getByRole("button", { name: "Font: Maple" });
    await trigger.focus();
    const before = await readCellProbe(editor);
    expect(before.presentation?.requestedFontRoutes.display?.boldStrategy).toBe("native");
    await page.keyboard.press("Enter");
    await expect(fontSelect.getByRole("listbox", { name: "Fonts" })).toBeAttached();
    await page.keyboard.press("ArrowDown");
    await expect(fontSelect.getByRole("option", { name: "Fusion" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(gallery).toHaveAttribute("data-gallery-font-status", "loading");
    await expect(gallery).toHaveAttribute("data-gallery-font", "maple");
    await expect(fontSelect.getByRole("button", { name: /^Loading Fusion/ }))
      .toHaveAttribute("aria-disabled", "true");
    expect(requests).toBe(1);
    releaseFirst();
    await expect(gallery).toHaveAttribute("data-gallery-font", "fusion-mono");
    await expect(gallery).toHaveAttribute("data-gallery-font-status", "idle");
    await expect(fontSelect.getByRole("button", { name: "Font: Fusion" })).toBeFocused();
    await expect.poll(async () => (await readCellProbe(editor)).presentation?.fontProfileId)
      .toBe("chardesk/gallery-fusion-mono-maple-core-v7-2026.09.01/cell-ui-graphics-v1");
    const after = await readCellProbe(editor);
    expect(after.presentation?.requestedFontRoutes.display?.boldStrategy).toBe("overdraw");
    expect(after.text).toBe(before.text);
    expect(after.viewport).toEqual(before.viewport);
    expect(after.focusedId).toBe(before.focusedId);
    expect(after.cells.map(({ text, ownerId }) => ({ text, ownerId })))
      .toEqual(before.cells.map(({ text, ownerId }) => ({ text, ownerId })));
    expect(after.presentation).toMatchObject({
      metrics: { cellWidth: expect.any(Number), cellHeight: expect.any(Number), baseline: expect.any(Number), fontSize: 15 },
      measurement: { ready: true },
      requestedFontRoutes: {
        display: { family: expect.stringContaining("Fusion Pixel 12px Mono latin"), fontSize: 15 },
        cjk: { family: expect.stringContaining("Fusion Pixel 12px Mono latin"), fontSize: 15 },
        symbol: { family: expect.stringMatching(/^'Fusion Pixel 12px Mono latin'.*JuliaMono/), fontSize: 15 },
      },
    });
    expect(after.presentation?.glyphInkOverhang.some(({ text }) => text === "W")).toBe(false);
    expect(after.presentation?.metrics).toEqual(before.presentation?.metrics);
    await expect(gallery).toHaveCSS("font-size", "15px");
    await expect(input).toHaveValue("Wnotes-hello.txt");
    expect(await input.evaluate((node: HTMLTextAreaElement) =>
      [node.selectionStart, node.selectionEnd])).toEqual(selection);

    expect(trialRequests).toBe(0);
    await selectGalleryFont(page, "Xiaolai");
    await expect(gallery).toHaveAttribute("data-gallery-font", "xiaolai-mono");
    expect(trialRequests).toBe(1);
    await expect(input).toHaveValue("Wnotes-hello.txt");
    expect(await input.evaluate((node: HTMLTextAreaElement) =>
      [node.selectionStart, node.selectionEnd])).toEqual(selection);
    await selectGalleryFont(page, "Maple");
    await expect(gallery).toHaveAttribute("data-gallery-font", "maple");
    await page.reload();
    await expect(gallery).toHaveAttribute("data-gallery-font", "maple");
    expect(requests).toBe(1);
  });

  for (const resource of ["stylesheet", "font"] as const) {
  test(`a failed local ${resource} keeps the current font and can recover on retry`, async ({ page }) => {
    let requests = 0;
    await page.route(resource === "stylesheet" ? fusionMonoStylesheetRequest : fusionMonoFontRequest, async (route) => {
      requests += 1;
      if (requests === 1) await route.abort("failed");
      else await route.continue();
    });
    await page.goto("/exp/web-tui/#/__fixtures/all");
    const gallery = page.locator(".gallery-page");
    await selectGalleryFont(page, "Fusion");
    await expect(gallery).toHaveAttribute("data-gallery-font", "maple");
    await expect(gallery).toHaveAttribute("data-gallery-font-status", "error");
    const retry = galleryFontSelect(page).getByRole("button", { name: /^Fusion unavailable/ });
    await expect(retry).toBeEnabled();
    await expect(page.getByRole("status")).toContainText("Display remains Maple");
    await selectGalleryFont(page, "Fusion");
    await expect.poll(() => requests).toBe(2);
    await expect(gallery).toHaveAttribute("data-gallery-font", "fusion-mono");
    await expect(gallery).toHaveAttribute("data-gallery-font-status", "idle");
  });
  }
});

test("a successfully loaded font survives a page reload", async ({ page }) => {
  await page.goto("/exp/web-tui/#/components/text");
  const gallery = page.locator(".gallery-page");
  const fontSelect = galleryFontSelect(page);

  await selectGalleryFont(page, "Fusion");
  await expect(gallery).toHaveAttribute("data-gallery-font", "fusion-mono");
  await expect.poll(() => page.evaluate(() => (
    localStorage.getItem("chardesk-web-tui-font")
  ))).toBe("fusion-mono");

  await page.reload();
  await expect(gallery).toHaveAttribute("data-gallery-font", "fusion-mono");
  await expect(gallery).toHaveAttribute("data-gallery-font-status", "idle");
  await expect(fontSelect.getByRole("button", { name: "Font: Fusion" })).toBeAttached();
  await page.waitForTimeout(1_000);
  await expect(gallery).toHaveAttribute("data-gallery-font", "fusion-mono");
});

test("header font Select uses Cell pointer geometry without moving the header", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/exp/web-tui/#/components/text");
  const gallery = page.locator(".gallery-page");
  const header = page.locator(".gallery-header");
  const select = galleryFontSelect(page);
  const closedHeader = await header.boundingBox();
  const closedCanvas = await select.locator("canvas").boundingBox();
  expect(closedHeader).not.toBeNull();
  expect(closedCanvas).not.toBeNull();

  await page.mouse.click(
    closedCanvas!.x + closedCanvas!.width / 2,
    closedCanvas!.y + closedCanvas!.height / 2,
  );
  await expect(select.getByRole("listbox", { name: "Fonts" })).toBeAttached();
  const openProbe = await readCellProbe(select);
  expect(openProbe.viewport).toEqual({ width: 12, height: 1 });
  expect(openProbe.overlayViewport).toEqual({ width: 12, height: 4 });
  expect(openProbe.overlays).toHaveLength(1);
  expect(openProbe.overlays[0]!.rootId).toBe("gallery-font-content");
  expect(openProbe.overlays[0]!.text).toContain("Fusion");
  await expect(select.locator('[data-cell-overlay-root="gallery-font-content"]')).toHaveCount(1);
  expect((await header.boundingBox())?.height).toBe(closedHeader!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await gallery.click({ position: { x: 4, y: 640 } });
  await expect(select.getByRole("listbox", { name: "Fonts" })).toHaveCount(0);
  await expect(select.getByRole("button", { name: "Font: Maple" }))
    .toHaveAttribute("aria-expanded", "false");

  const reopenedCanvas = await select.locator("canvas:not([data-cell-overlay-root])").boundingBox();
  expect(reopenedCanvas).not.toBeNull();
  await page.mouse.click(
    reopenedCanvas!.x + reopenedCanvas!.width / 2,
    reopenedCanvas!.y + reopenedCanvas!.height / 2,
  );
  await expect(select.getByRole("listbox", { name: "Fonts" })).toBeAttached();

  const reopenedProbe = await readCellProbe(select);
  const fontOverlay = reopenedProbe.overlays[0]!;
  const fontLines = fontOverlay.text.split("\n");
  const fusionRow = fontLines.findIndex((line) => line.includes("Fusion"));
  const fusionColumn = fontLines[fusionRow]?.indexOf("Fusion") ?? -1;
  expect(fusionRow).toBeGreaterThanOrEqual(0);
  expect(fusionColumn).toBeGreaterThanOrEqual(0);
  await page.mouse.click(
    reopenedCanvas!.x + (
      fontOverlay.bounds.x + fusionColumn + 0.5
    ) * reopenedProbe.presentation!.metrics.cellWidth,
    reopenedCanvas!.y + (
      fontOverlay.bounds.y + fusionRow + 0.5
    ) * reopenedProbe.presentation!.metrics.cellHeight,
  );
  await expect(select).toHaveAttribute(
    "data-cell-activation-flash", "gallery-font-option-fusion-mono"
  );
  await expect(select.getByRole("listbox", { name: "Fonts" })).toBeAttached();
  await expect(gallery).toHaveAttribute("data-gallery-font", "fusion-mono");
  await expect(select.getByRole("listbox", { name: "Fonts" })).toHaveCount(0);
  await expect(select.getByRole("button", { name: "Font: Fusion" })).toBeAttached();
});

test("theme icon toggles, persists, and preserves Cell state", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/exp/web-tui/#/__fixtures/all");
  const editor = page.locator('[data-cell-probe="editor"]');
  const input = page.getByRole("textbox", { name: "File name" });
  await input.fill("hello世界");
  const before = await readCellProbe(editor);
  const darkToggle = page.getByRole("button", { name: "Dark" });
  const moon = darkToggle.locator('[data-gallery-icon="moon"]');
  await expect(moon).toHaveCount(1);
  await expect(moon).toHaveCSS("width", "15px");
  await expect(moon).toHaveCSS("height", "15px");
  await darkToggle.click();
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(page.getByRole("button", { name: "Light" }).locator('[data-gallery-icon="sun"]')).toHaveCount(1);
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

test("Gallery DOM lines share the 2px token across themes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/exp/web-tui/#/components/button");
  const codeBlock = page.locator(".docs-code").first();
  const tableCell = page.locator(".docs-table-wrap td").first();

  await expect(codeBlock).toHaveCSS("border-top", "2px solid rgb(0, 0, 0)");
  await expect(tableCell).toHaveCSS("border-bottom", "2px solid rgb(0, 0, 0)");

  await page.getByRole("button", { name: "Dark" }).click();
  await expect(codeBlock).toHaveCSS("border-top", "2px solid rgb(255, 255, 255)");
  await expect(tableCell).toHaveCSS("border-bottom", "2px solid rgb(255, 255, 255)");
});

for (const storage of ["invalid", "unavailable"] as const) {
  test(`theme icon works with ${storage} storage`, async ({ page }) => {
    await page.addInitScript((mode) => {
      if (mode === "invalid") localStorage.setItem("chardesk-web-tui-theme", "invalid");
      else Object.defineProperty(window, "localStorage", { get: () => { throw new DOMException("Unavailable", "SecurityError"); } });
    }, storage);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/exp/web-tui/#/__fixtures/all");
    await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
    await page.getByRole("button", { name: "Light" }).click();
    await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "light");
  });
}

test("system appearance preserves editing and Cell projections", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/exp/web-tui/#/__fixtures/all");
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
  await page.goto("/exp/web-tui/#/__fixtures/all", { waitUntil: "domcontentloaded" });
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
  await page.goto("/exp/web-tui/#/components/text");
  const section = page.locator(".docs-section").filter({ has: page.getByRole("heading", { name: "Preview" }) });
  const button = section.locator("[data-copy-state]");
  await button.evaluate((element: HTMLButtonElement) => { element.click(); element.click(); });
  await expect(button).toHaveAttribute("data-copy-state", "error");
  await expect(button).toHaveAttribute("aria-label", "Copy failed");
  await button.hover();
  await expect(button.locator(".gallery-control-tooltip")).toHaveText("Copy");
  await expect(button.locator(".gallery-control-tooltip")).toBeVisible();
  await expect(button.locator('[data-gallery-icon="error"]')).toHaveCount(1);
  await expect(page.locator("body")).toHaveAttribute("data-copy-attempts", "1");
  await button.click();
  await expect(button).toHaveAttribute("data-copy-state", "success");
  await expect(button).toHaveAttribute("aria-label", "Copied");
  await expect(button.locator('[data-gallery-icon="check"]')).toHaveCount(1);
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
