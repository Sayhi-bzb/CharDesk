import { expect, test, afterEach } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TerminalWorkspace } from './workspace.ts';
import { WorkspacePersistence } from './persistence.ts';
import { readOptional } from './document.ts';
import { serializeCharDeskDocumentEnvelope } from '@chardesk/document';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-recovery-'));
  directories.push(root);
  const path = join(root, 'one.chardesk'),
    checkpoint = join(root, 'workspace.json');
  const workspace = await TerminalWorkspace.open(path);
  const persistence = await WorkspacePersistence.open(checkpoint);
  return { root, path, checkpoint, workspace, persistence };
}
async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 3000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out');
    await Bun.sleep(2);
  }
}

test('restart restores multiple documents, view, typing context, anchors and dirty content', async () => {
  const f = await fixture();
  try {
    const model = f.workspace.model;
    model.setTool('select');
    model.commands.pointAt({ x: -5, y: -10 });
    model.commands.insert('界A');
    model.commands.pointAt({ x: -5, y: -10 });
    model.commands.anchors.add('Root');
    model.commands.beginInsert();
    model.commands.insert('界');
    model.editor.transact(() => model.pan(20, 10));
    const firstState = model.getSnapshot().interaction,
      firstCamera = { ...model.viewport };
    await f.workspace.openFile(join(f.root, 'two.chardesk'));
    model.commands.insert('second');
    const secondState = model.getSnapshot().interaction;
    f.persistence.start(f.workspace, { autosaveMs: -1 });
    await f.persistence.flush();
    await f.persistence.abandon();
    f.workspace.dispose();
    const reopened = await WorkspacePersistence.open(f.checkpoint);
    const workspace = (await reopened.restore({}))!;
    try {
      expect(workspace.files).toHaveLength(2);
      expect(workspace.active.title).toBe('two');
      expect(workspace.model.getSnapshot().interaction).toEqual(secondState);
      expect(workspace.dirty).toBe(true);
      workspace.switchTo(0);
      expect(workspace.model.getSnapshot().interaction).toEqual(firstState);
      expect(workspace.model.viewport.x).toBe(firstCamera.x);
      expect(workspace.model.viewport.y).toBe(firstCamera.y);
      expect(workspace.model.anchors[0]?.label).toBe('Root');
      expect(workspace.model.plane.get({ x: -5, y: -10 })?.char).toBe('界');
      expect(workspace.model.currentTool).toBe('select');
      expect(workspace.model.dirty).toBe(true);
    } finally {
      await reopened.close();
      workspace.dispose();
    }
  } finally {
    await f.persistence.abandon();
    f.workspace.dispose();
  }
});

test('external edits fork a recovery copy and are never overwritten by auto save', async () => {
  const f = await fixture();
  try {
    f.workspace.model.commands.insert('mine');
    f.persistence.start(f.workspace, { autosaveMs: -1 });
    await f.persistence.flush();
    await f.persistence.abandon();
    const external = serializeCharDeskDocumentEnvelope({ mode: 'freeform', body: 'EXTERNAL' });
    await writeFile(f.path, external);
    const reopened = await WorkspacePersistence.open(f.checkpoint),
      restored = (await reopened.restore({}))!;
    try {
      expect(restored.files).toHaveLength(2);
      expect(reopened.conflicts).toHaveLength(1);
      expect(restored.active.path).not.toBe(
        await import('./document.ts').then((m) => m.resolveCanvasFilePath(f.path))
      );
      expect(restored.model.plane.get({ x: 0, y: 0 })?.char).toBe('m');
      reopened.start(restored, { autosaveMs: 5, checkpointMs: 2 });
      await until(() => !restored.dirty);
      expect(await readFile(f.path, 'utf8')).toBe(external);
      expect(await readFile(restored.active.path, 'utf8')).toContain('mine');
    } finally {
      await reopened.close();
      restored.dispose();
    }
  } finally {
    await f.persistence.abandon();
    f.workspace.dispose();
  }
});

