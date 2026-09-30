import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const PAIRING_LIFETIME = 30 * 24 * 60 * 60 * 1000;
export async function loadCredentials(file, now = Date.now()) {
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    if (saved && /^[a-f0-9]{64}$/.test(saved.token) && saved.expiresAt > now
      && saved.expiresAt <= now + PAIRING_LIFETIME) return saved;
  } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  const credentials = { token: randomBytes(32).toString('hex'), expiresAt: now + PAIRING_LIFETIME };
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(credentials), { mode: 0o600 });
  await chmod(file, 0o600);
  return credentials;
}
