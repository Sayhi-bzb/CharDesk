import { expect, test } from '@playwright/test';
import { DEFAULT_CANVAS_CELL_METRICS } from '../src/shared/fonts/canvas-profile';

test('pasting Markdown headings creates navigable Contents anchors by default', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();

  await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    const host = getApplicationEditorHost();
    await host.canvas.ready;
    host.canvas.commands.grid.replace([]);
    host.canvas.commands.staticGrid.setActiveCell({ x: 8, y: 6 });
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', '# Intro\n\n## Details');
    await host.canvas.commands.selection.paste({ eventDataTransfer: clipboardData });
  });

  const contents = page.getByRole('tabpanel', { name: 'Contents' });
  await expect(contents.getByRole('button', { name: '# Intro' })).toBeVisible();
  await expect(contents.getByRole('button', { name: '## Details' })).toBeVisible();
  await expect(page.getByTestId('canvas-anchor-marker')).toHaveCount(2);
});

test('navigates to a Canvas anchor and restores it after reload', async ({ page }) => {
  const marker = page.getByTestId('canvas-anchor-marker');
  const markerColor = () => marker.evaluate((element) => getComputedStyle(element).color);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();

  await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    const canvas = getApplicationEditorHost().canvas;
    await canvas.ready;
    canvas.commands.grid.replace([
      ['0,0', { char: '#', color: '#000000' }],
      ['1,0', { char: ' ', color: '#000000' }],
      ['2,0', { char: 'I', color: '#000000' }],
      ['3,0', { char: 'd', color: '#000000' }],
      ['4,0', { char: 'e', color: '#000000' }],
      ['5,0', { char: 'a', color: '#000000' }],
    ]);
    canvas.commands.staticGrid.setActiveCell({ x: 0, y: 0 });
    canvas.commands.anchors.add({ x: 0, y: 0 });
  });

  await page.getByRole('tab', { name: 'Contents' }).click();
  const contents = page.getByRole('tabpanel', { name: 'Contents' });
  const anchorItem = contents.getByRole('button', { name: /Idea/ });
  await expect(anchorItem).toBeVisible();
  await expect(anchorItem).not.toHaveAttribute('title');
  await anchorItem.hover();
  await expect(page.getByRole('tooltip')).toHaveText('# Idea');
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveText('●');
  const defaultMarkerColor = await markerColor();

  await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    getApplicationEditorHost().canvas.commands.viewport.setOffset(() => ({ x: -400, y: -300 }));
  });
  const beforeNavigation = await marker.evaluate((element) => element.getBoundingClientRect().x);
  const positionsPromise = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const positions: number[] = [];
        const startedAt = performance.now();
        const sample = () => {
          const marker = document.querySelector<HTMLElement>(
            "[data-testid='canvas-anchor-marker']"
          );
          if (marker) positions.push(marker.getBoundingClientRect().x);
          if (performance.now() - startedAt >= 260) resolve(positions);
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      })
  );
  await contents.getByRole('button', { name: /Idea/ }).click();
  await expect(marker).toHaveAttribute('data-highlighted', 'true');
  await expect(marker).toHaveClass(/text-canvas-anchor-highlight/);
  await expect.poll(markerColor).not.toBe(defaultMarkerColor);
  const positions = await positionsPromise;
  expect(new Set(positions.map((position) => Math.round(position))).size).toBeGreaterThan(3);
  await expect
    .poll(() =>
      marker.evaluate((element) => element.getBoundingClientRect().x)
    )
    .toBeGreaterThan(beforeNavigation + 50);
  await expect.poll(async () => {
    const surface = await page.getByTestId('canvas-editor-surface').boundingBox();
    const markerBox = await marker.boundingBox();
    if (!surface || !markerBox) return false;
    return Math.abs(markerBox.x - surface.x - (
      surface.width / 4 - DEFAULT_CANVAS_CELL_METRICS.cellWidth / 2 - 12
    )) < 2 && Math.abs(markerBox.y - surface.y - (surface.height / 4 - 6)) < 2;
  }).toBe(true);
  await expect.poll(markerColor).not.toBe(defaultMarkerColor);
  await expect(marker).not.toHaveAttribute('data-highlighted', 'true');
  await expect(marker).toHaveClass(/text-foreground/);
  await expect.poll(markerColor).toBe(defaultMarkerColor);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await contents.getByRole('button', { name: /Idea/ }).click();
  await expect(marker).toHaveAttribute('data-highlighted', 'true');
  expect(await marker.evaluate((element) =>
    getComputedStyle(element).animationName
  )).toBe('none');

  await page.reload();
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
  await page.getByRole('tab', { name: 'Contents' }).click();
  await expect(
    page.getByRole('tabpanel', { name: 'Contents' }).getByRole('button', { name: /Idea/ })
  ).toBeVisible();
});

