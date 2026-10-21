import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fixture, waitFor } from './fixture.mjs';
import { requestJson } from '../src/http.mjs';
import { writeFile, readFile } from 'node:fs/promises';

const read = (f, options) => f.call('canvas_read', {}, options);

test('one browser serves independent HTTP callers and survives their disconnects', async (t) => {
  const f = await fixture(t);
  const page = await f.page({ reply: null });
  const first = read(f);
  const second = read(f);
  await waitFor(() => page.calls.length === 2);
  assert.notEqual(page.calls[0].id, page.calls[1].id);
  page.respond(page.calls[1], { ok: true, second: true });
  page.respond(page.calls[0], { ok: true, first: true });
  const results = await Promise.all([first, second]);
  assert.ok(results.every((result) => result.status === 200));
  assert.equal((await f.health()).activeCallers, 0);
});

test('per-caller and global request budgets release immediately on cancellation', async (t) => {
  const f = await fixture(t);
  const page = await f.page({ reply: null });
  const controllers = [];
  const pending = [];
  for (let caller = 0; caller < 4; caller += 1) {
    const clientId = randomUUID();
    for (let i = 0; i < 32; i += 1) {
      const controller = new AbortController();
      controllers.push(controller);
      pending.push(read(f, { clientId, signal: controller.signal }).catch((error) => error));
    }
    await waitFor(() => page.calls.length === (caller + 1) * 32);
    assert.equal((await read(f, { clientId })).body.error.code, 'bridge_busy');
  }
  assert.equal((await f.health()).activeRequests, 128);
  assert.equal((await read(f)).status, 429);
  for (const controller of controllers) controller.abort();
  await Promise.all(pending);
  await waitFor(async () => (await f.health()).activeRequests === 0);
  assert.equal((await f.health()).activeCallers, 0);
  // Late page replies must not recreate request records.
  for (const call of page.calls) page.respond(call, { ok: true });
  const recovered = read(f);
  await waitFor(() => page.calls.length === 129);
  page.respond(page.calls[128], { ok: true });
  assert.equal((await recovered).status, 200);
});

test('timeouts and page disconnects report unknown writes without replay', async (t) => {
  const f = await fixture(t, { timeoutFor: () => 100 });
  const page = await f.page({ reply: null });
  const result = await f.call('canvas_write', { at: [0, 0], content: 'A' });
  assert.equal(result.body.error.code, 'execution_unknown');
  assert.equal(page.calls.length, 1);
  assert.equal((await f.health()).activeRequests, 0);
  const timeout = await read(f);
  assert.equal(timeout.body.error.code, 'request_timeout');
  const pending = f.call('canvas_write', { at: [0, 0], content: 'B' });
  await waitFor(() => page.calls.length === 3);
  page.socket.terminate();
  assert.equal((await pending).body.error.code, 'execution_unknown');
  await f.page();
  assert.equal((await read(f)).status, 200);
  assert.equal(page.calls.length, 3);
});

test('idle brokers exit but an open page keeps the broker alive', async (t) => {
  const f = await fixture(t, { idleMs: 60 });
  const page = await f.page();
  await delay(120);
  assert.equal((await f.health()).pageReady, true);
  page.socket.terminate();
  await f.broker.closed;
});

test('page permissions and local HTTP authentication remain enforced', async (t) => {
  const f = await fixture(t);
  await f.page({ grant: { scope: 'canvas', canvasId: 'allowed', permissions: {
    inspect: true, read: true, search: true, write: false,
  } } });
  assert.equal((await read(f)).status, 200);
  assert.equal((await f.call('canvas_write', { at: [0, 0], content: 'A' })).body.error.code, 'permission_denied');
  assert.equal((await f.call('canvas_read', { canvasId: 'other' })).status, 403);
  assert.equal((await read(f, { headers: {} })).status, 403);
  const running = await f.running();
  assert.equal((await read(f, { headers: { ...running.headers, origin: 'http://127.0.0.1:5173' } })).status, 403);
  const discovery = await requestJson(`${running.baseUrl}/discover`, { headers: { origin: 'http://127.0.0.1:5173' } });
  assert.equal(new URL(discovery.body.bridgeUrl).search, '');
});

test('invalid requests and sourceRef failures do not retain request budgets', async (t) => {
  const f = await fixture(t);
  await f.page();
  const running = await f.running();
  for (const body of [null, [], { clientId: 'bad', name: 'canvas_read', input: {} }]) {
    const result = await requestJson(`${running.baseUrl}/agent/call`, { method: 'POST', headers: running.headers, body });
    assert.equal(result.status, 400);
  }
  const missing = await f.call('canvas_write', { at: [0, 0], sourceRef: `${f.directory}/absent.txt` });
  assert.equal(missing.body.error.code, 'invalid_request');
  const conflict = await f.call('canvas_write', { at: [0, 0], sourceRef: 'file', content: 'A' });
  assert.equal(conflict.status, 400);
  const directory = await f.call('canvas_write', { at: [0, 0], sourceRef: f.directory });
  assert.equal(directory.status, 400);
  const largeFile = `${f.directory}/large.txt`;
  await writeFile(largeFile, Buffer.alloc(1024 * 1024 + 1));
  const oversized = await f.call('canvas_write', { at: [0, 0], sourceRef: largeFile });
  assert.equal(oversized.status, 413);
  assert.equal((await f.health()).activeRequests, 0);
  assert.equal((await f.health()).activeCallers, 0);
});

test('revocation rotates credentials and clears pending callers', async (t) => {
  const f = await fixture(t);
  const page = await f.page({ reply: null });
  const old = await f.running();
  const pending = read(f);
  await waitFor(() => page.calls.length === 1);
  assert.equal((await requestJson(`${old.baseUrl}/revoke`, { method: 'POST', headers: old.headers })).status, 204);
  assert.equal((await pending).body.error.code, 'permission_denied');
  const next = await f.running();
  assert.notEqual(next.pairing.bridgeUrl, old.pairing.bridgeUrl);
  assert.equal((await read(f, { headers: old.headers })).status, 403);
  await waitFor(async () => !(await f.health()).pageConnected);
  await f.page();
  assert.equal((await read(f)).status, 200);
});

test('only the winning broker writes shared state and stop preserves a replacement record', async (t) => {
  const f = await fixture(t);
  const { startBroker } = await import('../src/broker.mjs');
  const original = await readFile(f.config.pairingFile, 'utf8');
  await assert.rejects(startBroker({ config: f.config }), { code: 'EADDRINUSE' });
  assert.equal(await readFile(f.config.pairingFile, 'utf8'), original);
  const replacement = { ...JSON.parse(original), instanceId: 'a-different-instance' };
  await writeFile(f.config.pairingFile, JSON.stringify(replacement));
  await f.broker.stop();
  assert.equal(JSON.parse(await readFile(f.config.pairingFile, 'utf8')).instanceId, replacement.instanceId);
});
