import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TerminalWorkspace } from './workspace.ts';
import { CanvasFile } from './document.ts';
import { LocalSessions } from './sessions.ts';
import { resolveAppPaths } from './appPaths.ts';
import { serializeCanvasDocument } from '@chardesk/editor-core/documentText';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-consistency-'));
  const sessions = await LocalSessions.open(resolveAppPaths({ environment: { CHARDESK_HOME: root } }));
  const workspace = TerminalWorkspace.empty();
  await sessions.attach(workspace);
  const file = await sessions.create('Original');
  return { root, sessions, workspace, file, async dispose() {
    await sessions.dispose(); workspace.dispose(); await rm(root, { recursive: true, force: true });
  } };
}

for (const action of ['close', 'archive', 'fallback-close'] as const) {
  test(`cancelled ${action} may finish saving but cannot retire its addressed canvas`, async () => {
    const f = await fixture(), abort = new AbortController();
    try {
      f.workspace.model.commands.insert('界🦀');
      f.file.afterCapture = () => abort.abort();
      const context = { owner: {}, signal: abort.signal };
      const record = f.sessions.forFile(f.file)!;
      const result = action === 'close' ? f.sessions.close(f.file, context)
        : action === 'archive' ? f.sessions.archive(record.id, true, record.revision, context)
        : f.workspace.closeFile(f.file, context);
      await expect(result).rejects.toMatchObject({ code: 'operation_cancelled' });
      expect(f.workspace.files).toContain(f.file);
      expect(f.sessions.catalog.get(record.id)?.archived).toBe(false);
      expect(await readFile(f.file.path, 'utf8')).toContain('界🦀');
      expect(f.workspace.model.isDirtyAt(f.file.address!)).toBe(false);
    } finally { await f.dispose(); }
  });
}

test('binding replacement during close preparation invalidates publication', async () => {
  const f = await fixture();
  try {
    f.workspace.model.commands.insert('dirty');
    f.file.afterCapture = () => { f.file.address = { ...f.file.address! }; };
    await expect(f.sessions.close(f.file, { owner: {} })).rejects.toMatchObject({ code: 'operation_cancelled' });
    expect(f.workspace.files).toContain(f.file);
  } finally { await f.dispose(); }
});

test('background lifecycle and human activation do not supersede one another', async () => {
  const f = await fixture();
  try {
    f.workspace.model.commands.insert('ORIGINAL');
    const other = await f.sessions.create('Human destination');
    const originalRecord = f.sessions.forFile(f.file)!, otherRecord = f.sessions.forFile(other)!;
    const [copy, opened] = await Promise.all([
      f.sessions.duplicate(originalRecord.id, { owner: {}, activate: false }),
      f.sessions.open(otherRecord.id, { owner: {} }),
    ]);
    expect(f.workspace.active).toBe(opened);
    expect(f.workspace.active).toBe(other);
    expect(f.workspace.files).toContain(copy);
    expect(f.workspace.model.documents.getDocumentDraft(copy.address!.documentId)!.pages[0]!.grid![0]![1].char).toBe('O');
    expect(f.workspace.model.isDirtyAt(f.file.address!)).toBe(true);
  } finally { await f.dispose(); }
});

test('cancelling a registered Open suppresses activation and reports the retained resource', async () => {
  const f = await fixture(), abort = new AbortController();
  let release!: () => void, registered!: () => void;
  const gate = new Promise<void>((done) => { release = done; });
  const ready = new Promise<void>((done) => { registered = done; });
  const record = await f.sessions.createManaged('Prepared target');
  const prepare = f.workspace.prepareFile.bind(f.workspace);
  f.workspace.prepareFile = async (...args) => {
    const file = await prepare(...args);
    registered();
    await gate;
    return file;
  };
  const pending = f.sessions.open(record.id, { owner: {}, signal: abort.signal });
  try {
    await ready;
    expect(f.workspace.active).toBe(f.file);
    abort.abort(); release();
    await expect(pending).rejects.toMatchObject({ code: 'operation_cancelled', effects: [`registered:${record.path}`] });
    expect(f.workspace.active).toBe(f.file);
    expect(f.workspace.files.some((file) => file.path === record.path)).toBe(true);
  } finally { release(); await pending.catch(() => {}); await f.dispose(); }
});

test('a historical file receipt cannot replace the current binding baseline', async () => {
  const f = await fixture();
  let replacement: CanvasFile | undefined;
  try {
    const { model } = f.workspace;
    model.commands.insert('X');
    const draft = structuredClone(model.documents.getDocumentDraft()!);
    draft.pages[0]!.grid = [['0,0', { char: 'Y', color: '#000000' }]];
    replacement = new CanvasFile(join(f.root, 'new-binding.chardesk'), 'New binding', serializeCanvasDocument(draft));
    replacement.address = f.file.address;
    f.file.afterCapture = () => replacement!.attach(model);
    await f.workspace.saveFile(f.file);
    expect(model.dirty).toBe(true);
    await Bun.sleep(250);
    expect(model.dirty).toBe(true);
    expect(await readFile(f.file.path, 'utf8')).toContain('X');
  } finally { replacement?.disposePersistence(); await f.dispose(); }
});
