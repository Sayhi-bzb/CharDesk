import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const apiOrigin = 'http://127.0.0.1:1234';
const workId = '11111111-1111-4111-8111-111111111111';
const conflictId = '22222222-2222-4222-8222-222222222222';
const documentSource = (body: string) =>
  `---\nchardesk: document/v1\nmode: freeform\ntitle: Cross-device sketch\n---\n${body}`;

async function openWorkspace(page: Page) {
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('menuitem', { name: 'Account' }).click();
  await page.getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('button', { name: 'Works' }).click();
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

test('syncs Blackboard source files and preserves concurrent edits as copies', async ({ browser, baseURL }) => {
  const boardId = '33333333-3333-4333-8333-333333333333';
  const forkId = '44444444-4444-4444-8444-444444444444';
  const manifest = 'chardesk: blackboard/v1\ntitle: Board\npanels:\n  welcome:\n    source: panels/welcome.panel\nlayout:\n  areas:\n    - [welcome]\n';
  const source = (panel: string) => JSON.stringify({ chardesk: 'blackboard/source-v1', files: [
    { path: 'blackboard.yaml', content: manifest }, { path: 'panels/welcome.panel', content: panel },
  ] });
  const cloudWorks = new Map([[boardId, { id: boardId, kind: 'blackboard', title: 'Board',
    content: source('First'), revision: 1, conflictWith: null as string | null }]]);
  const installApi = async (context: BrowserContext) => context.route(`${apiOrigin}/v1/account/**`, async (route) => {
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
    })), limits: { maxWorkBytes: 10_485_760, maxAccountBytes: 104_857_600, usedBytes: 0 } });
    if (path === '/v1/account/works/backups' && request.method() === 'POST') {
      const body = request.postDataJSON() as { title: string; content: string; conflictWith: string };
      cloudWorks.set(forkId, { id: forkId, kind: 'blackboard', title: body.title,
        content: body.content, revision: 1, conflictWith: body.conflictWith });
      return fulfill(201, { work: { ...cloudWorks.get(forkId), content: undefined, contentStatus: 'uploaded' } });
    }
    const id = /^\/v1\/account\/works\/([\da-f-]+)\/content$/.exec(path)?.[1];
    const target = id && cloudWorks.get(id);
    if (target && request.method() === 'GET') return fulfill(200, target);
    if (target && request.method() === 'PUT') {
      const body = request.postDataJSON() as { expectedRevision: number; content: string };
      if (body.expectedRevision !== target.revision) return fulfill(409, { error: 'conflict' });
      target.content = body.content;
      target.revision += 1;
      return fulfill(200, { work: { id: target.id, revision: target.revision } });
    }
    return fulfill(404, { error: 'Not found' });
  });
  const contexts = await Promise.all([browser.newContext({ baseURL }), browser.newContext({ baseURL })]);
  try {
    await Promise.all(contexts.map(installApi));
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    for (const page of pages) {
      await page.goto('/workspace');
      await expect(page.locator('[data-work-source="cloud"][data-work-kind="blackboard"]')).toHaveCount(1);
      await page.getByRole('button', { name: 'Open Board' }).click();
      await openWorkspace(page);
      await expect(page.locator('[data-work-source="local"][data-work-kind="blackboard"]'))
        .toContainText('This browser + cloud');
    }
    const readPanel = (page: Page) => page.evaluate(async () => {
      const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
      const repository = getApplicationEditorHost().blackboard.repository;
      const [item] = await repository.listWorkspaces();
      return (await repository.readWorkspace(item.id))?.files.find((file) => file.path === 'panels/welcome.panel')?.content;
    });
    const second = pages[1];
    cloudWorks.get(boardId)!.content = source('Remote');
    cloudWorks.get(boardId)!.revision += 1;
    await second.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => readPanel(second)).toBe('Remote');
    await second.evaluate(async () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      const { getApplicationEditorHost } = await import('../src/app/compositionRoot.ts');
      const repository = getApplicationEditorHost().blackboard.repository;
      const [item] = await repository.listWorkspaces();
      await repository.apply(item.id, [{ op: 'write', path: 'panels/welcome.panel', content: 'Local' }]);
    });
    cloudWorks.get(boardId)!.content = source('Other device');
    cloudWorks.get(boardId)!.revision += 1;
    await second.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      window.dispatchEvent(new Event('online'));
    });
    await expect.poll(() => cloudWorks.get(forkId)?.conflictWith).toBe(boardId);
    expect(await readPanel(second)).toBe('Local');
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
