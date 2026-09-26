import { expect, test } from "@playwright/test";
import { canvasFor, cellPoint, copyCellRange, readCellProbe } from "./helpers/cell-probe";
import { fusionMonoFontRequest, fusionMonoStylesheetRequest } from "./helpers/fusion-mono";
import { galleryFontSelect, selectGalleryFont } from "./helpers/gallery-font-select";
import { xiaolaiStylesheetRequest } from "./helpers/xiaolai";

test.describe("display font", () => {
  test("loads the local font on demand and preserves Cell state", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("chardesk-cell-ui-font", "maple"));
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
    await page.goto("/#/__fixtures/editor");
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
    await expect.poll(() => requests).toBe(1);
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
    expect(after.presentation?.metrics).toEqual(before.presentation?.metrics);
    await expect(gallery).toHaveCSS("font-size", "15px");
    await expect(input).toHaveValue("Wnotes-hello.txt");
    expect(await input.evaluate((node: HTMLTextAreaElement) =>
      [node.selectionStart, node.selectionEnd])).toEqual(selection);

    expect(trialRequests).toBe(0);
    await selectGalleryFont(page, "xiaolai-mono");
    await expect(gallery).toHaveAttribute("data-gallery-font", "xiaolai-mono");
    expect(trialRequests).toBe(1);
    await expect(input).toHaveValue("Wnotes-hello.txt");
    expect(await input.evaluate((node: HTMLTextAreaElement) =>
      [node.selectionStart, node.selectionEnd])).toEqual(selection);
    await selectGalleryFont(page, "maple");
    await expect(gallery).toHaveAttribute("data-gallery-font", "maple");
    await page.reload();
    await expect(gallery).toHaveAttribute("data-gallery-font", "maple");
    await expect.poll(() => requests).toBe(1);
  });

  for (const resource of ["stylesheet", "font"] as const) {
  test(`a failed local ${resource} keeps the current font and can recover on retry`, async ({ page }) => {
    let requests = 0;
    await page.route(resource === "stylesheet" ? fusionMonoStylesheetRequest : fusionMonoFontRequest, async (route) => {
      requests += 1;
      if (requests === 1) await route.abort("failed");
      else await route.continue();
    });
    await page.goto("/#/__fixtures/editor");
    const gallery = page.locator(".gallery-page");
    await expect(gallery).toHaveAttribute("data-gallery-font", "maple");
    await expect(gallery).toHaveAttribute("data-gallery-font-status", "error");
    const retry = galleryFontSelect(page).getByRole("button", { name: /^Fusion unavailable/ });
    await expect(retry).toBeEnabled();
    await expect(page.getByRole("status").filter({ hasText: "Display remains Maple" })).toHaveCount(1);
    await selectGalleryFont(page, "fusion-mono");
    await expect.poll(() => requests).toBe(2);
    await expect(gallery).toHaveAttribute("data-gallery-font", "fusion-mono");
    await expect(gallery).toHaveAttribute("data-gallery-font-status", "idle");
  });
  }
});

test("the default Fusion font loads and survives a page reload", async ({ page }) => {
  await page.goto("/#/components/button");
  const gallery = page.locator(".gallery-page");
  const fontSelect = galleryFontSelect(page);

  await expect(gallery).toHaveAttribute("data-gallery-font", "fusion-mono");
  await expect.poll(() => page.evaluate(() => (
    localStorage.getItem("chardesk-cell-ui-font")
  ))).toBe("fusion-mono");

  await page.reload();
  await expect(gallery).toHaveAttribute("data-gallery-font", "fusion-mono");
  await expect(gallery).toHaveAttribute("data-gallery-font-status", "idle");
  await expect(fontSelect.getByRole("button", { name: "Font: Fusion" })).toBeAttached();
  await page.waitForTimeout(1_000);
  await expect(gallery).toHaveAttribute("data-gallery-font", "fusion-mono");
});

test("header font Select uses Cell pointer geometry without moving the header", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("chardesk-cell-ui-font", "maple"));
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/#/components/button");
  const gallery = page.locator(".gallery-page");
  const header = page.locator(".gallery-header");
  const select = galleryFontSelect(page);
  const closedHeader = await header.boundingBox();
  const closedCanvas = await canvasFor(select).boundingBox();
  expect(closedHeader).not.toBeNull();
  expect(closedCanvas).not.toBeNull();

  await page.mouse.click(
    closedCanvas!.x + closedCanvas!.width / 2,
    closedCanvas!.y + closedCanvas!.height / 2,
  );
  await expect(select.getByRole("listbox", { name: "Fonts" })).toBeAttached();
  const openProbe = await readCellProbe(select);
  expect(openProbe.viewport).toEqual({ width: 30, height: 2 });
  expect(openProbe.overlayViewport).toEqual({ width: 30, height: 5 });
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
      fontOverlay.bounds.x + fusionColumn + 1.5
    ) * reopenedProbe.presentation!.metrics.cellWidth,
    reopenedCanvas!.y + (
      fontOverlay.bounds.y + fusionRow + 1.5
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

test("brand link stays neutral in both themes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/#/guides/introduction");
  const header = page.locator('[data-cell-probe="gallery-header"]');
  const brandColor = async () => (await readCellProbe(header)).cells
    .find((cell) => cell.ownerId === "gallery-header-brand")?.style.color;
  await expect.poll(brandColor).toBe("rgb(0, 0, 0)");
  const icon = (await readCellProbe(header)).cells.find((cell) => cell.text === "")!;
  const point = await cellPoint(header, icon.x, icon.y);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
  await expect.poll(brandColor).toBe("rgb(255, 255, 255)");
});

