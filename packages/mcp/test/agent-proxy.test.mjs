import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { fixture, freePort, waitFor } from './fixture.mjs';
import { requestJson } from '../src/http.mjs';
import { inspectBroker } from '../src/bootstrap.mjs';

test('100 stdio sessions exit on stdin EOF without accumulating resources', { timeout: 60_000 }, async (t) => {
  const f = await fixture(t);
  await f.page();
  for (let i = 0; i < 100; i += 1) {
    const adapter = f.raw();
    await adapter.initialize();
    adapter.child.stdin.end();
    await waitFor(() => adapter.exit, 1500);
    assert.deepEqual(adapter.exit, { code: 0, signal: null }, adapter.stderr);
  }
  const health = await f.health();
  assert.equal(health.activeRequests, 0);
  assert.equal(health.activeCallers, 0);
  assert.equal(health.pageReady, true);
});

test('stdin EOF cancels a pending request without disrupting another Agent', async (t) => {
  const f = await fixture(t);
  const page = await f.page({ reply: null });
  const adapter = f.raw();
  await adapter.initialize();
  adapter.send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'canvas_read', arguments: {} } });
  await waitFor(() => page.calls.length === 1);
  adapter.child.stdin.end();
  await waitFor(() => adapter.exit, 1500);
  await waitFor(async () => (await f.health()).activeRequests === 0);
  const survivor = await f.client();
  const result = survivor.callTool({ name: 'canvas_read', arguments: {} });
  await waitFor(() => page.calls.length === 2);
  page.respond(page.calls[1], { ok: true, survived: true });
  assert.equal((await result).structuredContent.survived, true);
});

test('concurrent adapters automatically elect one independent broker', { timeout: 15_000 }, async (t) => {
  const f = await fixture(t, { start: false, port: await freePort() });
  const adapters = Array.from({ length: 8 }, () => f.raw());
  await Promise.all(adapters.map((adapter) => adapter.initialize()));
  await waitFor(() => adapters.every((adapter) => adapter.stderr.includes('mcp.bridge_ready')));
  const running = await f.running();
  for (const adapter of adapters) {
    assert.notEqual(running.health.pid, adapter.child.pid);
    const events = adapter.stderr.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
    assert.ok(events.some((event) => event.instanceId === running.health.instanceId));
    adapter.child.stdin.end();
  }
  await Promise.all(adapters.map((adapter) => waitFor(() => adapter.exit, 1500)));
  assert.equal((await f.health()).instanceId, running.health.instanceId);
  const saved = JSON.parse(await readFile(f.config.pairingFile, 'utf8'));
  assert.equal(saved.pid, running.health.pid);
  assert.equal((await stat(f.config.credentialsFile)).mode & 0o777, 0o600);
  assert.equal((await stat(f.config.pairingFile)).mode & 0o777, 0o600);
});

test('an incompatible bridge produces a tool error, not Transport closed', async (t) => {
  const port = await freePort();
  const old = createServer((_request, response) => response.end(JSON.stringify({ role: 'bridge', clients: 16 })));
  await new Promise((resolve) => old.listen(port, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => old.close(resolve)));
  const f = await fixture(t, { start: false, port });
  const client = await f.client();
  const result = await client.callTool({ name: 'canvas_manage', arguments: { action: 'list' } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /bridge_incompatible.*Upgrade/);
  assert.ok((await client.listTools()).tools.length);
});

test('bridge CLI reports status, refuses unauthenticated stops and stops its own broker', async (t) => {
  const f = await fixture(t);
  const status = f.raw(['bridge', 'status']);
  await waitFor(() => status.exit);
  assert.equal(JSON.parse(status.stdout).instanceId, (await f.health()).instanceId);
  const running = await f.running();
  assert.equal((await requestJson(`${running.baseUrl}/shutdown`, { method: 'POST' })).status, 403);
  const stop = f.raw(['bridge', 'stop']);
  await waitFor(() => stop.exit);
  assert.equal(stop.exit.code, 0);
  await f.broker.closed;
});

test('an adapter exits during startup even when the occupied port never replies', async (t) => {
  const port = await freePort();
  const stalled = createServer();
  await new Promise((resolve) => stalled.listen(port, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { stalled.close(resolve); stalled.closeAllConnections(); }));
  const f = await fixture(t, { start: false, port });
  const adapter = f.raw();
  await adapter.initialize();
  adapter.child.stdin.end();
  await waitFor(() => adapter.exit, 1500);
  assert.deepEqual(adapter.exit, { code: 0, signal: null });
  assert.doesNotMatch(adapter.stderr, /UnhandledPromiseRejection|uncaught/i);
});

test('an existing adapter restarts a crashed broker without replaying its write', { timeout: 15_000 }, async (t) => {
  const f = await fixture(t, { start: false, port: await freePort() });
  const client = await f.client();
  await waitFor(() => f.running());
  const page = await f.page({ reply: null });
  const before = await f.running();
  const pending = client.callTool({ name: 'canvas_write', arguments: { at: [0, 0], content: 'A' } });
  await waitFor(() => page.calls.length === 1);
  process.kill(before.health.pid, 'SIGKILL');
  const failed = await pending;
  assert.equal(failed.isError, true);
  assert.match(failed.content[0].text, /execution_unknown/);
  const recovery = await client.callTool({ name: 'canvas_read', arguments: {} });
  assert.match(recovery.content[0].text, /page_unavailable/);
  const after = await f.running();
  assert.notEqual(after.health.instanceId, before.health.instanceId);
  assert.equal(after.pairing.bridgeUrl, before.pairing.bridgeUrl);
  const reconnected = await f.page();
  assert.equal((await client.callTool({ name: 'canvas_read', arguments: {} })).isError, false);
  assert.equal(reconnected.calls.length, 1);
  assert.equal(reconnected.calls[0].params.name, 'canvas_read');
});

test('status/stop can manage an expired v2 bridge', async (t) => {
  const f = await fixture(t);
  const saved = JSON.parse(await readFile(f.config.pairingFile, 'utf8'));
  saved.expiresAt = 1;
  await writeFile(f.config.pairingFile, JSON.stringify(saved));
  await assert.rejects(inspectBroker(f.config), { code: 'pairing_expired' });
  const stop = f.raw(['bridge', 'stop']);
  await waitFor(() => stop.exit);
  assert.equal(stop.exit.code, 0, stop.stderr);
  await f.broker.closed;
});
