import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const apiOrigin = 'http://127.0.0.1:1234';
const workId = '11111111-1111-4111-8111-111111111111';
const conflictId = '22222222-2222-4222-8222-222222222222';
const documentSource = (body: string) =>
  `---\nchardesk: document/v1\nmode: freeform\ntitle: Cross-device sketch\n---\n${body}`;

async function openWorkspace(page: Page) {
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: 'Account' }).click();
  await expect(page.getByRole('dialog', { name: 'Account' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('table', { name: 'My workspace' })).toBeVisible();
}

async function currentSource(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
    const { prepareTextExport } = await import('../src/domains/export/public.ts');
    const canvas = getApplicationEditorHost().canvas;
    const session = canvas.getState().canvasSessions.find((item) => item.id === canvas.getState().activeCanvasId);
    if (!session) return null;
    const materialized = await canvas.materializeSession(session.id);
    if (!materialized) return null;
    const result = prepareTextExport({ canvasMode: materialized.mode, surface: materialized.surface,
      slideDeck: materialized.slideDeck, documentName: materialized.name,
      includeColor: true, showGrid: false }, 'chardesk');
    return result.ok ? result.value.content : null;
  });
}

test('discovers, pulls, and preserves offline conflicts across two browsers', async ({ browser, baseURL }) => {
  const cloudWorks = new Map([[workId, { id: workId, kind: 'canvas', title: 'Cross-device sketch',
    content: documentSource('A'), revision: 1, conflictWith: null as string | null }]]);
  let pushes = 0;
  const installApi = async (context: BrowserContext) => {
    await context.route(`${apiOrigin}/v1/account/**`, async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const headers = { 'Access-Control-Allow-Origin': baseURL!, 'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Content-Type': 'application/json' };
      const fulfill = (status: number, body: unknown) => route.fulfill({ status, headers, body: JSON.stringify(body) });
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (path === '/v1/account/me') return fulfill(200, { user: { id: 'github:17', login: 'maker', avatarUrl: null } });
      if (path === '/v1/account/works') return fulfill(200, { works: [...cloudWorks.values()].map((work) => ({
        ...work, content: undefined, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
        contentStatus: 'uploaded', contentBytes: work.content.length,
      })), limits: { maxWorkBytes: 10_485_760, maxAccountBytes: 104_857_600,
        usedBytes: [...cloudWorks.values()].reduce((sum, work) => sum + work.content.length, 0) } });
      if (path === '/v1/account/works/backups' && request.method() === 'POST') {
        const body = request.postDataJSON() as { title: string; content: string; conflictWith: string };
        cloudWorks.set(conflictId, { id: conflictId, kind: 'canvas', title: body.title,
          content: body.content, revision: 1, conflictWith: body.conflictWith });
        return fulfill(201, { work: { ...cloudWorks.get(conflictId), content: undefined,
          contentStatus: 'uploaded', contentBytes: body.content.length } });
      }
      const contentId = /^\/v1\/account\/works\/([\da-f-]+)\/content$/.exec(path)?.[1];
      const target = contentId && cloudWorks.get(contentId);
      if (target && request.method() === 'GET') {
        return fulfill(200, { title: target.title, content: target.content, revision: target.revision });
      }
      if (target && request.method() === 'PUT') {
        pushes += 1;
        const body = request.postDataJSON() as { expectedRevision: number; content: string };
        if (body.expectedRevision !== target.revision) return fulfill(409, { error: 'conflict' });
        target.content = body.content;
        target.revision += 1;
        return fulfill(200, { work: { id: target.id, revision: target.revision } });
      }
      return fulfill(404, { error: 'Not found' });
    });
  };
  const first = await browser.newContext({ baseURL });
  const second = await browser.newContext({ baseURL });
  try {
    await Promise.all([installApi(first), installApi(second)]);
    const pageA = await first.newPage();
    const pageB = await second.newPage();
    await pageA.goto('/workspace');
    await pageB.goto('/workspace');
    for (const page of [pageA, pageB]) {
      await expect(page.locator('[data-work-source="cloud"]')).toHaveCount(1);
      await page.getByRole('button', { name: 'Open Cross-device sketch' }).click();
      await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
      await openWorkspace(page);
      await expect(page.locator('[data-work-source="cloud"]')).toHaveCount(0);
      await expect(page.locator('[data-work-source="local"]', { hasText: 'Cross-device sketch' }))
        .toContainText('This browser + cloud');
    }
    expect(pushes).toBe(0);
    const original = cloudWorks.get(workId)!;
    original.content = documentSource('B');
    original.revision += 1;
    await pageB.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => currentSource(pageB)).toContain('B');
    expect(pushes).toBe(0);

    await pageB.locator('[data-work-source="local"]', { hasText: 'Cross-device sketch' })
      .getByRole('button', { name: /Open Cross-device sketch/ }).click();
    await expect(pageB.getByTestId('canvas-editor-surface')).toBeVisible();
    await pageB.evaluate(async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
      const canvas = getApplicationEditorHost().canvas;
      canvas.commands.sessions.replaceSnapshot(canvas.getState().activeCanvasId,
        { mode: 'freeform', grid: [['0,0', { char: 'L', color: '#000000' }]] },
        { preserveViewport: true, resetHistory: true });
    });
    await expect.poll(() => currentSource(pageB)).toContain('L');
    original.content = documentSource('C');
    original.revision += 1;
    await pageB.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      window.dispatchEvent(new Event('online'));
    });
    await openWorkspace(pageB);
    await expect(pageB.locator('[data-work-source="local"]', { hasText: 'Cross-device sketch' }))
      .toContainText('Conflict copy saved');
    await expect.poll(() => cloudWorks.get(conflictId)?.conflictWith).toBe(workId);
    const row = pageB.locator('[data-work-source="local"]', { hasText: 'Cross-device sketch' });
    await row.getByRole('button', { name: 'Actions for Cross-device sketch' }).click();
    await pageB.getByRole('menuitem', { name: 'Review versions' }).click();
    const dialog = pageB.getByRole('dialog', { name: 'Two versions are saved' });
    await expect(dialog).toContainText('Other cloud copy: Cross-device sketch');
    await dialog.getByRole('button', { name: 'Open other copy' }).click();
    await expect(pageB.getByTestId('canvas-editor-surface')).toBeVisible();
    await expect.poll(() => currentSource(pageB)).toContain('C');
    await openWorkspace(pageB);
    await expect(pageB.locator('[data-work-source="local"]', { hasText: 'Cross-device sketch' })).toHaveCount(2);
  } finally {
    await first.close();
    await second.close();
  }
});

