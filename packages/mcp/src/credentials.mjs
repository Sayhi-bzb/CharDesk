import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const PAIRING_LIFETIME = 30 * 24 * 60 * 60 * 1000;
export async function writePrivateJson(file, value) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, file);
  } finally { await unlink(temporary).catch(() => undefined); }
}
export async function loadCredentials(file, now = Date.now()) {
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    if (saved && /^[a-f0-9]{64}$/.test(saved.token) && saved.expiresAt > now
      && saved.expiresAt <= now + PAIRING_LIFETIME) return saved;
  } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  const credentials = { token: randomBytes(32).toString('hex'), expiresAt: now + PAIRING_LIFETIME };
  await writePrivateJson(file, credentials);
  await chmod(file, 0o600);
  return credentials;
}
