import { expect, test, type Page } from "@playwright/test";

const liveHostImport = `import(performance.getEntriesByType('resource').find(entry =>
  new URL(entry.name).pathname === '/src/app/compositionRoot.ts').name)`;

const cursorPreference = (page: Page) => page.evaluate<{ shape: string; blink: boolean }>(
  `${liveHostImport}.then(({getApplicationEditorHost}) =>
    getApplicationEditorHost().canvasCursor.getSnapshot())`
);

async function openCursorSettings(page: Page) {
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Canvas cursor" })).toBeVisible();
}

async function selectCursorShape(page: Page, label: string) {
  await page.getByRole("combobox", { name: "Canvas cursor" }).click();
  await page.getByRole("option", { name: label, exact: true }).click();
}

test("Canvas consumes the persisted terminal cursor preference", async ({ page }) => {
  await page.addInitScript(() => {
    const rects: Array<{ width: number; height: number; layer: string }> = [];
    Object.defineProperty(window, "__cursorRects", { value: rects });
    const original = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, width, height) {
      if (rects.length > 20_000) rects.splice(0, 10_000);
      rects.push({
        width,
        height,
        layer: this.canvas.dataset.canvasLayer ?? "export",
      });
      original.call(this, x, y, width, height);
    };
  });
  await page.goto("/");
  await expect(page.getByTestId("canvas-editor-surface")).toBeVisible();
  await openCursorSettings(page);

  await page.evaluate("window.__cursorRects.length = 0");
  await selectCursorShape(page, "Bar");
  await expect.poll(() => cursorPreference(page)).toEqual({ shape: "bar", blink: true });
  await expect.poll(() => page.evaluate<boolean>(
    "window.__cursorRects.some(rect => rect.layer === 'interaction' && rect.width <= 2 && rect.height >= 10)"
  )).toBe(true);

  await page.evaluate("window.__cursorRects.length = 0");
  await selectCursorShape(page, "Underline");
  await expect.poll(() => page.evaluate<boolean>(
    "window.__cursorRects.some(rect => rect.layer === 'interaction' && rect.width >= 8 && rect.height <= 2)"
  )).toBe(true);

  await page.getByRole("checkbox", { name: "Blink cursor" }).click();
  await expect.poll(() => cursorPreference(page)).toEqual({ shape: "underline", blink: false });
  await page.keyboard.press("Escape");
  await page.reload();
  await expect.poll(() => cursorPreference(page)).toEqual({ shape: "underline", blink: false });

  await openCursorSettings(page);
  await expect(page.getByRole("combobox", { name: "Canvas cursor" })).toHaveText("Underline");
  await expect(page.getByRole("checkbox", { name: "Blink cursor" })).not.toBeChecked();
});
