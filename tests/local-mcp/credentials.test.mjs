import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCredentials, PAIRING_LIFETIME } from './credentials.mjs';

test('credentials survive restart without extending expiry; expired or invalid credentials rotate', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chardesk-pairing-'));
  const file = join(dir, 'credentials');
  try {
    const now = Date.now();
    const first = await loadCredentials(file, now);
    assert.equal(first.expiresAt, now + PAIRING_LIFETIME);
    assert.deepEqual(await loadCredentials(file, now + 1000), first);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    const next = await loadCredentials(file, first.expiresAt);
    assert.notEqual(next.token, first.token);
    await writeFile(file, 'null');
    assert.notEqual((await loadCredentials(file)).token, next.token);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