test('an already committed save is recognized after a crash before the next checkpoint', async () => {
  const f = await fixture();
  try {
    f.workspace.model.commands.insert('committed');
    f.persistence.start(f.workspace, { autosaveMs: -1 });
    await f.persistence.flush();
    await f.workspace.saveFile();
    await f.persistence.abandon();
    const reopened = await WorkspacePersistence.open(f.checkpoint),
      restored = (await reopened.restore({}))!;
    try {
      expect(restored.files).toHaveLength(1);
      expect(restored.dirty).toBe(false);
      expect(reopened.conflicts).toHaveLength(0);
    } finally {
      await reopened.close();
      restored.dispose();
    }
  } finally {
    await f.persistence.abandon();
    f.workspace.dispose();
  }
});

test('closing before the idle timer saves the latest edits and protects active locks', async () => {
  const f = await fixture();
  try {
    await expect(WorkspacePersistence.open(f.checkpoint)).rejects.toThrow('already open');
    f.workspace.model.commands.insert('saved');
    await f.workspace.saveFile();
    f.workspace.model.commands.insert(' latest');
    f.persistence.start(f.workspace, { autosaveMs: -1 });
    await f.persistence.close();
    expect(await readFile(f.path, 'utf8')).toContain('saved latest');
    const reopened = await WorkspacePersistence.open(f.checkpoint),
      restored = (await reopened.restore({}))!;
    try {
      expect(
        [...restored.model.plane.materialize().values()].map((cell) => cell.char).join('')
      ).toBe('saved latest');
      expect(restored.dirty).toBe(false);
    } finally {
      await reopened.close();
      restored.dispose();
    }
  } finally {
    await f.persistence.abandon();
    f.workspace.dispose();
  }
});

test('invalid checkpoints stay intact and release the lock after rejection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-invalid-'));
  directories.push(root);
  const path = join(root, 'workspace.json'),
    source = '{"version":99,"files":[]}';
  await writeFile(path, source);
  await expect(WorkspacePersistence.open(path)).rejects.toThrow('Invalid workspace checkpoint');
  expect(await readFile(path, 'utf8')).toBe(source);
  expect(await readOptional(`${path}.lock`)).toBeNull();
});

test('failed checkpoint close keeps ownership and can retry without losing edits', async () => {
  const f = await fixture();
  try {
    f.workspace.model.commands.insert('recoverable');
    f.persistence.start(f.workspace, { autosaveMs: -1 });
    await mkdir(f.checkpoint);
    await expect(f.persistence.close()).rejects.toThrow();
    expect(await readOptional(`${f.checkpoint}.lock`)).not.toBeNull();
    expect(f.workspace.dirty).toBe(false);
    expect(await readFile(f.path, 'utf8')).toContain('recoverable');
    f.workspace.model.commands.insert(' after failure');
    await rm(f.checkpoint, { recursive: true });
    await f.persistence.close();
    expect(await readOptional(`${f.checkpoint}.lock`)).toBeNull();
    const reopened = await WorkspacePersistence.open(f.checkpoint);
    const restored = (await reopened.restore({}))!;
    try {
      expect(restored.model.plane.get({ x: 12, y: 0 })?.char).toBe('a');
      expect(restored.dirty).toBe(false);
    } finally {
      await reopened.close();
      restored.dispose();
    }
  } finally {
    await f.persistence.abandon();
    f.workspace.dispose();
  }
});

test('sparse recovery retains distant cells and camera-only checkpoints reuse the content snapshot', async () => {
  const f = await fixture();
  try {
    const model = f.workspace.model;
    model.commands.insert('A');
    model.commands.pointAt({ x: 1_000_000, y: -1_000_000 });
    model.commands.insert('界');
    f.persistence.start(f.workspace, { autosaveMs: -1, checkpointMs: 5000 });
    await f.persistence.flush();
    expect((await readFile(f.checkpoint, 'utf8')).length).toBeLessThan(5000);
    let snapshots = 0;
    const materialize = model.documents.getDocumentDraft;
    model.documents.getDocumentDraft = (...args) => {
      snapshots++;
      return materialize(...args);
    };
    try {
      model.editor.transact(() => model.pan(10, 10));
      await f.persistence.flush();
      expect(snapshots).toBe(0);
    } finally {
      model.documents.getDocumentDraft = materialize;
    }
    await f.persistence.abandon();
    const reopened = await WorkspacePersistence.open(f.checkpoint),
      restored = (await reopened.restore({}))!;
    try {
      expect(restored.model.plane.get({ x: 1_000_000, y: -1_000_000 })?.char).toBe('界');
      expect(restored.model.plane.get({ x: 0, y: 0 })?.char).toBe('A');
    } finally {
      await reopened.close();
      restored.dispose();
    }
  } finally {
    await f.persistence.abandon();
    f.workspace.dispose();
  }
});

