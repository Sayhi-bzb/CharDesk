import { expect, test } from '@playwright/test';
import { DEFAULT_CANVAS_CELL_METRICS } from '../src/shared/fonts/canvas-profile';

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

test('touch navigation stays non-editable until a same-cell double tap', async ({ page }) => {
  await page.goto('/');
  const viewport = { offset: { x: 48, y: 80 }, zoom: 1 };
  await page.evaluate((seededViewport) => {
    const session = {
      id: 'touch-input-e2e', name: 'Touch Input', mode: 'freeform',
      scene: [], components: [], grid: [['2,3', { char: 'A', color: '#111827' }]],
      viewport: seededViewport,
    };
    localStorage.setItem('chardesk-persistence', JSON.stringify({
      state: {
        offset: seededViewport.offset, zoom: seededViewport.zoom,
        canvasMode: 'freeform', structuredScene: [], structuredComponents: [],
        brushChar: '#', brushColor: '#111827', showGrid: true,
        exportShowGrid: false, canvasSessions: [session],
        activeCanvasId: session.id, grid: session.grid,
      },
      version: 0,
    }));
  }, viewport);
  await page.reload();
  const surface = page.getByTestId('canvas-editor-surface');
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  const cell = {
    x: box!.x + viewport.offset.x + 2 * DEFAULT_CANVAS_CELL_METRICS.cellWidth + 3,
    y: box!.y + viewport.offset.y + 3 * DEFAULT_CANVAS_CELL_METRICS.cellHeight + 3,
  };
  const activeInput = () => page.evaluate(() =>
    document.activeElement?.getAttribute('data-canvas-managed-input') === 'true'
  );

  await page.touchscreen.tap(cell.x, cell.y);
  expect(await activeInput()).toBe(false);
  await expect(surface).toBeFocused();

  await page.touchscreen.tap(cell.x, cell.y);
  expect(await activeInput()).toBe(true);

  await page.touchscreen.tap(cell.x + 4 * DEFAULT_CANVAS_CELL_METRICS.cellWidth, cell.y);
  expect(await activeInput()).toBe(false);
  await expect(surface).toBeFocused();

  await page.keyboard.type('Z');
  await expect.poll(() => activeInput()).toBe(true);
  await expect.poll(async () => page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('/src/app/compositionRoot.ts');
    return [...getApplicationEditorHost().canvas.getState().contentSurface.reader.materialize().values()]
      .some((cell) => cell.char === 'Z');
  })).toBe(true);
});

test.describe('mouse regression', () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

  test('click keeps direct typing focus and double-click enters text editing', async ({ page }) => {
    await page.goto('/');
    const surface = page.getByTestId('canvas-editor-surface');
    const box = await surface.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    await page.mouse.click(x, y);
    await expect(surface.locator('[data-canvas-managed-input="true"]')).toBeFocused();
    await page.mouse.dblclick(x, y);
    await expect(surface.locator('[data-canvas-managed-input="true"]')).toBeFocused();
  });
});
