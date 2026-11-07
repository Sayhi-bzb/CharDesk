import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveAppPaths } from './appPaths.ts';
import { LocalSessions } from './sessions.ts';
import { TerminalWorkspace } from './workspace.ts';
import { TerminalCanvas } from './model.ts';
import { LocalSessionCatalog } from './sessionCatalog.ts';
import { readOptional } from './document.ts';
import { parseCanvasDocument, serializeCanvasDocument } from '@chardesk/editor-core/documentText';
import {
  stageManagedDeletion,
  validateDeletionPaths,
  inspectManagedFile,
} from './managedDeletion.ts';
import { openLocalWorkspace } from './localWorkspace.ts';
import { parseOptions } from './options.ts';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-removal-'));
  const paths = resolveAppPaths({ environment: { CHARDESK_HOME: join(root, 'home') } });
  const sessions = await LocalSessions.open(paths),
    workspace = TerminalWorkspace.empty();
  await sessions.attach(workspace);
  return {
    root,
    paths,
    sessions,
    workspace,
    async dispose() {
      await sessions.dispose();
      workspace.dispose();
      await rm(root, { recursive: true, force: true });
    },
  };
}
function seed(text: string) {
  const model = new TerminalCanvas(text);
  try {
    return serializeCanvasDocument(model.documents.getDocumentDraft()!);
  } finally {
    model.dispose();
  }
}
async function prepared(f: Awaited<ReturnType<typeof fixture>>) {
  const file = await f.sessions.create();
  const record = f.sessions.forFile(file)!;
  const plan = await f.sessions.planRemoval(record.id, record.revision);
  await f.sessions.close(file);
  const entry = {
    sessionId: record.id,
    path: record.path,
    revision: record.revision,
    proof: JSON.stringify(plan.file!.proof),
    stagedPath: join(f.sessions.paths.data, 'deletions', `${record.id}.${randomUUID()}.chardesk`),
  };
  await validateDeletionPaths(f.sessions.paths, entry);
  return f.sessions.catalog.prepareDeletion(entry);
}

test('record removal saves local wide text but retains the file; reopening gets a new session identity', async () => {
  const f = await fixture();
  try {
    const file = await f.sessions.create(),
      record = f.sessions.forFile(file)!;
    f.workspace.model.commands.insert('🦀local');
    await f.sessions.removeRecord(record.id, record.revision);
    expect(f.workspace.files).toHaveLength(0);
    expect(f.sessions.catalog.get(record.id)).toBeNull();
    expect(f.sessions.catalog.wasRemoved(record.id)).toBe(true);
    const native = parseCanvasDocument((await readOptional(file.path))!).document;
    expect(new Map(native.pages[0]!.grid).get('0,0')?.char).toBe('🦀');
    await f.sessions.openPath(file.path);
    expect(f.sessions.forFile(f.workspace.active)!.id).not.toBe(record.id);
    expect(f.workspace.model.plane.get({ x: 0, y: 0 })?.char).toBe('🦀');
  } finally {
    await f.dispose();
  }
});

test('managed deletion removes only the confirmed file and record, then clears its durable journal', async () => {
  const f = await fixture();
  try {
    const file = await f.sessions.create(),
      record = f.sessions.forFile(file)!;
    const other = await f.sessions.createManaged('Keep');
    const plan = await f.sessions.planRemoval(record.id, record.revision);
    await f.sessions.deleteManaged(plan);
    expect(await readOptional(file.path)).toBeNull();
    expect(f.sessions.catalog.get(record.id)).toBeNull();
    expect(f.sessions.catalog.wasRemoved(record.id)).toBe(true);
    expect(f.sessions.catalog.deletions()).toEqual([]);
    expect(await readdir(join(f.sessions.paths.data, 'deletions'))).toEqual([]);
    expect(await readOptional(other.path)).not.toBeNull();
    expect(f.sessions.catalog.get(other.id)).not.toBeNull();
    expect(f.workspace.files).toHaveLength(0);
  } finally {
    await f.dispose();
  }
});

