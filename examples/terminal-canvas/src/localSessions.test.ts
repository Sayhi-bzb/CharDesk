import { afterEach, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveAppPaths } from './appPaths.ts';
import { LocalSessionCatalog } from './sessionCatalog.ts';
import { LocalSessions } from './sessions.ts';
import { TerminalWorkspace } from './workspace.ts';
import { TerminalCanvas } from './model.ts';
import { CanvasFile, readOptional } from './document.ts';
import { parseCanvasDocument, serializeCanvasDocument } from '@chardesk/editor-core/documentText';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-sessions-'));
  directories.push(root);
  const paths = resolveAppPaths({ environment: { CHARDESK_HOME: join(root, 'home') } });
  const sessions = await LocalSessions.open(paths),
    workspace = TerminalWorkspace.empty();
  await sessions.attach(workspace);
  return {
    root,
    sessions,
    workspace,
    async dispose() {
      await sessions.dispose();
      workspace.dispose();
    },
  };
}
function seed(body = 'Seed') {
  const model = new TerminalCanvas(body);
  try {
    return serializeCanvasDocument(model.documents.getDocumentDraft()!, 'Seed');
  } finally {
    model.dispose();
  }
}

test('new managed canvases persist immediately and have stable identity independent of name', async () => {
  const f = await fixture();
  try {
    const file = await f.sessions.create();
    const record = f.sessions.forFile(file)!;
    expect(record).toMatchObject({ kind: 'managed', status: 'ready', name: 'Canvas 1' });
    expect(file.path).toBe(join(f.sessions.paths.canvases, `${record.id}.chardesk`));
    const source = await readFile(file.path, 'utf8');
    expect(parseCanvasDocument(source).document.pages[0]!.grid).toEqual([]);
    const renamed = f.sessions.rename(record.id, 'Design / 草图', record.revision);
    expect(renamed.id).toBe(record.id);
    expect(renamed.path).toBe(record.path);
    expect(await readFile(file.path, 'utf8')).toBe(source);
    expect(() => f.sessions.rename(record.id, 'Stale', record.revision)).toThrow('Session changed');
  } finally {
    await f.dispose();
  }
});

test('switch, duplicate, close, archive and restore keep independent content and undo state', async () => {
  const f = await fixture();
  try {
    const first = await f.sessions.create('First'),
      firstRecord = f.sessions.forFile(first)!;
    f.workspace.model.commands.insert('Hello 🦀');
    f.workspace.model.pan(12, -7);
    const view = { ...f.workspace.model.viewport };
    const second = await f.sessions.create('Second');
    f.workspace.model.commands.insert('Other');
    await f.sessions.open(firstRecord.id);
    expect(f.workspace.active).toBe(first);
    expect(f.workspace.model.viewport).toEqual(view);
    expect(f.workspace.model.canUndo).toBe(true);
    const original = f.workspace.model.plane.materialize();
    const copy = await f.sessions.duplicate(firstRecord.id),
      copyRecord = f.sessions.forFile(copy)!;
    expect(copyRecord.id).not.toBe(firstRecord.id);
    expect(copy.address!.documentId).not.toBe(first.address!.documentId);
    expect(f.workspace.model.plane.materialize()).toEqual(original);
    expect(f.workspace.model.canUndo).toBe(false);
    await f.sessions.open(firstRecord.id);
    expect(f.workspace.model.plane.materialize()).toEqual(original);
    await f.sessions.archive(
      firstRecord.id,
      true,
      f.sessions.catalog.get(firstRecord.id)!.revision
    );
    expect(f.sessions.list().some((record) => record.id === firstRecord.id)).toBe(false);
    expect(await readOptional(first.path)).not.toBeNull();
    await f.sessions.close(second);
    await f.sessions.close(copy);
    expect(f.workspace.files).toHaveLength(0);
    expect(f.workspace.model.plane.materialize().size).toBe(0);
    expect(f.workspace.model.canUndo).toBe(false);
    expect(f.sessions.list()).toHaveLength(2);
    await f.sessions.open(firstRecord.id);
    expect(f.sessions.catalog.get(firstRecord.id)?.archived).toBe(false);
    expect(f.workspace.model.plane.materialize()).toEqual(original);
  } finally {
    await f.dispose();
  }
});

