import { expect, test } from '@playwright/test';

for (const width of [320, 390, 767]) {
  test(`phone Host stays light at ${width}px and keeps Inspector`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.locator('[data-toolbar-item="pan"] button')).toHaveAttribute('data-active', 'true');
    for (const tool of ['shape-group', 'bg', 'fill']) {
      await expect(page.locator(`[data-toolbar-item="${tool}"]`)).toHaveCount(0);
    }
    await page.locator('[data-toolbar-item="select"] button').click();
    await expect(page.locator('button[aria-controls="canvas-inspector-panel"]')).toBeVisible();
    await page.locator('button[aria-controls="canvas-inspector-panel"]').click();
    await expect(page.getByTestId('canvas-inspector-panel')).toBeVisible();
    await page.locator('button[aria-controls="canvas-inspector-panel"]').click();
    await expect(page.getByTestId('canvas-undo')).toBeVisible();
    const dock = page.getByTestId('tool-dock');
    const names = await dock.locator('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));
    expect(names).toEqual(['Minimap', 'Hand', 'Select', 'Undo']);
    await expect(page.locator('[data-editor-chrome-region="bottom-start"] button')).toHaveCount(0);
    await expect(page.locator('[data-editor-chrome-region="bottom-end"] button')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('phone-host.png') });
    await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
    await expect(page.getByRole('tab', { name: 'Unicode', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Nerd Icons', exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Template', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Emoji', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('menuitem', { name: /Split|GitHub/ })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Canvas font' })).toBeVisible();
    await expect(page.locator('#settings-canvas-cursor')).toHaveCount(0);
    const search = page.locator('[data-slot="settings-search"] input');
    await search.fill('cursor');
    await expect(page.locator('[data-settings-search-result]')).toHaveCount(0);
    await search.fill('');
    await page.locator('[data-slot="settings-navigation-mobile"] [role="combobox"]').click();
    await expect(page.getByRole('option', { name: /Shortcuts/ })).toHaveCount(0);
    await page.getByRole('option', { name: 'Display', exact: true }).click();
    await expect(page.locator('[data-slot="display-settings-group-row"]')).toHaveCount(1);
  });
}

test('phone TOC preserves hierarchy, navigation and highlight without management', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
  await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    const canvas = getApplicationEditorHost().canvas;
    await canvas.ready;
    canvas.commands.grid.replace([
      ['0,0', { char: 'A', color: '#000000' }],
      ['0,1', { char: 'B', color: '#000000' }],
    ]);
    const parent = canvas.commands.anchors.add({ x: 0, y: 0 }, 'Parent');
    const child = canvas.commands.anchors.add({ x: 0, y: 1 }, 'Child');
    canvas.commands.anchors.move(child.id, parent.id, 0);
  });
  await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  const contents = page.getByRole('tabpanel', { name: 'Contents' });
  await expect(contents.getByRole('button', { name: 'Child', exact: true })).toBeVisible();
  await expect(contents.locator('[draggable="true"]')).toHaveCount(0);
  await contents.getByRole('button', { name: 'Child', exact: true }).click();
  await expect(page.locator('[data-testid="canvas-anchor-marker"][data-highlighted="true"]')).toHaveCount(1);
  await contents.getByRole('button', { name: 'Child', exact: true }).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /Rename|Delete/ })).toHaveCount(0);
});

test('desktop tools and settings recover across the phone boundary', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('[data-toolbar-item="bg"] button').click();
  await expect(page.locator('[data-toolbar-item="bg"] button')).toHaveAttribute('data-active', 'true');
  await page.getByRole('tab', { name: 'Unicode', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('[data-toolbar-item="pan"] button')).toHaveAttribute('data-active', 'true');
  await expect(page.locator('[data-toolbar-item="bg"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Toggle Sidebar' }).click();
  await expect(page.getByRole('tab', { name: 'Unicode', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tabpanel')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 768, height: 900 });
  await expect(page.locator('[data-toolbar-item="bg"]')).toBeVisible();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('menuitem', { name: /GitHub/ })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Settings', exact: true }).click();
  await expect(page.locator('#settings-canvas-cursor')).toBeVisible();
  const profile = await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    return getApplicationEditorHost().textRendering.getProfile();
  });
  await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Shortcuts', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#settings-canvas-cursor')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Canvas font' })).toBeVisible();
  expect(await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    return getApplicationEditorHost().textRendering.getProfile();
  })).toEqual(profile);
});
