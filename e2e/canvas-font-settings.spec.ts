import { expect, test, type Page } from "@playwright/test";
import { arkMonoStylesheetRequest } from "./helpers/ark-mono";

const fontState = (page: Page) => page.evaluate<{
  font: string; requestedFont: string; status: string;
}>(`import('/src/app/compositionRoot.ts').then(({getApplicationEditorHost}) => {
  const {font, requestedFont, status} = getApplicationEditorHost().canvasFont.getSnapshot();
  return {font, requestedFont, status};
})`);

const artifact = (page: Page) => page.evaluate<string>(`import('/src/app/compositionRoot.ts').then(({getApplicationEditorHost}) => {
  const state = getApplicationEditorHost().canvas.getState();
  return JSON.stringify({ grid: [...state.grid], offset: state.offset, zoom: state.zoom, textCursor: state.textCursor, canvasMode: state.canvasMode });
})`);

async function openFontSettings(page: Page) {
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search settings" }).fill("font");
  await page.getByRole("button", { name: "Canvas font", exact: true }).click();
  await expect(page.getByRole("heading", { name: "General", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Canvas font" })).toBeVisible();
}

test("Host font switching redraws Unicode cells, survives reload, and agrees with PNG", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const draws: Array<{ char: string; font: string; layer: string }> = [];
    Object.defineProperty(window, "__fontDraws", { value: draws });
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
      if (draws.length > 20_000) draws.splice(0, 10_000);
      draws.push({ char: text, font: this.font, layer: this.canvas.dataset.canvasLayer ?? "export" });
      if (maxWidth === undefined) original.call(this, text, x, y);
      else original.call(this, text, x, y, maxWidth);
    };
  });
  await page.goto("/");
  await expect(page.getByTestId("canvas-editor-surface")).toBeVisible();
  await expect.poll(() => fontState(page)).toMatchObject({ font: "maple", status: "idle" });
  const original = await artifact(page);
  await openFontSettings(page);
  const evidence: unknown[] = [];
  for (const [id, label, family] of [
    ["ark-mono", "Ark Pixel 12px Mono", "Ark Pixel"],
    ["xiaolai-mono", "Xiaolai Mono", "Xiaolai Mono"],
    ["maple", "Maple Mono", "Maple Mono"],
  ]) {
    await page.evaluate("window.__fontDraws.length = 0");
    await page.getByRole("combobox", { name: "Canvas font" }).click();
    await page.getByRole("option", { name: label, exact: true }).click();
    await expect.poll(() => fontState(page), { timeout: 30_000 }).toMatchObject({ font: id, status: "idle" });
    await expect.poll(() => page.evaluate<boolean>(`window.__fontDraws.some(d => d.layer === 'content' && /[a-zA-Z]/.test(d.char) && d.font.includes(${JSON.stringify(family)}))`)).toBe(true);
    expect(await artifact(page)).toBe(original);
    const samples = await page.evaluate<Array<{ char: string; font: string }>>(`window.__fontDraws.filter(d => d.layer === 'content' && /^[\\u2500-\\u259f]$/.test(d.char))`);
    expect(samples.length).toBeGreaterThan(0);
    expect([...new Set(samples.map(({ font }) => font))]).toEqual([expect.stringMatching(/^\d+(?:\.\d+)?px ['"]?JuliaMono['"]?$/)]);
    evidence.push({ id, samples: samples.slice(0, 10) });
  }
  await page.getByRole("combobox", { name: "Canvas font" }).click();
  await page.getByRole("option", { name: "Xiaolai Mono", exact: true }).click();
  await expect.poll(() => fontState(page)).toMatchObject({ font: "xiaolai-mono", status: "idle" });
  await page.screenshot({ path: testInfo.outputPath("settings-font.png") });
  await page.keyboard.press("Escape");
  await page.reload();
  await expect.poll(() => fontState(page), { timeout: 30_000 }).toMatchObject({ font: "xiaolai-mono", status: "idle" });
  await page.evaluate("window.__fontDraws.length = 0");
  await page.getByRole("button", { name: "Select canvas" }).click();
  await page.getByRole("button", { name: /^Manage / }).first().click();
  await page.getByRole("menuitem", { name: "Export", exact: true }).hover();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "PNG", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.png$/);
  expect(await page.evaluate<boolean>("window.__fontDraws.some(d => d.layer === 'export' && d.font.includes('Xiaolai Mono'))")).toBe(true);
  const coreExport = await page.evaluate<Array<{ char: string; font: string }>>("window.__fontDraws.filter(d => d.layer === 'export' && /^[\\u2500-\\u259f]$/.test(d.char))");
  expect(coreExport.length).toBeGreaterThan(0);
  expect([...new Set(coreExport.map(({ font }) => font))]).toEqual([expect.stringMatching(/^15px ['"]?JuliaMono['"]?$/)]);
  await testInfo.attach("font-routing.json", { body: JSON.stringify(evidence, null, 2), contentType: "application/json" });
});

test("failed font loading keeps the Canvas and offers an inline retry", async ({ page }) => {
  await page.route(arkMonoStylesheetRequest, (route) => route.abort());
  await page.goto("/");
  await expect.poll(() => fontState(page)).toMatchObject({ status: "idle" });
  await openFontSettings(page);
  await page.getByRole("combobox", { name: "Canvas font" }).click();
  await page.getByRole("option", { name: "Ark Pixel 12px Mono", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  expect(await fontState(page)).toMatchObject({ font: "maple", requestedFont: "ark-mono", status: "error" });
  await page.unroute(arkMonoStylesheetRequest);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(() => fontState(page)).toMatchObject({ font: "ark-mono", status: "idle" });
});

test("font setting fits a narrow Host and supports keyboard selection", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await openFontSettings(page);
  const select = page.getByRole("combobox", { name: "Canvas font" });
  await select.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("option", { name: "Maple Mono", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Ark Pixel 12px Mono", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => fontState(page)).toMatchObject({ font: "ark-mono", status: "idle" });
  const dialog = page.getByRole("dialog", { name: "Settings" });
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("settings-font-mobile.png") });
});
