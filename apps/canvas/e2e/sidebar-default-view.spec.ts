import { expect, test } from '@playwright/test';

test('defaults to Contents only for a Canvas with anchors without overriding manual selection', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
  const components = page.getByRole('tab', { name: 'Components' });
  const contents = page.getByRole('tab', { name: 'Contents' });
  await expect(page.getByTestId('freeform-view-rail-vertical'))
    .toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(components).toHaveAttribute('aria-selected', 'true');

  await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('/src/app/compositionRoot.ts');
    const canvas = getApplicationEditorHost().canvas;
    await canvas.ready;
    canvas.commands.grid.replace([
      ['0,0', { char: 'A', color: '#000000' }],
      ['0,1', { char: 'B', color: '#000000' }],
    ]);
    canvas.commands.anchors.add({ x: 0, y: 0 }, 'First');
  });
  await expect(contents).toHaveAttribute('aria-selected', 'true');

  await components.click();
  await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('/src/app/compositionRoot.ts');
    getApplicationEditorHost().canvas.commands.anchors.add({ x: 0, y: 1 }, 'Second');
  });
  await expect(components).toHaveAttribute('aria-selected', 'true');

  const selector = page.getByRole('button', { name: 'Select canvas' });
  await selector.click();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New Freeform' }).click();
  const nameInput = page.getByRole('textbox', { name: 'Canvas name' });
  await nameInput.fill('Empty canvas');
  await nameInput.press('Enter');
  await expect(components).toHaveAttribute('aria-selected', 'true');
  await selector.click();
  await page.getByRole('dialog', { name: 'Select canvas' })
    .getByRole('button', { name: 'Welcome', exact: true }).click();
  await expect(contents).toHaveAttribute('aria-selected', 'true');
});