test('converts a cloud Blackboard under its existing identity and exposes its source archive', async ({ page, baseURL }) => {
  const id = '33333333-3333-4333-8333-333333333333';
  const source = JSON.stringify({ chardesk: 'blackboard/source-v1', files: [
    { path: 'blackboard.yaml', content: 'chardesk: blackboard/v1\npanels:\n  main: { source: main.panel }\nlayout:\n  areas: [[main]]' },
    { path: 'main.panel', content: 'Cloud original' },
  ] });
  let content = source;
  let kind = 'blackboard';
  let revision = 1;
  let migrations = 0;
  const work = () => ({ id, title: 'Cloud board', kind, revision, createdAt: '2026-01-01', updatedAt: '2026-01-01',
    contentStatus: 'uploaded', contentBytes: content.length, conflictWith: null, hasSourceBackup: migrations > 0 });
  await page.route(`${apiOrigin}/v1/account/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = { 'Access-Control-Allow-Origin': baseURL!, 'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS' };
    const respond = (status: number, body: unknown) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path.endsWith('/me')) return respond(200, { user: { id: 'github:17', login: 'maker', avatarUrl: null } });
    if (path.endsWith('/works')) return respond(200, { works: [work()], limits: { maxWorkBytes: 10485760, maxAccountBytes: 104857600, usedBytes: content.length + (migrations ? source.length : 0) } });
    if (path.endsWith('/source-backup')) return respond(200, { content: source, revision: 1 });
    if (path.endsWith('/migrate')) {
      const input = request.postDataJSON();
      expect(input.expectedRevision).toBe(1);
      expect(input.kind).toBe('canvas');
      expect(input.content).toContain('Cloud original');
      content = input.content;
      kind = 'canvas';
      revision = 2;
      migrations += 1;
      return respond(200, { work: work() });
    }
    if (path.endsWith('/content') && request.method() === 'GET') return respond(200, { title: 'Cloud board', content, revision });
    return respond(404, {});
  });
  await page.goto('/workspace');
  await expect(page.locator('[data-work-source="cloud"][data-work-kind="retired"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Open Cloud board' }).click();
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
  expect(migrations).toBe(1);
  await openWorkspace(page);
  const local = page.locator('[data-work-source="local"]', { hasText: 'Cloud board' });
  await expect(local).toHaveCount(1);
  await expect(local).toContainText('This browser + cloud');
  await local.getByRole('button', { name: 'Open Cloud board' }).click();
  await openWorkspace(page);
  expect(migrations).toBe(1);
  await local.getByRole('button', { name: /Actions for/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download original source' }).click();
  expect((await download).suggestedFilename()).toBe('source-backup.zip');
});