test('external files and managed-path symlinks cannot be file-deleted, while record removal remains available', async () => {
  const f = await fixture();
  try {
    const external = join(f.root, 'external.chardesk'),
      text = seed('External');
    await writeFile(external, text);
    await f.sessions.openPath(external);
    const record = f.sessions.forFile(f.workspace.active)!;
    const plan = await f.sessions.planRemoval(record.id, record.revision);
    expect(plan.file).toBeNull();
    await expect(
      f.sessions.deleteManaged({ ...plan, file: { proof: await inspectManagedFile(external) } })
    ).rejects.toThrow('managed');
    await f.sessions.removeRecord(record.id, record.revision);
    expect(await readFile(external, 'utf8')).toBe(text);
    const managed = await f.sessions.create(),
      owned = f.sessions.forFile(managed)!;
    await f.sessions.close(managed);
    await rm(managed.path);
    await symlink(external, managed.path);
    const linkPlan = await f.sessions.planRemoval(owned.id, owned.revision);
    expect(linkPlan.file).toBeNull();
    expect(linkPlan.fileUnavailable).toContain('links');
    await expect(
      f.sessions.deleteManaged({ ...linkPlan, file: { proof: await inspectManagedFile(external) } })
    ).rejects.toThrow('links');
    await f.sessions.removeRecord(owned.id, owned.revision);
    expect(await readFile(external, 'utf8')).toBe(text);
    expect(await readFile(managed.path, 'utf8')).toBe(text);
  } finally {
    await f.dispose();
  }
});

test('stale revisions, changed files and new local edits invalidate confirmation before closing or deleting', async () => {
  const f = await fixture();
  try {
    const file = await f.sessions.create(),
      record = f.sessions.forFile(file)!;
    const stale = await f.sessions.planRemoval(record.id, record.revision);
    const renamed = f.sessions.rename(record.id, 'Renamed', record.revision);
    await expect(f.sessions.deleteManaged(stale)).rejects.toThrow('changed');
    const changed = await f.sessions.planRemoval(renamed.id, renamed.revision);
    await writeFile(file.path, seed('Outside'));
    await expect(f.sessions.deleteManaged(changed)).rejects.toThrow('changed');
    expect(f.workspace.files).toContain(file);
    await f.workspace.reloadFile(file);
    const local = await f.sessions.planRemoval(renamed.id, renamed.revision);
    f.workspace.model.commands.insert('new local');
    await expect(f.sessions.deleteManaged(local)).rejects.toThrow('changed');
    expect(f.workspace.files).toContain(file);
    expect(f.sessions.catalog.get(record.id)).not.toBeNull();
    expect((await readOptional(file.path))!).toContain('new local');
  } finally {
    await f.dispose();
  }
});

test('cancellation and catalog failure preserve native data and session metadata', async () => {
  const f = await fixture();
  try {
    const file = await f.sessions.create(),
      record = f.sessions.forFile(file)!;
    const plan = await f.sessions.planRemoval(record.id, record.revision);
    const settled = f.workspace.settleSaves.bind(f.workspace),
      gate = Promise.withResolvers<void>();
    f.workspace.settleSaves = () => gate.promise;
    const removal = f.sessions.deleteManaged(plan);
    await Bun.sleep(0);
    f.sessions.cancelPending();
    gate.resolve();
    await expect(removal).rejects.toThrow('cancelled');
    expect(f.workspace.files).toContain(file);
    f.workspace.settleSaves = settled;
    const commit = f.sessions.catalog.commitDeletion.bind(f.sessions.catalog);
    f.sessions.catalog.commitDeletion = () => {
      throw new Error('catalog failure');
    };
    await expect(f.sessions.deleteManaged(plan)).rejects.toThrow('catalog failure');
    f.sessions.catalog.commitDeletion = commit;
    expect(await readOptional(file.path)).not.toBeNull();
    expect(f.sessions.catalog.get(record.id)?.removing).toBeUndefined();
    expect(f.sessions.catalog.deletions()).toEqual([]);
    expect(f.sessions.catalog.wasRemoved(record.id)).toBe(false);
  } finally {
    await f.dispose();
  }
});

for (const state of ['prepared', 'removed', 'replacement'] as const) {
  test(`restart reconciles ${state} deletion without touching an external replacement`, async () => {
    const f = await fixture();
    let reopened: LocalSessions | undefined;
    try {
      const entry = await prepared(f),
        before = await readFile(entry.path, 'utf8');
      await stageManagedDeletion(entry);
      if (state === 'removed') f.sessions.catalog.commitDeletion(entry.sessionId);
      if (state !== 'prepared') await writeFile(entry.path, seed('Replacement'));
      await f.sessions.dispose();
      f.workspace.dispose();
      reopened = await LocalSessions.open(f.paths);
      const warnings = await reopened.repairPending();
      if (state === 'prepared') {
        expect(warnings).toEqual([]);
        expect(await readFile(entry.path, 'utf8')).toBe(before);
        expect(reopened.catalog.get(entry.sessionId)?.removing).toBeUndefined();
      } else if (state === 'removed') {
        expect(warnings).toEqual([]);
        expect(await readFile(entry.path, 'utf8')).toContain('Replacement');
        expect(reopened.catalog.get(entry.sessionId)).toBeNull();
        expect(await readOptional(entry.stagedPath)).toBeNull();
      } else {
        expect(warnings[0]).toContain('Both files preserved');
        expect(await readFile(entry.stagedPath, 'utf8')).toBe(before);
        expect(await readFile(entry.path, 'utf8')).toContain('Replacement');
        expect(reopened.catalog.get(entry.sessionId)?.removing).toBe(true);
        await rm(entry.path);
        await reopened.repairRemoval(entry.sessionId);
        expect(await readFile(entry.path, 'utf8')).toBe(before);
      }
    } finally {
      await reopened?.dispose();
      await f.dispose();
    }
  });
}

