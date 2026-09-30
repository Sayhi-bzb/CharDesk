import { expect, test } from '@playwright/test';

test.use({ hasTouch: true, isMobile: true });

for (const width of [320, 390]) {
  test(`phone undo replaces security and undoes freshly typed content at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const surface = page.getByTestId('canvas-editor-surface');
    await expect(surface).toBeVisible();
    await page.locator('[data-toolbar-item="select"] button').tap();
    const undo = page.getByTestId('canvas-undo');
    await expect(undo).toBeVisible();
    await expect(undo).toBeDisabled();
    await expect(page.getByTestId('data-security-control')).toHaveCount(0);
    const readContent = () => page.evaluate(async () => {
      const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
      return [...getApplicationEditorHost().canvas.getState().contentSurface.reader.materialize()];
    });
    const initialContent = await readContent();
    const undoBox = await undo.boundingBox();
    const dockBox = await page.getByTestId('tool-dock').boundingBox();
    expect(undoBox!.x).toBeGreaterThanOrEqual(dockBox!.x);
    expect(undoBox!.x + undoBox!.width).toBeLessThanOrEqual(dockBox!.x + dockBox!.width);
    expect(dockBox!.x + dockBox!.width / 2).toBeCloseTo(width / 2, 0);
    expect(undoBox!.x + undoBox!.width).toBeLessThanOrEqual(width);

    const box = await surface.boundingBox();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
    const input = surface.locator('[data-canvas-managed-input="true"]');
    await expect(input).toBeFocused();
    await page.keyboard.type('Z');
    await expect(undo).toBeEnabled();
    await expect.poll(readContent).not.toEqual(initialContent);
    await undo.tap();
    await expect(input).not.toBeFocused();
    await expect.poll(readContent).toEqual(initialContent);
    await expect(undo).toBeDisabled();
  });
}

test('desktop retains security instead of the phone undo control', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('data-security-control')).toBeVisible();
  await expect(page.getByTestId('canvas-undo')).toHaveCount(0);
});