test("theme icon toggles, persists, and preserves Cell state", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/#/__fixtures/editor");
  const editor = page.locator('[data-cell-probe="editor"]');
  const input = page.getByRole("textbox", { name: "File name" });
  await input.fill("hello世界");
  const before = await readCellProbe(editor);
  await expect(page.getByRole("button", { name: "Dark" })).toBeAttached();
  const header = page.locator('[data-cell-probe="gallery-header"]');
  const lightHeader = await readCellProbe(header);
  expect(lightHeader.text).toContain("");
  const themeCell = lightHeader.cells.find((cell) => cell.text === "");
  expect(themeCell).toBeDefined();
  const point = await cellPoint(header, themeCell!.x, themeCell!.y);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  expect((await readCellProbe(header)).text).toContain("");
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

test("Cell article code surface and API remain readable across themes", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/#/components/button");
  const article = page.locator('[data-cell-probe="article-button"]');
  await expect(article.getByRole("table")).toHaveCount(1);
  const light = await readCellProbe(article);
  const row = light.text.split("\n").findIndex((line) => line.includes("npx shadcn"));
  expect(light.cells.find(({ x, y }) => x === 4 && y === row)?.style.backgroundColor)
    .toBe("rgb(230, 230, 230)");

  await page.getByRole("button", { name: "Dark" }).evaluate((element: HTMLElement) => element.click());
  const dark = await readCellProbe(article);
  expect(dark.cells.find(({ x, y }) => x === 4 && y === row)?.style.backgroundColor)
    .toBe("rgb(26, 26, 26)");
  await expect(article.getByRole("table")).toHaveCount(1);
});

for (const storage of ["invalid", "unavailable"] as const) {
  test(`theme icon works with ${storage} storage`, async ({ page }) => {
    await page.addInitScript((mode) => {
      if (mode === "invalid") localStorage.setItem("chardesk-cell-ui-theme", "invalid");
      else Object.defineProperty(window, "localStorage", { get: () => { throw new DOMException("Unavailable", "SecurityError"); } });
    }, storage);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/#/__fixtures/core");
    await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
    await page.getByRole("button", { name: "Light" }).evaluate((element: HTMLElement) => element.click());
    await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "light");
  });
}

test("system appearance preserves editing and Cell projections", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/#/__fixtures/editor");
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

  await page.evaluate(() => { location.hash = "/__fixtures/virtualization"; });
  const virtual = page.locator('[data-cell-probe="virtualization"]');
  await expect(virtual).toBeVisible();
  await virtual.focus();
  await page.keyboard.press("PageDown");
  const virtualBefore = await readCellProbe(virtual);
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "light");
  expect((await readCellProbe(virtual)).text).toBe(virtualBefore.text);
  await expect(virtual).toHaveAttribute("data-cell-focused", "virtual-file-9");

  await page.evaluate(() => { location.hash = "/__fixtures/overlay"; });
  const overlay = page.locator('[data-cell-probe="overlay"]');
  await expect(overlay).toBeVisible();
  await overlay.focus();
  await page.keyboard.press("Enter");
  const overlayBefore = await readCellProbe(overlay);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(".gallery-page")).toHaveAttribute("data-gallery-theme", "dark");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeAttached();
  expect((await readCellProbe(overlay)).text).toBe(overlayBefore.text);
  await expect(page.locator("#overlay").getByRole("menuitem", { name: "Open file" })).toBeFocused();
  await page.keyboard.press("Escape");

  await page.evaluate(() => { location.hash = "/__fixtures/editor"; });
  await expect(editor).toBeVisible();
  const canvas = canvasFor(editor);
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
  await page.goto("/#/__fixtures/core", { waitUntil: "domcontentloaded" });
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
  await page.goto("/#/components/button");
  const preview = page.locator('[data-cell-probe="article-button"]');
  const button = preview.getByRole("button", { name: "Copy preview" });
  await button.evaluate((element: HTMLElement) => { element.click(); element.click(); });
  await expect(preview.getByRole("button", { name: "Copy failed" })).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-copy-attempts", "1");
  await preview.getByRole("button", { name: "Copy failed" }).evaluate((element: HTMLElement) => element.click());
  await expect(preview.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect(preview.getByRole("button", { name: "Copy preview" })).toBeVisible({ timeout: 5000 });
});

test("gallery fits desktop and narrow screens in both appearances", async ({ page }, testInfo) => {
  await page.goto("/");
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
