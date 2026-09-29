import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function openWorksFromEditor(page: Page) {
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('menuitem', { name: 'Account' }).locator('svg')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Account' }).click();
  await expect(page).toHaveURL(/\/workspace\?view=account$/);
  const mobileNavigation = page.getByRole('button', { name: 'Open workspace navigation' });
  if (await mobileNavigation.isVisible()) await mobileNavigation.click();
  await page.getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('button', { name: 'Works' }).click();
}

test('opens the local workspace from the editor and manages Canvas works', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
  await openWorksFromEditor(page);
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByTestId('local-workspace')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-webmcp-status', 'disposed');
  await expect(page.getByRole('table', { name: 'My workspace' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('button', { name: 'Works' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('columnheader', { name: 'Location' })).toBeVisible();
  const frame = await page.getByTestId('local-workspace').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return [bounds.left, bounds.right, window.innerWidth];
  });
  expect(frame).toEqual([0, frame[2], frame[2]]);

  const first = page.locator('[data-work-kind="canvas"]').first();
  const initialId = await first.getAttribute('data-work-id');
  await first.getByRole('button', { name: /Actions for/ }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const name = page.getByRole('textbox', { name: 'Work name' });
  await name.fill('Local sketch');
  await name.press('Enter');
  await expect(first.getByRole('button', { name: 'Open Local sketch' })).toBeVisible();

  await first.getByRole('button', { name: /Actions for/ }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Local sketch');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator(`[data-work-id="${initialId}"]`)).toHaveCount(0);
  await expect(page.locator('[data-work-kind="canvas"]')).toHaveCount(1);

  await page.getByRole('button', { name: 'Back to editor' }).click();
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
});

test('opens a Blackboard from the local workspace, then renames and deletes its source', async ({ page }) => {
  await page.goto('/workspace');
  await expect(page.getByTestId('local-workspace')).toBeVisible();
  await expect(page.getByRole('table', { name: 'My workspace' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-webmcp-status', 'disposed');
  await page.getByRole('button', { name: 'New work' }).click();
  await page.getByRole('menuitem', { name: 'Blackboard' }).click();
  await expect(page).toHaveURL(/\/blackboard\?workspace=/);
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
  await openWorksFromEditor(page);

  const board = page.locator('[data-work-kind="blackboard"]').first();
  const boardId = await board.getAttribute('data-work-id');
  await board.getByRole('button', { name: /Actions for/ }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const name = page.getByRole('textbox', { name: 'Work name' });
  await name.fill('Research board');
  await name.press('Enter');
  await expect(board.getByRole('button', { name: 'Open Research board' })).toBeVisible();
  await expect.poll(async () => page.evaluate(async (id) => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    const source = await getApplicationEditorHost().blackboard.repository.readWorkspace(id!);
    return source?.files.find((file) => file.path === 'blackboard.yaml')?.content;
  }, boardId)).toContain('title: Research board');

  await page.getByRole('button', { name: 'Back to editor' }).click();
  await expect(page).toHaveURL(/\/blackboard\?workspace=/);
  await expect(page.getByTestId('canvas-session-selector-primary')).toContainText('Research board');
  await openWorksFromEditor(page);

  await board.getByRole('button', { name: /Actions for/ }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator(`[data-work-id="${boardId}"]`)).toHaveCount(0);
  await expect.poll(async () => page.evaluate(async (id) => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    return getApplicationEditorHost().blackboard.repository.readWorkspace(id!);
  }, boardId)).toBeNull();
});

test('searches table rows on a narrow direct workspace route', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/workspace');
  await expect(page.getByTestId('local-workspace')).toBeVisible();
  await page.getByRole('button', { name: 'Open workspace navigation' }).click();
  await expect(page.getByRole('dialog').getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Account settings' }).click();
  await expect(page.getByRole('heading', { name: 'GitHub' })).toBeVisible();
  await page.getByRole('button', { name: 'Open workspace navigation' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Works' }).click();
  await page.getByRole('button', { name: 'New work' }).click();
  await page.getByRole('menuitem', { name: 'Slides' }).click();
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
  await openWorksFromEditor(page);
  await expect(page.locator('[data-work-kind="slides"]')).toHaveCount(1);
  await expect(page.locator('[data-work-kind="canvas"]')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search works' }).fill('missing');
  await expect(page.getByText('No works here yet.')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search works' }).fill('Slides');
  await expect(page.locator('[data-work-kind="canvas"]')).toHaveCount(0);
  await page.locator('[data-work-kind="slides"]').getByRole('button', { name: /^Open / }).click();
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
});

test('keeps local works available on a legacy cloud-scoped route', async ({ page }) => {
  await page.goto('/workspace?scope=cloud');
  await expect(page.getByRole('table', { name: 'My workspace' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
  await expect(page.locator('[data-work-kind="canvas"]')).toHaveCount(1);
});

test('uses the sidebar for account settings without changing the works table', async ({ page }) => {
  await page.goto('/workspace');
  const navigation = page.getByRole('navigation', { name: 'Workspace navigation' });
  await navigation.getByRole('button', { name: 'Account settings' }).click();
  await expect(page).toHaveURL(/\/workspace\?view=account$/);
  await expect(page.getByRole('heading', { name: 'GitHub' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'My workspace' })).toHaveCount(0);
  await navigation.getByRole('button', { name: 'Works' }).click();
  await expect(page.getByRole('table', { name: 'My workspace' })).toBeVisible();
  await expect(page.locator('[data-work-kind="canvas"]')).toHaveCount(1);
});
