import { randomUUID, createHash } from 'node:crypto';
import { link, open, rename, unlink } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';

export const sourceDigest = (source: string | Uint8Array | null) =>
  source === null ? null : createHash('sha256').update(source).digest('hex');

export async function syncDirectory(path: string) {
  if (process.platform === 'win32') return;
  const directory = await open(path, 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export async function atomicWrite(
  path: string,
  content: string | Uint8Array,
  beforeCommit?: () => Promise<void>,
  mode = 0o600,
  replace = true
) {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    const file = await open(temporary, 'wx', mode);
    try {
      await file.writeFile(content, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await beforeCommit?.();
    if (replace) await rename(temporary, path);
    else await link(temporary, path); // atomic no-clobber publication, including symlinks
    await syncDirectory(dirname(path));
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