test('external aliases register once, metadata rename leaves the original intact, edits save in place', async () => {
  const f = await fixture();
  const path = join(f.root, 'external.chardesk'),
    alias = join(f.root, 'alias.chardesk');
  try {
    await writeFile(path, seed('Original'));
    await symlink(path, alias);
    const before = await readFile(path, 'utf8');
    const file = await f.sessions.openPath(path),
      record = f.sessions.forFile(file)!;
    expect(record.kind).toBe('external');
    expect(await f.sessions.openPath(alias)).toBe(file);
    expect(f.sessions.list()).toHaveLength(1);
    f.sessions.rename(record.id, 'Alias name', record.revision);
    expect(await readFile(path, 'utf8')).toBe(before);
    f.workspace.model.commands.pointAt({ x: 0, y: 0 });
    f.workspace.model.commands.insert('Z');
    await f.workspace.saveAll();
    const reopened = await CanvasFile.open(path);
    try {
      expect(reopened.model.plane.get({ x: 0, y: 0 })?.char).toBe('Z');
    } finally {
      reopened.model.dispose();
    }
    await expect(f.sessions.openPath(f.sessions.paths.catalog)).rejects.toThrow(
      'application storage'
    );
  } finally {
    await f.dispose();
  }
});

test('multiple catalog connections keep incremental edits and enforce one writable owner per canvas', async () => {
  const f = await fixture();
  const peer = await LocalSessions.open(f.sessions.paths),
    peerWorkspace = TerminalWorkspace.empty();
  await peer.attach(peerWorkspace);
  try {
    const first = await f.sessions.create('First'),
      firstRecord = f.sessions.forFile(first)!;
    const second = await peer.create('Second'),
      secondRecord = peer.forFile(second)!;
    expect(f.sessions.list()).toHaveLength(2);
    f.sessions.rename(firstRecord.id, 'Updated first', firstRecord.revision);
    peer.rename(secondRecord.id, 'Updated second', secondRecord.revision);
    expect(
      peer
        .list()
        .map((record) => record.name)
        .sort()
    ).toEqual(['Updated first', 'Updated second']);
    await expect(peer.open(firstRecord.id)).rejects.toThrow('another CharDesk instance');
    f.workspace.model.commands.insert('durable');
    await f.sessions.close(first);
    await peer.open(firstRecord.id);
    expect(peerWorkspace.model.plane.get({ x: 0, y: 0 })?.char).toBe('d');
    await expect(f.sessions.open(firstRecord.id)).rejects.toThrow('another CharDesk instance');
  } finally {
    await peer.dispose();
    peerWorkspace.dispose();
    await f.dispose();
  }
});

test('interrupted creation repairs from its durable seed and conflicting files stay intact', async () => {
  const f = await fixture();
  try {
    const id = randomUUID(),
      path = join(f.sessions.paths.canvases, `${id}.chardesk`),
      source = seed('Recovered 🦀');
    f.sessions.catalog.prepare(id, path, 'Interrupted', source);
    expect(await f.sessions.repairPending()).toEqual([]);
    expect(f.sessions.catalog.get(id)?.status).toBe('ready');
    expect(await readFile(path, 'utf8')).toBe(source);
    const conflict = randomUUID(),
      other = join(f.sessions.paths.canvases, `${conflict}.chardesk`);
    f.sessions.catalog.prepare(conflict, other, 'Conflict', seed('Mine'));
    await writeFile(other, 'External content');
    expect((await f.sessions.repairPending())[0]).toContain('preserved');
    expect(await readFile(other, 'utf8')).toBe('External content');
    expect(f.sessions.catalog.get(conflict)?.status).toBe('creating');
    expect(f.sessions.catalog.pending()[0]?.seed).toContain('Mine');
  } finally {
    await f.dispose();
  }
});

test('future, unrelated and corrupt catalogs are preserved instead of being reset', async () => {
  const f = await fixture();
  await f.dispose();
  for (const mode of ['future', 'unrelated', 'corrupt']) {
    const path = join(f.root, `${mode}.sqlite`);
    if (mode === 'corrupt') await writeFile(path, 'not a database');
    else {
      const db = new Database(path);
      db.exec("CREATE TABLE evidence (value TEXT); INSERT INTO evidence VALUES ('keep');");
      if (mode === 'future') db.exec('PRAGMA user_version=9;');
      db.close();
    }
    const before = await readFile(path);
    expect(() => new LocalSessionCatalog(path)).toThrow();
    expect(await readFile(path)).toEqual(before);
  }
});