test('creates a fixed literal anchor from a right-clicked Chinese range', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
  await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    const canvas = getApplicationEditorHost().canvas;
    await canvas.ready;
    canvas.commands.grid.replace([
      ['45,17', { char: '#', color: '#000000' }],
      ['46,17', { char: ' ', color: '#000000' }],
      ['47,17', { char: '什', color: '#000000' }],
      ['49,17', { char: '么', color: '#000000' }],
      ['51,17', { char: '是', color: '#000000' }],
      ['53,17', { char: '哲', color: '#000000' }],
      ['55,17', { char: '学', color: '#000000' }],
    ]);
    canvas.commands.staticGrid.setSelectionRange({
      start: { x: 45, y: 17 },
      end: { x: 56, y: 17 },
    });
  });

  await page.getByTestId('canvas-editor-surface').click({
    button: 'right',
    position: { x: 405, y: 345 },
  });
  const addAnchor = page.getByRole('menuitem', { name: 'Add anchor' });
  await expect(addAnchor).toBeEnabled();
  await addAnchor.click();
  await page.getByRole('tab', { name: 'Contents' }).click();
  const contents = page.getByRole('tabpanel', { name: 'Contents' });
  await expect(contents.getByRole('button', { name: /# 什么是哲学/ })).toBeVisible();

  await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    getApplicationEditorHost().canvas.documents.mutateGrid((grid) => {
      grid.set('47,17', { char: '如', color: '#000000' });
    });
  });
  await expect(contents.getByRole('button', { name: /# 什么是哲学/ })).toBeVisible();
});

test('shows a compact, aligned Contents tree, reorders rows, and removes through the context menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
  const longTitle = 'A long anchor heading that takes more than one line in the Contents sidebar';
  await page.evaluate(async (label) => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    const canvas = getApplicationEditorHost().canvas;
    await canvas.ready;
    canvas.commands.grid.replace([
      ['0,0', { char: 'A', color: '#000000' }],
      ['0,1', { char: 'B', color: '#000000' }],
      ['0,2', { char: 'C', color: '#000000' }],
    ]);
    canvas.commands.anchors.add({ x: 0, y: 0 }, label);
    canvas.commands.anchors.add({ x: 0, y: 1 }, 'B');
    canvas.commands.anchors.add({ x: 0, y: 2 }, 'C');
  }, longTitle);

  await page.getByRole('tab', { name: 'Contents' }).click();
  const contents = page.getByRole('tabpanel', { name: 'Contents' });
  await expect(contents.getByRole('button', { name: 'Add anchor' })).toHaveCount(0);
  await expect(contents.locator('svg')).toHaveCount(0);
  const rows = contents.locator('[data-reorder-item]');
  const firstHeight = await rows.nth(0).evaluate((row) => row.getBoundingClientRect().height);
  const secondHeight = await rows.nth(1).evaluate((row) => row.getBoundingClientRect().height);
  expect(Math.abs(firstHeight - secondHeight)).toBeLessThan(1);
  const firstLabel = rows.nth(0).locator('button span');
  await expect(firstLabel).toHaveCSS('font-size', '12px');
  await expect(firstLabel).toHaveCSS('white-space', 'nowrap');
  await expect(firstLabel).toHaveCSS('text-overflow', 'ellipsis');
  await rows.nth(0).locator('button').hover();
  await expect(page.getByRole('tooltip')).toHaveText(longTitle);
  await rows.nth(1).dragTo(rows.nth(0), { targetPosition: { x: 24, y: 2 } });
  await expect(rows.nth(0)).toContainText('B');
  await expect(rows.nth(1)).toContainText(longTitle);

  await contents.getByRole('button', { name: 'B', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete anchor' }).click();
  await expect(contents.getByRole('button', { name: 'B', exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('tab', { name: 'Contents' }).click();
  const restored = page.getByRole('tabpanel', { name: 'Contents' });
  await expect(restored.locator('[data-reorder-item]').first()).toContainText(longTitle);
  await expect(restored.locator('[data-reorder-item]').last()).toContainText('C');
});

test('removes an empty anchor from Contents and promotes its child', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
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
    canvas.documents.mutateGrid((grid) => grid.delete('0,0'));
  });

  await page.getByRole('tab', { name: 'Contents' }).click();
  const contents = page.getByRole('tabpanel', { name: 'Contents' });
  await expect(contents.getByRole('button', { name: 'Parent' })).toHaveCount(0);
  await expect(contents.getByRole('button', { name: 'Child' })).toBeVisible();
  await expect(page.getByTestId('canvas-anchor-marker')).toHaveCount(1);
  await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    getApplicationEditorHost().canvas.documents.undo();
  });
  await expect(contents.getByRole('button', { name: 'Parent' })).toBeVisible();
  await expect(page.getByTestId('canvas-anchor-marker')).toHaveCount(2);
  await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    getApplicationEditorHost().canvas.documents.redo();
  });
  await expect(contents.getByRole('button', { name: 'Parent' })).toHaveCount(0);
  await page.reload();
  await page.getByRole('tab', { name: 'Contents' }).click();
  const restoredChild = page.getByRole('tabpanel', { name: 'Contents' })
    .getByRole('button', { name: 'Child' });
  await expect(restoredChild).toBeVisible();
  await restoredChild.click();
  await expect(page.getByTestId('canvas-anchor-marker')).toHaveAttribute('data-highlighted', 'true');
  await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    const canvas = getApplicationEditorHost().canvas;
    await canvas.ready;
    const documents = canvas.documents;
    const child = documents.getAnchorsAt(documents.getActiveAddress())
      .find((anchor) => anchor.label === 'Child');
    if (!child) throw new Error('Child anchor was not restored');
    documents.mutateGrid((grid) => grid.delete(`${child.point.x},${child.point.y}`));
  });
  await expect(page.getByTestId('canvas-anchor-marker')).toHaveCount(0);
  await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    getApplicationEditorHost().canvas.documents.undo();
  });
  await expect(page.getByTestId('canvas-anchor-marker')).toHaveCount(1);
  await expect(page.getByTestId('canvas-anchor-marker')).not.toHaveAttribute('data-highlighted', 'true');
});

