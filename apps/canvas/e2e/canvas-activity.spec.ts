import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
  await page.bringToFront();
  await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    const { setUiLanguage } = await import('../src/shared/i18n/index.ts');
    const canvas = getApplicationEditorHost().canvas;
    await canvas.ready;
    setUiLanguage('en');
    canvas.commands.sessions.create('freeform');
    canvas.commands.grid.replace([]);
    canvas.commands.viewport.setViewport(() => ({ offset: { x: 200, y: 100 }, zoom: 1 }));
  });
}

const pendingRanges = (page: Page) => page.evaluate(async () => {
  const { canvasActivityStore } = await import('../src/shared/canvas-activity.ts');
  return canvasActivityStore.getSnapshot().flatMap((m) => m.ranges);
});
const writeOffscreen = (page: Page) => page.evaluate(async () => {
  const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
  const { createCanvasWriteTool } = await import('../src/app/site-tools/canvasTools.ts');
  const write = createCanvasWriteTool(getApplicationEditorHost().canvas);
  for (let x = 0; x < 30; x++) await write.execute({ at: [500 + x, 500], content: 'X' });
});

for (const theme of ['light', 'dark']) {
  test(`aggregated updates navigate and fade after observation (${theme})`, async ({ page }, testInfo) => {
    await page.addInitScript((theme) => localStorage.setItem('chardesk-host-theme', theme), theme);
    await setup(page);
    await writeOffscreen(page);
    const updates = page.getByRole('button', { name: 'View next update', exact: true });
    await expect(updates).toHaveCount(1);
    await expect(updates).toHaveText('');
    await updates.hover();
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`updates-${theme}.png`) });
    await updates.click();
    await expect(page.locator('[data-canvas-activity="highlight"]')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`highlight-${theme}.png`) });
    await expect.poll(() => pendingRanges(page)).toEqual([]);
    await expect(updates).toHaveCount(0);
  });
}

test('bulk Delete removes updates and they stay cleared after reload', async ({ page }) => {
  await setup(page);
  await writeOffscreen(page);
  await expect(page.locator('[data-canvas-activity="pending"]')).toHaveCount(1);
  await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    const canvas = getApplicationEditorHost().canvas;
    canvas.commands.staticGrid.setSelectionRange({ start: { x: 500, y: 500 }, end: { x: 529, y: 500 } });
    canvas.commands.staticGrid.delete('backward');
    await canvas.flushPersistence(canvas.getState().activeCanvasId);
  });
  await expect.poll(() => pendingRanges(page)).toEqual([]);
  await expect(page.locator('[data-canvas-activity="pending"]')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
  await expect.poll(() => pendingRanges(page)).toEqual([]);
});

test('cross-tab acknowledgement clears existing updates without resurrecting them on reload', async ({ page, context }) => {
  await setup(page);
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByTestId('canvas-editor-surface')).toBeVisible();
  await page.bringToFront();
  await writeOffscreen(page);
  await expect.poll(() => pendingRanges(other)).toEqual([{ y: 500, from: 500, to: 530 }]);
  await other.evaluate(async () => {
    const { acknowledgeCanvasActivity, canvasActivityStore } = await import('../src/shared/canvas-activity.ts');
    for (const marker of canvasActivityStore.getSnapshot()) acknowledgeCanvasActivity(marker, marker.ranges);
  });
  await expect.poll(() => pendingRanges(page)).toEqual([]);
  await page.reload();
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
  await expect.poll(() => pendingRanges(page)).toEqual([]);
  await other.close();
});