test('auto save persists edits and reports external file conflicts while checkpoints remain recoverable', async () => {
  const f = await fixture(),
    errors: string[] = [];
  try {
    f.persistence.start(f.workspace, {
      autosaveMs: 10,
      checkpointMs: 3,
      onStatus: (status) => {
        if (status.phase === 'error') errors.push(status.message ?? '');
      },
    });
    f.workspace.model.commands.insert('auto');
    await until(() => !f.workspace.dirty);
    expect(await readFile(f.path, 'utf8')).toContain('auto');
    await writeFile(f.path, 'external');
    f.workspace.model.commands.insert('mine');
    await until(() => errors.some((error) => error.includes('changed on disk')));
    await f.persistence.flush();
    expect(await readFile(f.path, 'utf8')).toBe('external');
    expect(f.workspace.dirty).toBe(true);
    expect(await readFile(f.checkpoint, 'utf8')).toContain('mine');
  } finally {
    await f.persistence.abandon();
    f.workspace.dispose();
  }
});

test('checkpoint failure and recovery report their own scope independently of document saving', async () => {
  const f = await fixture();
  const events: string[] = [];
  try {
    await mkdir(f.checkpoint);
    f.persistence.start(f.workspace, {
      autosaveMs: -1,
      checkpointMs: 2,
      onStatus: (status) => events.push(`${status.scope}:${status.phase}`),
    });
    f.workspace.model.commands.insert('Checkpoint');
    await until(() => events.includes('checkpoint:error'));
    await rm(f.checkpoint, { recursive: true });
    f.workspace.model.commands.insert(' retry');
    await until(() => events.includes('checkpoint:saved'));
    expect(events).not.toContain('document:saved');
  } finally {
    await f.persistence.abandon();
    f.workspace.dispose();
  }
});

test('SIGKILL leaves a durable checkpoint that is recovered after verifying the dead owner', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-crash-'));
  directories.push(root);
  const checkpoint = join(root, 'workspace.json'),
    path = join(root, 'canvas.chardesk'),
    ready = join(root, 'ready');
  const probe = new URL('../src/fixtures/crash.ts', import.meta.url).pathname;
  const child = Bun.spawn([process.execPath, probe, checkpoint, path, ready], {
    stdout: 'ignore',
    stderr: 'pipe',
  });
  try {
    await until(async () => (await readOptional(ready)) !== null || child.exitCode !== null);
    if (child.exitCode !== null) throw new Error(await new Response(child.stderr).text());
    child.kill('SIGKILL');
    await child.exited;
    const persistence = await WorkspacePersistence.open(checkpoint),
      workspace = (await persistence.restore({}))!;
    try {
      expect(workspace.model.plane.get({ x: -7, y: -8 })?.char).toBe('C');
      expect(workspace.dirty).toBe(true);
    } finally {
      await persistence.close();
      workspace.dispose();
    }
  } finally {
    child.kill();
    await child.exited;
  }
}, 15000);

test('recovery restores complete drawing settings and tool without content or history writes', async () => {
  const f = await fixture();
  try {
    const model = f.workspace.model;
    model.setDrawingSettings({ char: '界', foreground: '#ff0000', background: '#0000ff' });
    model.setTool('brush');
    f.persistence.start(f.workspace, { autosaveMs: -1 });
    await f.persistence.flush();
    await f.persistence.abandon();
    const reopened = await WorkspacePersistence.open(f.checkpoint),
      workspace = (await reopened.restore({}))!;
    try {
      expect(workspace.model.currentTool).toBe('brush');
      expect(workspace.model.drawingSettings).toEqual({
        char: '界',
        foreground: '#ff0000',
        background: '#0000ff',
      });
      expect(workspace.dirty).toBe(false);
      expect(workspace.model.canUndo).toBe(false);
      const point = { x: -5, y: -7 };
      workspace.model.pointer({ phase: 'down', cell: point, screen: point });
      workspace.model.pointer({ phase: 'up', cell: point, screen: point });
      expect(workspace.model.plane.get(point)?.char).toBe('界');
    } finally {
      await reopened.close();
      workspace.dispose();
    }
  } finally {
    await f.persistence.abandon();
    f.workspace.dispose();
  }
});

