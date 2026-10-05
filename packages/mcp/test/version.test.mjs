import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkForUpdate, compareVersions, MCP_VERSION } from '../src/version.mjs';

test('uses the published package version for the MCP server version', () => {
  assert.match(MCP_VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal(compareVersions('0.5.5', MCP_VERSION), 1);
  assert.equal(compareVersions(MCP_VERSION, MCP_VERSION), 0);
  assert.equal(compareVersions('0.5.3', MCP_VERSION), -1);
});

test('checks npm in the background and caches the latest version', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-mcp-version-'));
  const cacheFile = join(directory, 'update-check.json');
  let calls = 0;
  try {
    const result = await checkForUpdate({
      cacheFile,
      now: 1000,
      fetchImpl: async () => { calls += 1; return { ok: true, json: async () => ({ version: '9.9.9' }) }; },
    });
    assert.equal(calls, 1);
    assert.equal(result.updateAvailable, true);
    assert.deepEqual(JSON.parse(await readFile(cacheFile, 'utf8')), { latestVersion: '9.9.9', checkedAt: 1000 });

    const cached = await checkForUpdate({ cacheFile, now: 1001, fetchImpl: async () => { calls += 1; throw new Error('must not fetch'); } });
    assert.equal(calls, 1);
    assert.equal(cached.cached, true);
    assert.equal(cached.latestVersion, '9.9.9');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('keeps a cached update notice when the registry is unavailable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-mcp-version-'));
  const cacheFile = join(directory, 'update-check.json');
  try {
    await writeFile(cacheFile, JSON.stringify({ latestVersion: '9.9.9', checkedAt: 1 }));
    const result = await checkForUpdate({ cacheFile, now: 1000, ttl: 1, fetchImpl: async () => { throw new Error('offline'); } });
    assert.equal(result.updateAvailable, true);
    assert.equal(result.latestVersion, '9.9.9');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
