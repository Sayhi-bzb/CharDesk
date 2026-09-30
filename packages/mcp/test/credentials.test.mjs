import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCredentials, PAIRING_LIFETIME } from '../src/credentials.mjs';

test('credentials persist for 30 days and rotate after expiry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chardesk-mcp-'));
  try {
    const file = join(dir, 'credentials.json'); const now = Date.now();
    const first = await loadCredentials(file, now);
    assert.equal((await loadCredentials(file, now + 1_000)).token, first.token);
    const next = await loadCredentials(file, first.expiresAt);
    assert.notEqual(next.token, first.token);
    assert.equal(next.expiresAt, first.expiresAt + PAIRING_LIFETIME);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
