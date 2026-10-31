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
