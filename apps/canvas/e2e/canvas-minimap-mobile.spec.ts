import { expect, test } from '@playwright/test';

test.use({ hasTouch: true, isMobile: true });

for (const width of [320, 390]) {
  test(`phone minimap opens above the dock and navigates without editing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
    await page.evaluate(async () => {
      const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
      const canvas = getApplicationEditorHost().canvas;
      await canvas.ready;
      canvas.commands.grid.replace([
        ['0,0', { char: 'A', color: '#000000' }],
        ['100,100', { char: 'Z', color: '#000000' }],
      ]);
      canvas.commands.viewport.setZoom(() => 1);
      canvas.commands.viewport.setOffset(() => ({ x: 0, y: 0 }));
      canvas.commands.anchors.add({ x: 0, y: 0 }, 'Origin');
      if (canvas.getState().contentSurface.reader.getCell({ x: 100, y: 100 })?.char !== 'Z') {
        throw new Error('Minimap test content was not written');
      }
    });
    const toggle = page.getByTestId('zoom-minimap-toggle');
    const marker = page.getByTestId('canvas-anchor-marker');
    await expect(marker).toHaveCount(1);
    const initialMarkerY = await marker.evaluate((node) => node.getBoundingClientRect().y);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('zoom-control')).toHaveCount(0);
    await expect(page.getByTestId('zoom-minimap')).toHaveCount(0);
    const controlBox = await toggle.boundingBox();
    const dockBox = await page.getByTestId('tool-dock').boundingBox();
    expect(controlBox && dockBox).toBeTruthy();
    expect(controlBox!.x + controlBox!.width).toBeLessThanOrEqual(dockBox!.x);

    await toggle.tap();
    const minimap = page.getByTestId('minimap-canvas');
    await expect(minimap).toBeVisible();
    const mapBox = await minimap.boundingBox();
    expect(mapBox).not.toBeNull();
    expect(mapBox!.x).toBeGreaterThanOrEqual(0);
    expect(mapBox!.x + mapBox!.width).toBeLessThanOrEqual(width);
    expect(mapBox!.y + mapBox!.height).toBeLessThan(dockBox!.y);

    // Stay inside the letterboxed content, below the initial viewport.
    await minimap.tap({ position: { x: 110, y: 105 } });
    await expect.poll(() => marker.evaluate((node) => node.getBoundingClientRect().y))
      .toBeLessThan(initialMarkerY - 50);
    expect(await page.locator('[data-canvas-managed-input="true"]').evaluate((input) =>
      document.activeElement === input
    )).toBe(false);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.tap();
    await expect(minimap).toHaveCount(0);
  });
}
