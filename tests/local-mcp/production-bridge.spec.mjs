import { test, expect } from '@playwright/test';
import { fixture, freePort, waitFor } from '../../packages/mcp/test/fixture.mjs';

test('production adapters discover, edit, reconnect and share a real Canvas page', async ({ page, baseURL }) => {
  test.setTimeout(45_000);
  const cleanup = [];
  const f = await fixture({ after: (callback) => cleanup.push(callback) }, { start: false, port: await freePort() });
  f.config.origins = [baseURL];
  f.env.CHARDESK_MCP_ORIGINS = baseURL;
  try {
    const first = await f.client();
    await waitFor(() => f.running());
    // Route only the fixed discovery address to this test's isolated broker.
    // The actual discovery handler, page WebSocket, stdio and HTTP calls run unchanged.
    await page.route('http://127.0.0.1:9494/discover', async (route) => {
      const running = await f.running();
      const response = await fetch(`${running.baseUrl}/discover`, { headers: { origin: baseURL } });
      await route.fulfill({ status: response.status, body: await response.text(), headers: {
        'content-type': 'application/json', 'access-control-allow-origin': baseURL,
      } });
    });
    await page.goto('/');
    await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
    await expect.poll(async () => (await f.health()).pageReady).toBe(true);
    const call = (client, name, input) => client.callTool({ name, arguments: input });
    const created = await call(first, 'canvas_manage', { action: 'create', name: 'MCP lifecycle verification' });
    expect(created.isError, JSON.stringify(created)).toBe(false);
    const canvasId = created.structuredContent.canvasId;
    const written = await call(first, 'canvas_write', { canvasId, at: [0, 0], content: 'Independent bridge 架构' });
    expect(written.isError, JSON.stringify(written)).toBe(false);
    expect(written.structuredContent.persistence).toBe('saved');
    const second = await f.client();
    await first.close();
    expect((await f.health()).pageReady).toBe(true);
    const read = () => call(second, 'canvas_read', { canvasId, viewport: [0, 0, 40, 2] });
    expect((await read()).structuredContent.content).toContain('Independent bridge 架构');
    await page.reload();
    await expect.poll(async () => (await f.health()).pageReady).toBe(true);
    expect((await read()).structuredContent.content).toContain('Independent bridge 架构');

    const old = await f.running();
    process.kill(old.health.pid, 'SIGKILL');
    await read(); // Starts a replacement; does not replay a write.
    await expect.poll(async () => (await f.health()).pageReady, { timeout: 15_000 }).toBe(true);
    expect((await f.health()).instanceId).not.toBe(old.health.instanceId);
    expect((await read()).structuredContent.content).toContain('Independent bridge 架构');
    expect((await f.health()).activeRequests).toBe(0);
    expect((await f.health()).activeCallers).toBe(0);
    await call(second, 'canvas_manage', { action: 'archive', canvasId });
  } finally {
    await page.goto('about:blank');
    for (const callback of cleanup.reverse()) await callback();
  }
});
