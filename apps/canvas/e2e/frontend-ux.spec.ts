import { expect, test } from '@playwright/test';

test.describe('Frontend UX design contract', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('chardesk-onboarding-v1', 'completed');
    });
  });

  test('keeps browser zoom available and adapts split and Guide on narrow screens', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('chardesk-canvas-split-enabled', 'true');
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      'width=device-width, initial-scale=1.0'
    );
    await expect(page.getByTestId('canvas-view-secondary')).toHaveCount(0);

    const trigger = page.getByRole('button', { name: 'Open menu' });
    await trigger.click();
    const menu = page.getByRole('menu', { name: 'Open menu' });
    await expect(menu.getByRole('menuitem', { name: 'Split' })).toHaveCount(0);
    await menu.getByRole('menuitem', { name: 'Help' }).hover();
    await page.getByRole('menuitem', { name: 'Guide' }).click();

    const guide = page.getByRole('dialog', { name: 'Using the canvas on touch' });
    await expect(guide).toBeVisible();
    await expect(guide).toContainText('Pinch with two fingers');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();

    await page.setViewportSize({ width: 700, height: 844 });
    await expect(page.getByTestId('canvas-view-secondary')).toBeVisible();
    await trigger.click();
    await expect(
      page.getByRole('menu', { name: 'Open menu' }).getByRole('menuitem', {
        name: 'Close split',
      })
    ).toBeVisible();
  });

  test('uses roving focus inside the visible character collection', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    const characters = page.locator('[data-character-codepoints]:visible');
    await expect(characters.first()).toBeVisible();
    const tabStops = await characters.evaluateAll((buttons) =>
      buttons.filter((button) => button.getAttribute('tabindex') === '0').length
    );
    expect(tabStops).toBe(1);

    const first = characters.nth(0);
    const second = characters.nth(1);
    await first.focus();
    await first.press('ArrowRight');
    await expect(second).toBeFocused();
    await expect(first).toHaveAttribute('tabindex', '-1');
    await expect(second).toHaveAttribute('tabindex', '0');
  });
});
