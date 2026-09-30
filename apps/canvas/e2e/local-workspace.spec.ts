import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function openWorksFromEditor(page: Page) {
  await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('menuitem', { name: 'Account' }).locator('svg')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Account' }).click();
  await expect(page).toHaveURL(/\/workspace\?view=account$/);
  await expect(page.getByRole('dialog', { name: 'Sign in to CharDesk' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/workspace$/);
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

test('converts legacy works once, keeps source backups, and preserves native edits', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('chardesk-blackboard-workspaces', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('workspaces', { keyPath: 'id' });
        request.result.createObjectStore('files', { keyPath: ['workspaceId', 'path'] })
          .createIndex('by-workspace', 'workspaceId');
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(['workspaces', 'files'], 'readwrite');
        transaction.objectStore('workspaces').put({ id: 'retired-board', title: 'Research board', revision: 1, createdAt: 1, updatedAt: 1 });
        transaction.objectStore('files').put({ workspaceId: 'retired-board', path: 'blackboard.yaml',
          content: 'chardesk: blackboard/v1\npanels:\n  main: { source: main.panel }\nlayout:\n  areas: [[main]]' });
        transaction.objectStore('files').put({ workspaceId: 'retired-board', path: 'main.panel', content: 'Original' });
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
  await page.goto('/workspace');
  await page.getByRole('button', { name: 'New work' }).click();
  await expect(page.getByRole('menuitem', { name: 'Blackboard' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  const legacy = page.locator('[data-work-kind="retired"]');
  await expect(legacy).toHaveCount(1);
  await legacy.getByRole('button', { name: 'Open Research board' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
  const sessionId = await page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    const canvas = getApplicationEditorHost().canvas;
    await canvas.ready;
    const id = canvas.getState().activeCanvasId;
    canvas.commands.text.writeAt('Edited', { x: 0, y: 0 });
    await canvas.flushPersistence(id);
    return id;
  });
  await page.goto('/blackboard?workspace=retired-board');
  await expect(page).toHaveURL(/\/$/);
  await expect.poll(() => page.evaluate(async (id) => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    const canvas = getApplicationEditorHost().canvas;
    return (await canvas.materializeSession(id))?.surface.getCell({ x: 0, y: 0 })?.char;
  }, sessionId)).toBe('E');
  await openWorksFromEditor(page);
  await expect(page.locator('[data-work-kind="retired"]')).toHaveCount(0);
  const native = page.locator('[data-work-source="local"]', { hasText: 'Research board' });
  await expect(native).toHaveCount(1);
  await native.getByRole('button', { name: /Actions for/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download original source' }).click();
  expect((await download).suggestedFilename()).toBe('source-backup.zip');
});

test('searches table rows on a narrow direct workspace route', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/workspace');
  await expect(page.getByTestId('local-workspace')).toBeVisible();
  await page.getByRole('button', { name: 'Open workspace navigation' }).click();
  await expect(page.getByRole('dialog').getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();
  await page.getByRole('dialog', { name: 'My workspace' }).getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('dialog', { name: 'Sign in to CharDesk' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open workspace navigation' })).toBeFocused();
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

test('opens account from the sidebar footer without replacing the works table', async ({ page }) => {
  await page.goto('/workspace');
  const navigation = page.getByRole('navigation', { name: 'Workspace navigation' });
  await expect(navigation.getByRole('button', { name: 'Works' })).toHaveAttribute('aria-current', 'page');
  await page.locator('aside footer').getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/workspace\?view=account$/);
  await expect(page.getByRole('dialog', { name: 'Sign in to CharDesk' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('dialog', { name: 'Sign in to CharDesk' })).toHaveCount(0);
  await page.goForward();
  await expect(page.getByRole('dialog', { name: 'Sign in to CharDesk' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.locator('aside footer').getByRole('button', { name: 'Sign in' })).toBeFocused();
  await expect(page.getByRole('table', { name: 'My workspace' })).toBeVisible();
  await expect(page.locator('[data-work-kind="canvas"]')).toHaveCount(1);
});

test('starts GitHub OAuth only from the account dialog', async ({ page, baseURL }) => {
  const apiOrigin = 'http://127.0.0.1:1234';
  await page.route(`${apiOrigin}/v1/account/me`, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': baseURL!, 'Access-Control-Allow-Credentials': 'true' },
    body: JSON.stringify({ user: null }),
  }));
  await page.route(`${apiOrigin}/v1/account/login`, (route) => route.fulfill({
    status: 200, contentType: 'text/html', body: 'OAuth entry',
  }));
  await page.goto('/workspace');
  const footer = page.locator('aside footer');
  await footer.getByRole('button', { name: 'Sign in' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in to CharDesk' });
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Sign in with GitHub' }).click();
  await expect(page).toHaveURL(`${apiOrigin}/v1/account/login`);
});

test('shows account details on OAuth return and signs out in place', async ({ page, baseURL }) => {
  const apiOrigin = 'http://127.0.0.1:1234';
  const headers = { 'Access-Control-Allow-Origin': baseURL!, 'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  await page.route(`${apiOrigin}/v1/account/me`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', headers,
    body: JSON.stringify({ user: { id: 'github:17', login: 'maker', avatarUrl: null } }),
  }));
  await page.route(`${apiOrigin}/v1/account/works`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', headers,
    body: JSON.stringify({ works: [], limits: { maxWorkBytes: 10485760, maxAccountBytes: 104857600, usedBytes: 0 } }),
  }));
  await page.route(`${apiOrigin}/v1/account/logout`, (route) => route.fulfill({
    status: route.request().method() === 'OPTIONS' ? 204 : 200,
    contentType: 'application/json', headers, body: JSON.stringify({ ok: true }),
  }));
  await page.goto('/workspace?view=account');
  const dialog = page.getByRole('dialog', { name: 'Account' });
  await expect(dialog.getByText('maker')).toBeVisible();
  await expect(dialog.getByText('0 of 100 MiB used · 10 MiB per backup')).toBeVisible();
  await expect(page.locator('aside footer button')).toContainText('maker');
  await dialog.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('dialog', { name: 'Sign in to CharDesk' })).toBeVisible();
  await expect(page.locator('aside footer button')).toContainText('Sign in');
});

test('offers Google sign-in and explicit linking from the same account card', async ({ page, baseURL }) => {
  const apiOrigin = 'http://127.0.0.1:1234';
  const headers = { 'Access-Control-Allow-Origin': baseURL!, 'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  let signedIn = false;
  await page.route(`${apiOrigin}/v1/account/me`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', headers,
    body: JSON.stringify({ user: signedIn ? { id: 'github:17', login: 'maker', avatarUrl: null } : null,
      availableProviders: ['github', 'google'], linkedProviders: signedIn ? ['github'] : [] }),
  }));
  await page.route(`${apiOrigin}/v1/account/works`, (route) => route.fulfill({
    status: 200, contentType: 'application/json', headers,
    body: JSON.stringify({ works: [], limits: { maxWorkBytes: 10485760, maxAccountBytes: 104857600, usedBytes: 0 } }),
  }));
  await page.route(`${apiOrigin}/v1/account/google/login`, (route) => route.fulfill({
    status: 200, contentType: 'text/html', body: 'Google OAuth entry',
  }));
  await page.goto('/workspace?view=account');
  await page.getByRole('dialog', { name: 'Sign in to CharDesk' }).getByRole('button', { name: 'Sign in with Google' }).click();
  await expect(page).toHaveURL(`${apiOrigin}/v1/account/google/login`);

  signedIn = true;
  await page.goto('/workspace?view=account');
  const account = page.getByRole('dialog', { name: 'Account' });
  await expect(account.getByText('Connected: GitHub')).toBeVisible();
  await expect(account.getByRole('button', { name: 'Connect Google' })).toBeVisible();
});
