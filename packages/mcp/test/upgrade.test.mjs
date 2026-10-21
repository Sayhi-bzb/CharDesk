import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BrokerConnection, inspectBroker } from '../src/bootstrap.mjs';
import { requestJson } from '../src/http.mjs';
import { MCP_VERSION } from '../src/version.mjs';
import { stopBroker } from '../src/upgrade.mjs';
import { fixture, freePort, waitFor } from './fixture.mjs';

test('concurrent upgrades drain the old bridge and elect one replacement', { timeout: 15_000 }, async (t) => {
  const f = await fixture(t, { version: '0.0.1' });
  const old = await inspectBroker(f.config, { control: true });
  const page = await f.page({ reply: null, control: true });
  const pending = requestJson(`${old.baseUrl}/agent/call`, { method: 'POST', headers: old.headers,
    body: { clientId: '11111111-1111-1111-1111-111111111111', name: 'canvas_write', input: { at: [0, 0], content: 'A' } } });
  await waitFor(() => page.calls.length === 1);
  const adapters = Array.from({ length: 8 }, () => f.raw());
  const initialized = Promise.all(adapters.map((adapter) => adapter.initialize()));
  await waitFor(() => f.broker.status().state === 'stopping');
  page.respond(page.calls[0], { ok: true, persistence: 'saved' });
  await initialized;
  assert.equal((await pending).body.result.persistence, 'saved');
  await waitFor(() => adapters.every((adapter) => adapter.stderr.includes('mcp.bridge_ready')));
  const current = await f.running();
  assert.equal(current.health.version, MCP_VERSION);
  assert.notEqual(current.health.instanceId, old.health.instanceId);
  for (const adapter of adapters) {
    assert.ok(adapter.stderr.includes(current.health.instanceId), adapter.stderr);
    assert.doesNotMatch(adapter.stderr, /bridge_upgrade_blocked|bridge_incompatible/);
  }
  const reconnected = await f.page();
  assert.equal((await f.call('canvas_read', {})).status, 200);
  assert.equal(reconnected.calls.length, 1);
  const staleStop = await requestJson(`${current.baseUrl}/shutdown`, { method: 'POST', headers: {
    ...old.headers, 'x-chardesk-instance-id': old.health.instanceId,
  } });
  assert.equal(staleStop.status, 409);
  assert.equal((await f.health()).instanceId, current.health.instanceId);
});

test('older adapters reuse a newer compatible bridge without downgrading it', async (t) => {
  const f = await fixture(t, { version: '99.0.0' });
  const before = await f.running();
  await f.page();
  const client = await f.client();
  assert.equal((await client.callTool({ name: 'canvas_read', arguments: {} })).isError, false);
  assert.equal((await f.health()).instanceId, before.health.instanceId);
});

test('bridge upgrade CLI uses the same automatic handoff and exits', async (t) => {
  const f = await fixture(t, { version: '0.0.1' });
  const previous = f.broker.status().instanceId;
  const upgrade = f.raw(['bridge', 'upgrade']);
  await waitFor(() => upgrade.exit);
  assert.equal(upgrade.exit.code, 0, upgrade.stderr);
  const status = JSON.parse(upgrade.stdout);
  assert.notEqual(status.instanceId, previous);
  assert.equal(status.version, MCP_VERSION);
  assert.equal((await f.health()).instanceId, status.instanceId);
});

test('a bridge that cannot drain returns execution_unknown and never replays its write', async (t) => {
  const f = await fixture(t, { version: '0.0.1' });
  const old = await inspectBroker(f.config, { control: true });
  const page = await f.page({ reply: null, control: true });
  const pending = requestJson(`${old.baseUrl}/agent/call`, { method: 'POST', headers: old.headers,
    body: { clientId: '11111111-1111-1111-1111-111111111111', name: 'canvas_write', input: { at: [0, 0], content: 'A' } } });
  await waitFor(() => page.calls.length === 1);
  await new BrokerConnection(f.config, new AbortController().signal).ensure();
  assert.equal((await pending).body.error.code, 'execution_unknown');
  const reconnected = await f.page();
  assert.equal(reconnected.calls.length, 0);
});

const legacyFixture = async (t) => {
  const f = await fixture(t, { start: false, port: await freePort() });
  const child = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/legacy-bridge.mjs', import.meta.url))], {
    env: f.env, stdio: ['ignore', 'ignore', 'pipe'],
  });
  let exit;
  let stderr = '';
  child.stderr.on('data', (data) => { stderr += data; });
  child.on('exit', (code, signal) => { exit = { code, signal }; });
  t.after(async () => {
    if (!exit) child.kill('SIGTERM');
    await waitFor(() => exit);
  });
  await waitFor(async () => {
    assert.ok(!exit, stderr);
    return inspectBroker(f.config, { control: true }).catch(() => null);
  });
  return { f, child, exited: () => exit };
};

test('legacy owner processes are authenticated and retired before concurrent replacement', {
  skip: !['darwin', 'linux'].includes(process.platform), timeout: 15_000,
}, async (t) => {
  const { f, exited } = await legacyFixture(t);
  const adapters = Array.from({ length: 4 }, () => f.raw());
  await Promise.all(adapters.map((adapter) => adapter.initialize()));
  try { await waitFor(() => adapters.every((adapter) => adapter.stderr.includes('mcp.bridge_ready')), 10_000); }
  catch (error) { t.diagnostic(adapters.map((adapter) => adapter.stderr).join('\n')); throw error; }
  assert.equal(exited().code, 0);
  const current = await f.running();
  for (const adapter of adapters) assert.ok(adapter.stderr.includes(current.health.instanceId), adapter.stderr);
  await f.page();
  assert.equal((await f.call('canvas_read', {})).status, 200);
});

test('legacy takeover refuses stale metadata and mismatched credentials without terminating the owner', async (t) => {
  const { f, exited } = await legacyFixture(t);
  const saved = JSON.parse(await readFile(f.config.pairingFile, 'utf8'));
  for (const record of [
    { ...saved, pid: process.pid },
    { ...saved, bridgeUrl: saved.bridgeUrl.replace(/token=.+$/, `token=${'a'.repeat(64)}`) },
  ]) {
    await writeFile(f.config.pairingFile, JSON.stringify(record));
    await assert.rejects(stopBroker(await inspectBroker(f.config, { control: true }), f.config), { code: 'bridge_upgrade_blocked' });
    assert.equal(exited(), undefined);
  }
  await writeFile(f.config.pairingFile, JSON.stringify(saved));
  await chmod(f.config.pairingFile, 0o644);
  await assert.rejects(stopBroker(await inspectBroker(f.config, { control: true }), f.config), { code: 'bridge_upgrade_blocked' });
  assert.equal(exited(), undefined);
  await chmod(f.config.pairingFile, 0o600);
  const wrong = { ...saved, bridgeUrl: saved.bridgeUrl.replace(/token=.+$/, `token=${'a'.repeat(64)}`) };
  await writeFile(f.config.pairingFile, JSON.stringify(wrong));
  await writeFile(f.config.credentialsFile, JSON.stringify({ token: 'a'.repeat(64), expiresAt: saved.expiresAt }));
  await assert.rejects(stopBroker(await inspectBroker(f.config, { control: true }), f.config), { code: 'bridge_upgrade_blocked' });
  assert.equal(exited(), undefined);
});
