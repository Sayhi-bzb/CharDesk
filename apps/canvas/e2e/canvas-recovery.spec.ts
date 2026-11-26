import { expect, test, type Page } from '@playwright/test';

const contentLayer = (page: Page) => page.locator('canvas[data-canvas-layer="content"]');

declare global {
  interface Window {
    __chardeskCanvasExperienceStats?: () => { directFrames: number };
  }
}

const directFrames = (page: Page) => page.evaluate(() =>
  window.__chardeskCanvasExperienceStats?.().directFrames ?? 0
);
const cellCount = (page: Page) => page.evaluate(() => window.__chardeskCanvasStress!.cellCount());

const openCanvas = async (page: Page) => {
  await page.goto('/?canvas-stress=1');
  await expect(contentLayer(page)).toBeVisible();
  await expect.poll(() => directFrames(page)).toBeGreaterThan(0);
};

test('rebuilds the raster after a paint failure and continues handling canvas input', async ({ page }) => {
  const failureMessage = 'Injected canvas paint failure';
  await page.addInitScript((message) => {
    window.addEventListener('error', (event) => {
      if (event.error?.message !== message) return;
      document.documentElement.dataset.paintFailureReported = 'true';
      event.stopImmediatePropagation();
      event.preventDefault();
    }, { capture: true });
  }, failureMessage);
  await openCanvas(page);
  const surface = page.getByTestId('canvas-editor-surface');
  await contentLayer(page).evaluate((canvas: HTMLCanvasElement, message) => {
    const context = canvas.getContext('2d')!;
    const fillRect = context.fillRect;
    context.fillRect = () => {
      context.fillRect = fillRect;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.fillStyle = '#ff00ff';
      fillRect.call(context, 20, 20, 1, 1);
      context.beginPath();
      context.rect(0, 0, 1, 1);
      context.clip();
      throw new Error(message);
    };
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    window.dispatchEvent(new PageTransitionEvent('pageshow'));
  }, failureMessage);
  await expect(page.locator('html')).toHaveAttribute('data-paint-failure-reported', 'true');
  const readPixel = () => contentLayer(page).evaluate((canvas: HTMLCanvasElement) =>
    Array.from(canvas.getContext('2d')!.getImageData(20, 20, 1, 1).data)
  );
  await expect.poll(readPixel).not.toEqual([255, 0, 255, 255]);

  const beforeZoom = await directFrames(page);
  const bounds = (await surface.boundingBox())!;
  await surface.dispatchEvent('wheel', {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    deltaY: -120,
    clientX: Math.round(bounds.x + bounds.width / 2),
    clientY: Math.round(bounds.y + bounds.height / 2),
  });
  await expect.poll(() => directFrames(page)).toBeGreaterThan(beforeZoom);

  const beforeEdit = await cellCount(page);
  await surface.click();
  await expect(surface.locator('textarea[data-canvas-managed-input]')).toBeFocused();
  await page.keyboard.insertText('Paint recovered');
  await expect.poll(() => cellCount(page)).toBeGreaterThan(beforeEdit);
});

test('repaints after foreground and context restoration without reloading', async ({ page }) => {
  await openCanvas(page);
  const initialDocument = await page.evaluate(() => performance.timeOrigin);
  const beforeHidden = await page.evaluate(async () => {
    const before = window.__chardeskCanvasExperienceStats!().directFrames;
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('freeze'));
    document.fonts.dispatchEvent(new Event('loadingdone'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return before;
  });
  expect(await directFrames(page)).toBe(beforeHidden);
  await page.evaluate(() => document.dispatchEvent(new Event('resume')));
  await expect.poll(() => directFrames(page)).toBeGreaterThan(beforeHidden);

  const whileLost = await contentLayer(page).evaluate((canvas: HTMLCanvasElement) => {
    canvas.dispatchEvent(new Event('contextlost'));
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    window.dispatchEvent(new PageTransitionEvent('pageshow'));
    return window.__chardeskCanvasExperienceStats!().directFrames;
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(await directFrames(page)).toBe(whileLost);
  await contentLayer(page).evaluate((canvas: HTMLCanvasElement) => {
    canvas.dispatchEvent(new Event('contextrestored'));
  });
  await expect.poll(() => directFrames(page)).toBeGreaterThan(whileLost);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(initialDocument);
});