for (const mode of ['record', 'file'] as const) {
  test(`stale checkpoints cannot resurrect ${mode} removal; explicit reopen uses a fresh identity`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'chardesk-remove-restore-'));
    const paths = resolveAppPaths({ environment: { CHARDESK_HOME: join(root, 'home') } });
    let app = await openLocalWorkspace(parseOptions([]), paths, {}, [], root);
    try {
      app.persistence.start(app.workspace, { checkpointMs: 60_000, autosaveMs: 60_000 });
      const file = app.workspace.active,
        record = app.sessions.forFile(file)!;
      await app.persistence.flush();
      expect(JSON.parse(await readFile(app.persistence.path, 'utf8')).files[0].sessionId).toBe(
        record.id
      );
      if (mode === 'record') await app.sessions.removeRecord(record.id, record.revision);
      else
        await app.sessions.deleteManaged(
          await app.sessions.planRemoval(record.id, record.revision)
        );
      await app.persistence.abandon();
      await app.sessions.dispose();
      app.workspace.dispose();
      app = await openLocalWorkspace(parseOptions([]), paths, {}, [], root);
      expect(app.workspace.files).toHaveLength(0);
      expect(app.sessions.list()).toHaveLength(0);
      if (mode === 'record') {
        await app.sessions.openPath(file.path);
        const fresh = app.sessions.forFile(app.workspace.active)!;
        expect(fresh.id).not.toBe(record.id);
        app.persistence.start(app.workspace);
        await app.persistence.close();
        await app.sessions.dispose();
        app.workspace.dispose();
        app = await openLocalWorkspace(parseOptions([]), paths, {}, [], root);
        expect(app.workspace.files).toHaveLength(1);
        expect(app.sessions.forFile(app.workspace.active)!.id).toBe(fresh.id);
      }
    } finally {
      await app.persistence.abandon();
      await app.sessions.dispose();
      app.workspace.dispose();
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('catalog migrations retain existing sessions and interrupted removals', async () => {
  for (const version of [1, 2]) {
    const f = await fixture();
    try {
      const entry = await prepared(f);
      await f.sessions.dispose();
      f.workspace.dispose();
      const db = new Database(f.sessions.paths.catalog);
      db.exec('DROP TABLE removed_sessions;');
      if (version === 1) db.exec('DROP TABLE session_deletions;');
      db.exec(`PRAGMA user_version = ${version};`);
      db.close();
      const catalog = new LocalSessionCatalog(f.sessions.paths.catalog);
      try {
        expect(catalog.get(entry.sessionId)).not.toBeNull();
        expect(catalog.deletions()).toHaveLength(version === 2 ? 1 : 0);
      } finally {
        catalog.close();
      }
    } finally {
      await f.dispose();
    }
  }
});

test('another live writer blocks both removal paths; missing or malformed owned files remain removable after confirmation', async () => {
  const f = await fixture();
  let peer: LocalSessions | undefined;
  try {
    const file = await f.sessions.create(),
      record = f.sessions.forFile(file)!;
    peer = await LocalSessions.open(f.paths);
    const empty = TerminalWorkspace.empty();
    await peer.attach(empty);
    try {
      const plan = await peer.planRemoval(record.id, record.revision);
      await expect(peer.removeRecord(record.id, record.revision)).rejects.toThrow(
        'another CharDesk'
      );
      await expect(peer.deleteManaged(plan)).rejects.toThrow('another CharDesk');
      expect(f.sessions.catalog.get(record.id)).not.toBeNull();
    } finally {
      await peer.dispose();
      empty.dispose();
      peer = undefined;
    }
    await f.sessions.close(file);
    await rm(file.path);
    const missing = await f.sessions.planRemoval(record.id, record.revision);
    expect(missing.file?.proof).toBeNull();
    await f.sessions.deleteManaged(missing);
    expect(f.sessions.catalog.get(record.id)).toBeNull();
    const corrupt = await f.sessions.create(),
      row = f.sessions.forFile(corrupt)!;
    await f.sessions.close(corrupt);
    await writeFile(corrupt.path, new Uint8Array([0xff, 0xfe, 0]));
    await f.sessions.deleteManaged(await f.sessions.planRemoval(row.id, row.revision));
    expect(await inspectManagedFile(corrupt.path)).toBeNull();
  } finally {
    await peer?.dispose();
    await f.dispose();
  }
});