test('exit saves every dirty document, including hidden documents, before releasing recovery ownership', async () => {
  const f = await fixture();
  const second = join(f.root, 'two.chardesk');
  try {
    f.workspace.model.commands.insert('ONE');
    await f.workspace.openFile(second);
    f.workspace.model.commands.insert('TWO');
    f.persistence.start(f.workspace, { autosaveMs: 60_000, checkpointMs: 60_000 });
    await f.persistence.close();
    expect(await readFile(f.path, 'utf8')).toContain('ONE');
    expect(await readFile(second, 'utf8')).toContain('TWO');
    expect(f.workspace.dirty).toBe(false);
    expect(await readOptional(`${f.checkpoint}.lock`)).toBeNull();
    const checkpoint = JSON.parse(await readFile(f.checkpoint, 'utf8'));
    expect(checkpoint.files.map((file: { dirty: boolean }) => file.dirty)).toEqual([false, false]);
  } finally {
    await f.persistence.abandon();
    f.workspace.dispose();
  }
});

test('exit waits for an in-flight write and then saves edits made after that write', async () => {
  const f = await fixture();
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  const file = f.workspace.active,
    save = file.save.bind(file);
  let writes = 0;
  file.save = async (model) => {
    await save(model);
    if (++writes === 1) {
      entered.resolve();
      await release.promise;
    }
  };
  try {
    f.workspace.model.commands.insert('first');
    const saving = f.workspace.saveFile();
    await entered.promise;
    f.workspace.model.commands.insert(' latest');
    f.persistence.start(f.workspace, { autosaveMs: 60_000, checkpointMs: 60_000 });
    let closed = false;
    const closing = f.persistence.close().then(() => {
      closed = true;
    });
    await Bun.sleep(5);
    expect(closed).toBe(false);
    release.resolve();
    await saving;
    await closing;
    expect(await readFile(f.path, 'utf8')).toContain('first latest');
    expect(writes).toBe(2);
    expect(f.workspace.dirty).toBe(false);
  } finally {
    release.resolve();
    await f.persistence.abandon();
    f.workspace.dispose();
  }
});

test('failed exit keeps edits, an up-to-date recovery checkpoint and workspace ownership', async () => {
  const f = await fixture();
  try {
    f.workspace.model.commands.insert('my edits');
    f.persistence.start(f.workspace, { autosaveMs: 60_000, checkpointMs: 60_000 });
    await writeFile(f.path, 'EXTERNAL');
    await expect(f.persistence.close()).rejects.toThrow('changed on disk');
    expect(await readFile(f.path, 'utf8')).toBe('EXTERNAL');
    expect(f.workspace.dirty).toBe(true);
    expect(await readFile(f.checkpoint, 'utf8')).toContain('my edits');
    expect(await readOptional(`${f.checkpoint}.lock`)).not.toBeNull();
    await expect(WorkspacePersistence.open(f.checkpoint)).rejects.toThrow('already open');
  } finally {
    await f.persistence.abandon();
    f.workspace.dispose();
  }
});

for (const exitImmediately of [false, true]) {
  test(`untouched new canvases reach disk automatically (immediate exit: ${exitImmediately})`, async () => {
    const f = await fixture();
    try {
      expect(f.workspace.model.dirty).toBe(false);
      expect(f.workspace.needsSave()).toBe(true);
      f.persistence.start(f.workspace, { autosaveMs: exitImmediately ? 60_000 : 5 });
      if (exitImmediately) await f.persistence.close();
      else await until(() => !f.workspace.needsSave());
      expect(await readFile(f.path, 'utf8')).toContain('chardesk: document/v2');
      expect(f.workspace.needsSave()).toBe(false);
      expect(f.workspace.model.dirty).toBe(false);
    } finally {
      await f.persistence.abandon();
      f.workspace.dispose();
    }
  });
}
