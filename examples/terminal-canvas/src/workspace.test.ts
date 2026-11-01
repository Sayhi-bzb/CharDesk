import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TerminalWorkspace } from './workspace.ts';
import { parseCanvasDocument } from '@chardesk/editor-core/documentText';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'chardesk-workspace-'));
  directories.push(path);
  return path;
}

test('multiple files isolate edits, selection, tools, viewport and undo', async () => {
  const root = await directory();
  const workspace = await TerminalWorkspace.open(join(root, 'one.chardesk'));
  const { model } = workspace;
  try {
    model.commands.pointAt({ x: -5, y: -10 });
    model.commands.insert('first');
    model.setTool('pan');
    model.editor.transact(() => model.pan(10, 5));
    const camera = { ...model.viewport };
    const interaction = model.getSnapshot().interaction;
    await workspace.openFile(join(root, 'two.chardesk'));
    model.setTool('select');
    model.commands.insert('second');
    expect(workspace.files).toHaveLength(2);
    expect(workspace.files[0]?.address?.documentId).not.toBe(
      workspace.files[1]?.address?.documentId
    );
    workspace.switchTo(0);
    expect(model.currentTool).toBe('pan');
    expect(model.viewport).toEqual(camera);
    expect(model.getSnapshot().interaction).toEqual(interaction);
    model.commands.undo();
    expect(model.plane.materialize().size).toBe(0);
    workspace.switchTo(1);
    expect(model.plane.get({ x: 0, y: 0 })?.char).toBe('s');
    expect(model.currentTool).toBe('select');
    expect(workspace.close(1)).toBe(false);
    await workspace.saveAll();
    expect(workspace.dirty).toBe(false);
    expect(workspace.close(1)).toBe(true);
    expect(workspace.active).toBe(workspace.files[0]!);
  } finally {
    workspace.dispose();
  }
});

test('saving while switching targets the original file and leaves later edits dirty', async () => {
  const root = await directory();
  const workspace = await TerminalWorkspace.open(join(root, 'one.chardesk'));
  try {
    workspace.model.commands.insert('first');
    const saving = workspace.active.save(workspace.model);
    await workspace.openFile(join(root, 'two.chardesk'));
    workspace.model.commands.insert('second');
    await saving;
    expect(workspace.model.isDirtyAt(workspace.files[0]!.address!)).toBe(false);
    expect(workspace.model.dirty).toBe(true);
    const source = await readFile(workspace.files[0]!.path, 'utf8');
    expect(source).toContain('first');
    expect(source).not.toContain('second');
    expect(parseCanvasDocument(source).document.pages[0]!.grid?.[0]?.[1].char).toBe('f');
  } finally {
    workspace.dispose();
  }
});

test('reopening a catalog path preserves unsaved edits and external changes still block save', async () => {
  const root = await directory(),
    path = join(root, 'one.chardesk');
  const workspace = await TerminalWorkspace.open(path);
  try {
    workspace.model.commands.insert('mine');
    const original = workspace.active;
    await writeFile(path, 'external change');
    expect(await workspace.openFile(path)).toBe(original);
    expect(workspace.files).toHaveLength(1);
    expect(workspace.model.plane.get({ x: 0, y: 0 })?.char).toBe('m');
    await expect(workspace.saveAll()).rejects.toThrow('changed on disk');
    expect(await readFile(path, 'utf8')).toBe('external change');
    expect(workspace.dirty).toBe(true);
  } finally {
    workspace.dispose();
  }
});

test('explicit source reload validates first, keeps views and identity, resets history and accepts the new baseline', async () => {
  const root = await directory(),
    path = join(root, 'native.chardesk');
  const workspace = await TerminalWorkspace.open(path, 'before');
  const external = await TerminalWorkspace.open(join(root, 'external.chardesk'), '🦀after');
  try {
    await workspace.saveFile();
    const address = workspace.model.documents.getActiveAddress();
    workspace.model.setTool('select');
    workspace.model.selection = { anchor: { x: 0, y: 0 }, focus: { x: 1, y: 0 } };
    workspace.model.pan(-20, 30);
    const view = workspace.model.viewAt(address);
    await external.saveFile();
    await writeFile(path, await readFile(external.active.path, 'utf8'));
    await workspace.inspectSources();
    expect(workspace.sourceState().state).toBe('changed');
    await workspace.reloadFile();
    expect(workspace.active.path).toBe(
      await import('./document.ts').then(({ resolveCanvasFilePath }) => resolveCanvasFilePath(path))
    );
    expect(workspace.model.documents.getActiveDocumentId()).toBe(address.documentId);
    expect(workspace.model.viewAt(workspace.model.documents.getActiveAddress())).toEqual(view);
    expect(workspace.model.plane.get({ x: 0, y: 0 })?.char).toBe('🦀');
    expect(workspace.model.dirty).toBe(false);
    expect(workspace.model.canUndo).toBe(false);
    expect(workspace.sourceState().state).toBe('current');
    expect(workspace.needsSave()).toBe(false);
    workspace.model.commands.insert('X');
    const local = workspace.model.plane.materialize();
    await writeFile(path, 'corrupt external data');
    await workspace.inspectSources();
    expect(workspace.sourceState().state).toBe('conflict');
    await expect(workspace.reloadFile()).rejects.toThrow('Local edits');
    expect(workspace.model.plane.materialize()).toEqual(local);
    expect(await readFile(path, 'utf8')).toBe('corrupt external data');
  } finally {
    workspace.dispose();
    external.dispose();
  }
});

test('reload rejects malformed/missing and stale sources without replacing cells or a newer edit', async () => {
  const root = await directory(),
    path = join(root, 'reload.chardesk');
  const workspace = await TerminalWorkspace.open(path, 'before');
  try {
    await workspace.saveFile();
    const file = workspace.active,
      before = workspace.model.plane.materialize();
    await writeFile(path, 'invalid source');
    await expect(workspace.reloadFile()).rejects.toThrow('native Freeform');
    expect(workspace.errorFor(file)).toBeUndefined();
    expect(workspace.model.plane.materialize()).toEqual(before);
    await rm(path);
    await expect(workspace.reloadFile()).rejects.toThrow('missing');
    expect(workspace.model.plane.materialize()).toEqual(before);
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof file.source.read>>>();
    const read = file.source.read.bind(file.source);
    file.source.read = () => pending.promise;
    const reload = workspace.reloadFile();
    await Bun.sleep(0);
    workspace.model.commands.pointAt({ x: 0, y: 2 });
    workspace.model.commands.insert('new local edit');
    const edited = workspace.model.plane.materialize();
    pending.resolve({ source: file.baselineSource!, digest: file.baselineDigest });
    await expect(reload).rejects.toThrow('preserved');
    expect(workspace.model.plane.materialize()).toEqual(edited);
    file.source.read = read;
  } finally {
    workspace.dispose();
  }
});
