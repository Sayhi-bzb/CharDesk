import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const readContent = async (page: import('@playwright/test').Page) => page.evaluate(async () => {
  const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
  return [...getApplicationEditorHost().canvas.getState().contentSurface.reader.materialize()];
});

test('tap arms placement, closes sidebar, inserts once and supports undo', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('canvas-editor-surface').waitFor();
  const initial = await readContent(page);
  await page.getByRole('button', { name: 'Toggle Sidebar' }).tap();
  await page.locator('[data-onboarding-template-id="button"]').tap();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByTestId('template-placement-control')).toBeVisible();
  expect(await readContent(page)).toEqual(initial);
  await page.touchscreen.tap(45, 350);
  await expect(page.getByTestId('template-placement-control')).toHaveCount(0);
  await expect.poll(() => readContent(page)).not.toEqual(initial);
  await expect(page.locator('[data-canvas-managed-input="true"]')).not.toBeFocused();
  await page.getByTestId('canvas-undo').tap();
  await expect.poll(() => readContent(page)).toEqual(initial);
});

test('cancel armed placement does not modify the canvas', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('canvas-editor-surface').waitFor();
  const initial = await readContent(page);
  await page.getByRole('button', { name: 'Toggle Sidebar' }).tap();
  await page.locator('[data-onboarding-template-id="button"]').tap();
  await page.getByTestId('template-placement-control').getByRole('button', { name: 'Cancel' }).tap();
  await expect(page.getByTestId('template-placement-control')).toHaveCount(0);
  expect(await readContent(page)).toEqual(initial);
});

test('page templates use the same phone placement and undo path', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('canvas-editor-surface').waitFor();
  const initial = await readContent(page);
  await page.getByRole('button', { name: 'Toggle Sidebar' }).tap();
  await page.getByRole('tab', { name: 'Template', exact: true }).tap();
  await page.locator('[data-onboarding-template-id]').first().tap();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.touchscreen.tap(45, 350);
  await expect.poll(() => readContent(page)).not.toEqual(initial);
  await page.getByTestId('canvas-undo').tap();
  await expect.poll(() => readContent(page)).toEqual(initial);
});

test('long press survives source unmount and shows a drag preview before dropping', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'chromium', 'Real touch movement uses the Chromium input protocol');
  await page.goto('/');
  await page.getByTestId('canvas-editor-surface').waitFor();
  const initial = await readContent(page);
  await page.getByRole('button', { name: 'Toggle Sidebar' }).tap();
  const tile = page.locator('[data-onboarding-template-id="button"]');
  await tile.scrollIntoViewIfNeeded();
  const box = (await tile.boundingBox())!;
  const input = await context.newCDPSession(page);
  await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
  await expect(page.getByTestId('template-placement-control')).toBeVisible();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 45, y: 350 }] });
  await expect(page.getByTestId('canvas-template-preview')).toBeVisible();
  expect(await readContent(page)).toEqual(initial);
  await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByTestId('canvas-template-preview')).toHaveCount(0);
  await expect.poll(() => readContent(page)).not.toEqual(initial);
  await page.getByTestId('canvas-undo').tap();
  await expect.poll(() => readContent(page)).toEqual(initial);
});

test('swiping a tile scrolls the list without arming placement', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'chromium', 'Real touch movement uses the Chromium input protocol');
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle Sidebar' }).tap();
  await expect(page.getByRole('dialog')).toBeFocused();
  await page.getByRole('dialog').evaluate((panel) => Promise.all(panel.getAnimations().map((animation) => animation.finished)));
  const first = page.locator('[data-onboarding-template-id]').first();
  const box = (await first.boundingBox())!;
  const input = await context.newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height - 10;
  await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 5; step++) {
    await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 18 }] });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
  await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('template-placement-control')).toHaveCount(0);
  await expect.poll(() => page.getByTestId('sidebar-view-content').locator('[data-slot="scroll-area-viewport"]').evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
});

test.describe('desktop native drag regression', () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });
  test('native drop still inserts through the shared command', async ({ page }) => {
    await page.goto('/');
    const surface = page.getByTestId('canvas-editor-surface');
    await surface.waitFor();
    const initial = await readContent(page);
    await page.locator('[data-onboarding-template-id="button"]').dragTo(surface, { targetPosition: { x: 45, y: 350 } });
    await expect.poll(() => readContent(page)).not.toEqual(initial);
    await expect(page.getByTestId('template-placement-control')).toHaveCount(0);
  });
});