test('a killed writer can be reclaimed and a stale guard cannot authorize another write', async () => {
  const f = await fixture();
  const ready = join(f.root, 'ready'),
    path = join(f.root, 'owned.chardesk');
  const probe = new URL('../src/fixtures/sessionOwner.ts', import.meta.url).pathname;
  const child = Bun.spawn([process.execPath, probe, f.sessions.paths.catalog, path, ready], {
    stdout: 'ignore',
    stderr: 'pipe',
  });
  try {
    const deadline = Date.now() + 5000;
    while ((await readOptional(ready)) === null && child.exitCode === null && Date.now() < deadline)
      await Bun.sleep(10);
    if (child.exitCode !== null) throw new Error(await new Response(child.stderr).text());
    expect(await readOptional(ready)).toBe('ready');
    expect(() => f.sessions.catalog.claim(path)).toThrow('another CharDesk instance');
    child.kill('SIGKILL');
    await child.exited;
    const owner = f.sessions.catalog.claim(path);
    expect(owner.verify()).toBeUndefined();
    owner.release();
    expect(owner.verify).toThrow('ownership changed');
  } finally {
    child.kill();
    await child.exited;
    await f.dispose();
  }
}, 10000);

test('reclaimed ownership fences old guards and rejects ownership loss during an atomic save', async () => {
  const f = await fixture();
  try {
    const file = await f.sessions.create();
    const before = await readFile(file.path, 'utf8');
    const old = f.sessions.catalog.claim(file.path);
    const current = f.sessions.catalog.claim(file.path);
    old.release();
    expect(old.verify).toThrow('ownership changed');
    expect(current.verify()).toBeUndefined();
    let checks = 0;
    file.writeGuard = () => {
      if (++checks === 2) current.release();
      current.verify();
    };
    f.workspace.model.commands.insert('Unsaved');
    await expect(f.workspace.saveAll()).rejects.toThrow('ownership changed');
    expect(checks).toBe(2);
    expect(await readFile(file.path, 'utf8')).toBe(before);
    expect(f.workspace.dirty).toBe(true);
  } finally {
    await f.dispose();
  }
});

test('source conflict recovery persists an independent local canvas before reloading external content', async () => {
  const f = await fixture();
  try {
    const file = await f.sessions.create();
    f.workspace.model.commands.pointAt({ x: 0, y: 0 });
    f.workspace.model.commands.insert('🦀local');
    await writeFile(file.path, seed('External'));
    const local = f.workspace.model.plane.materialize();
    const copy = await f.sessions.preserveLocalAndReload(file);
    expect(f.workspace.active).toBe(file);
    expect(f.workspace.model.plane.get({ x: 0, y: 0 })?.char).toBe('E');
    expect(f.workspace.model.dirty).toBe(false);
    const stored = parseCanvasDocument(await readFile(copy.path, 'utf8')).document;
    expect(new Map(stored.pages[0]!.grid)).toEqual(local);
    expect(stored.id).not.toBe(f.workspace.model.documents.getActiveDocumentId());
    expect(f.sessions.catalog.get(copy.id)?.status).toBe('ready');
    expect(f.sessions.list()).toHaveLength(2);
  } finally {
    await f.dispose();
  }
});

test('cancelling conflict recovery after its backup keeps the local editor and external file unchanged', async () => {
  const f = await fixture();
  try {
    const file = await f.sessions.create();
    f.workspace.model.commands.pointAt({ x: 0, y: 0 });
    f.workspace.model.commands.insert('local');
    const external = seed('External');
    await writeFile(file.path, external);
    const ready = Promise.withResolvers<void>(),
      resume = Promise.withResolvers<void>();
    const create = f.sessions.createManaged.bind(f.sessions);
    f.sessions.createManaged = async (...args) => {
      const copy = await create(...args);
      ready.resolve();
      await resume.promise;
      return copy;
    };
    const recovery = f.sessions.preserveLocalAndReload(file);
    await ready.promise;
    f.sessions.cancelPending();
    resume.resolve();
    await expect(recovery).rejects.toThrow('was saved; reload failed');
    expect(f.workspace.model.plane.get({ x: 0, y: 0 })?.char).toBe('l');
    expect(f.workspace.model.dirty).toBe(true);
    expect(await readFile(file.path, 'utf8')).toBe(external);
    expect(f.sessions.list()).toHaveLength(2);
  } finally {
    await f.dispose();
  }
});
