import { randomUUID, createHash } from 'node:crypto';
import { open, rename, unlink } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';

export const sourceDigest = (source: string | null) =>
  source === null ? null : createHash('sha256').update(source).digest('hex');

export async function atomicWrite(
  path: string,
  content: string,
  beforeCommit?: () => Promise<void>,
  mode = 0o600
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
    await rename(temporary, path);
    if (process.platform !== 'win32') {
      const directory = await open(dirname(path), 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    }
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