test('nests a branch with Headless Tree and restores it with undo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
  await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    const canvas = getApplicationEditorHost().canvas;
    await canvas.ready;
    canvas.commands.grid.replace(
      ['A', 'B', 'C'].map((char, y) => [`0,${y}`, { char, color: '#000000' }])
    );
    ['A', 'B', 'C'].forEach((label, y) => canvas.commands.anchors.add({ x: 0, y }, label));
  });
  await page.getByRole('tab', { name: 'Contents' }).click();
  const contents = page.getByRole('tabpanel', { name: 'Contents' });
  const row = (label: string) => contents.locator('[data-anchor-row]').filter({ hasText: label });
  const middle = async (label: string) => {
    const box = await row(label).boundingBox();
    expect(box).toBeTruthy();
    return { x: 45, y: box!.height / 2 };
  };
  await row('B').dragTo(row('A'), { targetPosition: await middle('A') });
  await expect.poll(() => row('B').evaluate((element) => element.style.paddingLeft)).toBe('14px');
  await row('C').dragTo(row('B'), { targetPosition: await middle('B') });
  await expect.poll(() => row('C').evaluate((element) => element.style.paddingLeft)).toBe('28px');

  await page.reload();
  await page.getByRole('tab', { name: 'Contents' }).click();
  const restored = page.getByRole('tabpanel', { name: 'Contents' });
  await expect(restored.locator('[data-anchor-row]')).toHaveCount(3);
  await expect(restored.locator('[data-anchor-row]').last()).toHaveCSS('padding-left', '28px');
  await restored.getByRole('button', { name: 'A', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete branch (3 anchors)' }).click();
  await expect(restored.locator('[data-anchor-row]')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(restored.locator('[data-anchor-row]')).toHaveCount(3);
});

test('shows only rename and delete in the Contents context menu and cancels rename', async ({
  page,
}) => {
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
    canvas.commands.anchors.add({ x: 0, y: 0 }, 'A');
    canvas.commands.anchors.add({ x: 0, y: 1 }, 'B');
  });
  await page.getByRole('tab', { name: 'Contents' }).click();
  const contents = page.getByRole('tabpanel', { name: 'Contents' });
  await contents.getByRole('button', { name: 'B', exact: true }).click({ button: 'right' });
  await expect(page.getByRole('menuitem')).toHaveCount(2);
  await expect(page.getByRole('menuitem', { name: 'Rename anchor' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Delete anchor' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Rename anchor' }).click();
  const name = contents.getByRole('textbox', { name: 'Anchor name' });
  await expect(name).toBeFocused();
  await name.fill('Changed');
  await name.press('Escape');
  await expect(contents.getByRole('button', { name: 'B', exact: true })).toBeVisible();
  await contents.getByRole('button', { name: 'B', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename anchor' }).click();
  await name.fill('New B');
  await name.press('Enter');
  await expect(contents.getByRole('button', { name: 'New B', exact: true })).toBeVisible();
  await expect(contents.locator('svg')).toHaveCount(0);
});

test('highlights a child target without changing the source before drop', async ({ page }) => {
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
    canvas.commands.anchors.add({ x: 0, y: 0 }, 'A');
    canvas.commands.anchors.add({ x: 0, y: 1 }, 'B');
  });
  await page.getByRole('tab', { name: 'Contents' }).click();
  const contents = page.getByRole('tabpanel', { name: 'Contents' });
  const a = contents.locator('[data-anchor-row]').filter({ hasText: 'A' });
  const b = contents.locator('[data-anchor-row]').filter({ hasText: 'B' });
  const aBox = await a.boundingBox();
  const bBox = await b.boundingBox();
  expect(aBox && bBox).toBeTruthy();
  await page.mouse.move(bBox!.x + 45, bBox!.y + bBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(aBox!.x + 45, aBox!.y + aBox!.height / 2, { steps: 8 });
  await expect(a).toHaveAttribute('data-drop-intent', 'nest');
  await expect.poll(() => b.evaluate((element) => element.style.paddingLeft)).toBe('0px');
  await page.mouse.up();
  await expect.poll(() => b.evaluate((element) => element.style.paddingLeft)).toBe('14px');
});

test('keeps keyboard sibling moves available', async ({ page }) => {
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
    canvas.commands.anchors.add({ x: 0, y: 0 }, 'A');
    canvas.commands.anchors.add({ x: 0, y: 1 }, 'B');
  });
  await page.getByRole('tab', { name: 'Contents' }).click();
  const rows = page.getByRole('tabpanel', { name: 'Contents' }).locator('[data-anchor-row]');
  await rows.nth(1).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(rows.first()).toContainText('B');
});
