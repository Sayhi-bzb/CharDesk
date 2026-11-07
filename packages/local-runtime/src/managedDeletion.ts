import { lstat, mkdir, open, realpath, link, rename, unlink } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { sourceDigest, syncDirectory } from './storage.ts';
import type { AppPaths } from './appPaths.ts';
import type { SessionDeletion } from './sessionCatalog.ts';

export type ManagedFileProof = {
  digest: string;
  dev: string;
  ino: string;
  birth: string;
  modified: string;
  size: string;
};
const identity = (info: BigIntStats) => ({
  dev: String(info.dev),
  ino: String(info.ino),
  birth: String(info.birthtimeNs),
  modified: String(info.mtimeNs),
  size: String(info.size),
});
const sameIdentity = (a: BigIntStats, b: BigIntStats) =>
  JSON.stringify(identity(a)) === JSON.stringify(identity(b));
export const sameManagedFile = (a: ManagedFileProof | null, b: ManagedFileProof | null) =>
  a === null || b === null
    ? a === b
    : (['digest', 'dev', 'ino', 'birth', 'modified', 'size'] as const).every(
        (key) => a[key] === b[key]
      );

/** A no-follow identity and byte snapshot, including malformed native files. */
export async function inspectManagedFile(path: string): Promise<ManagedFileProof | null> {
  const before = await lstat(path, { bigint: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!before) return null;
  if (!before.isFile() || before.isSymbolicLink())
    throw new Error(
      'Managed deletion requires a regular file; links and directories are preserved.'
    );
  const file = await open(path, 'r');
  try {
    if (!sameIdentity(before, await file.stat({ bigint: true })))
      throw new Error('File changed during inspection.');
    const content = await file.readFile();
    const after = await lstat(path, { bigint: true });
    if (
      !after.isFile() ||
      !sameIdentity(before, after) ||
      !sameIdentity(before, await file.stat({ bigint: true }))
    )
      throw new Error('File changed during inspection.');
    return { ...identity(before), digest: sourceDigest(content)! };
  } finally {
    await file.close();
  }
}

export function readManagedFileProof(raw: string | null): ManagedFileProof | null {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid deletion proof; files were preserved.');
  const proof = value as Record<string, unknown>;
  if (
    Object.keys(proof).sort().join(',') !== 'birth,dev,digest,ino,modified,size' ||
    typeof proof.digest !== 'string' ||
    !/^[a-f\d]{64}$/.test(proof.digest) ||
    !['dev', 'ino', 'birth', 'modified', 'size'].every(
      (key) => typeof proof[key] === 'string' && /^-?\d+$/.test(proof[key] as string)
    )
  )
    throw new Error('Invalid deletion proof; files were preserved.');
  return proof as ManagedFileProof;
}

export async function validateDeletionPaths(
  paths: AppPaths,
  entry: Pick<SessionDeletion, 'sessionId' | 'path' | 'stagedPath'>
) {
  const uuid = '[a-f\\d]{8}-[a-f\\d]{4}-[a-f\\d]{4}-[a-f\\d]{4}-[a-f\\d]{12}';
  const stage = join(paths.data, 'deletions');
  if (
    !new RegExp(`^${uuid}$`, 'i').test(entry.sessionId) ||
    entry.path !== join(paths.canvases, `${entry.sessionId}.chardesk`) ||
    dirname(entry.stagedPath) !== stage ||
    !new RegExp(`^${entry.sessionId}\\.${uuid}\\.chardesk$`, 'i').test(basename(entry.stagedPath))
  )
    throw new Error('Deletion paths are not managed canvas paths.');
  await mkdir(stage, { recursive: true, mode: 0o700 });
  if ((await realpath(paths.canvases)) !== paths.canvases || (await realpath(stage)) !== stage)
    throw new Error('Managed deletion directories changed; files were preserved.');
}

export async function stageManagedDeletion(entry: SessionDeletion) {
  const expected = readManagedFileProof(entry.proof);
  if (!sameManagedFile(await inspectManagedFile(entry.path), expected))
    throw new Error('Canvas file changed. Refresh and review removal again.');
  if (await inspectManagedFile(entry.stagedPath))
    throw new Error('Deletion staging path already exists.');
  if (!expected) return;
  await rename(entry.path, entry.stagedPath);
  await syncDirectory(dirname(entry.path));
  await syncDirectory(dirname(entry.stagedPath));
  if (!sameManagedFile(await inspectManagedFile(entry.stagedPath), expected))
    throw new Error('Canvas changed while moving; staged content was preserved.');
}

/** Startup/cancellation rolls back prepared deletion without clobbering a replacement. */
export async function restoreManagedDeletion(entry: SessionDeletion) {
  const expected = readManagedFileProof(entry.proof),
    staged = await inspectManagedFile(entry.stagedPath);
  if (!staged) return;
  if (!sameManagedFile(staged, expected))
    throw new Error(`Unrecognized staged content preserved at ${entry.stagedPath}`);
  const original = await inspectManagedFile(entry.path);
  if (original && !sameManagedFile(original, staged))
    throw new Error(`Both files preserved; recover ${entry.stagedPath} before retrying removal.`);
  if (!original) await link(entry.stagedPath, entry.path);
  await unlink(entry.stagedPath);
  await syncDirectory(dirname(entry.path));
  await syncDirectory(dirname(entry.stagedPath));
}

/** Only a committed, identified staging file can be unlinked. Never touch a replacement at path. */
export async function finishManagedDeletion(entry: SessionDeletion) {
  const staged = await inspectManagedFile(entry.stagedPath);
  if (staged) {
    if (!sameManagedFile(staged, readManagedFileProof(entry.proof)))
      throw new Error(`Unrecognized staged content preserved at ${entry.stagedPath}`);
    await unlink(entry.stagedPath);
    await syncDirectory(dirname(entry.stagedPath));
  }
}
