import { expect, test } from '@playwright/test';

test('phone starts with Hand and preserves a manually selected tool on resize', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const hand = page.locator('[data-toolbar-item="pan"] button');
  const select = page.locator('[data-toolbar-item="select"] button');
  await expect(hand).toHaveAttribute('data-active', 'true');
  await select.click();
  await expect(select).toHaveAttribute('data-active', 'true');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(select).toHaveAttribute('data-active', 'true');
  await expect(hand).not.toHaveAttribute('data-active', 'true');
  await page.reload();
  await expect(hand).toHaveAttribute('data-active', 'true');
});

test('desktop retains Select as its default tool', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('[data-toolbar-item="select"] button')).toHaveAttribute('data-active', 'true');
});
