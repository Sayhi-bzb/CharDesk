import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

test('phone previews stay painted and bounded across scrolling, resizing and reopening', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByTestId('canvas-editor-surface').waitFor();
  const toggle = page.getByRole('button', { name: 'Toggle Sidebar' });
  await toggle.tap();
  const panel = page.getByRole('dialog');
  const previews = panel.getByTestId('canvas-template-preview-viewport');

  const assertPreview = async (index: number) => {
    const canvas = previews.nth(index).getByTestId('cell-frame-canvas');
    await expect(canvas).toBeVisible();
    await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => {
      const host = node.parentElement!.getBoundingClientRect();
      const dpr = window.devicePixelRatio;
      if (node.width > 2000 || node.height > 2000) return false;
      if (Math.abs(node.width - Math.round(host.width * dpr)) > 1 ||
          Math.abs(node.height - Math.round(host.height * dpr)) > 1) return false;
      const pixels = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data;
      return pixels.some((value, offset) => offset % 4 === 3 && value > 0);
    })).toBe(true);
  };

  await assertPreview(0);
  await assertPreview(1);
  await previews.nth(8).scrollIntoViewIfNeeded();
  await assertPreview(8);
  await page.setViewportSize({ width: 320, height: 844 });
  await assertPreview(8);
  await page.keyboard.press('Escape');
  await expect(panel).not.toBeVisible();
  await toggle.tap();
  await assertPreview(0);
  expect(errors).toEqual([]);
});
