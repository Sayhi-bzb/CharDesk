import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { resolveAppPaths } from './appPaths.ts';
import { openLocalWorkspace } from './localWorkspace.ts';
import { parseOptions } from './options.ts';
import { readOptional } from './document.ts';
import { TerminalWorkspace } from './workspace.ts';
import { WorkspacePersistence } from './persistence.ts';
import { TerminalSettingsStore } from './settings.ts';
import { buildDefaultDemoGrid } from '@chardesk/canvas-templates/welcome';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-local-start-'));
  directories.push(root);
  const paths = resolveAppPaths({ environment: { CHARDESK_HOME: join(root, 'home') } });
  const firstCwd = join(root, 'first'),
    secondCwd = join(root, 'second');
  await mkdir(firstCwd);
  await mkdir(secondCwd);
  return { root, paths, firstCwd, secondCwd };
}
async function finish(opened: Awaited<ReturnType<typeof openLocalWorkspace>>) {
  await opened.persistence.close();
  await opened.sessions.dispose();
  opened.workspace.dispose();
}

test('first launch consumes the shared Web Welcome; new canvases and explicit paths stay blank', async () => {
  const f = await fixture();
  const first = await openLocalWorkspace(parseOptions([]), f.paths, {}, [], f.firstCwd);
  try {
    expect(first.sessions.forFile(first.workspace.active)?.name).toBe('Welcome');
    const expected = buildDefaultDemoGrid();
    for (const [key, cell] of expected) {
      if (cell.char === ' ') continue;
      const [x, y] = key.split(',').map(Number);
      expect(first.workspace.model.plane.get({ x: x!, y: y! })).toEqual(cell);
    }
    expect(first.workspace.model.canUndo).toBe(false);
    expect(first.workspace.dirty).toBe(false);
    // A subsequent New is an empty document, rather than a second Welcome.
    await first.sessions.create();
    expect(first.workspace.model.plane.materialize().size).toBe(0);
  } finally {
    await finish(first);
  }
  const fresh = await fixture();
  const blank = await openLocalWorkspace(
    parseOptions(['--blank']),
    fresh.paths,
    {},
    [],
    fresh.firstCwd
  );
  try {
    expect(blank.workspace.model.plane.materialize().size).toBe(0);
  } finally {
    await finish(blank);
  }
  const external = await fixture();
  const explicit = await openLocalWorkspace(
    parseOptions(['new.chardesk']),
    external.paths,
    {},
    [],
    external.firstCwd
  );
  try {
    expect(explicit.workspace.model.plane.materialize().size).toBe(0);
  } finally {
    await finish(explicit);
  }
});

for (const savedToDisk of [false, true]) {
  for (const dirty of [false, true]) {
    test(`deleted source directory recovers into a durable managed session (saved: ${savedToDisk}, dirty: ${dirty})`, async () => {
      const f = await fixture();
      const oldDirectory = join(f.root, 'deleted-worktree');
      await mkdir(oldDirectory);
      const oldPath = join(oldDirectory, 'canvas.chardesk');
      const old = await TerminalWorkspace.open(oldPath);
      const checkpoint = await WorkspacePersistence.open(f.paths.workspace);
      let view = { ...old.model.viewport };
      try {
        old.model.commands.insert('Recovered 🦀界');
        if (savedToDisk) await old.saveFile();
        if (dirty) old.model.commands.insert('!');
        else old.model.markSaved();
        old.model.pan(42, -17);
        view = { ...old.model.viewport };
        checkpoint.start(old, { autosaveMs: -1 });
        await checkpoint.flush();
      } finally {
        await checkpoint.abandon();
        old.dispose();
      }
      await rm(oldDirectory, { recursive: true });

      const next = await openLocalWorkspace(parseOptions([]), f.paths, {}, [], f.secondCwd);
      const recoveredPath = next.workspace.active.path;
      next.persistence.start(next.workspace);
      try {
        expect(next.persistence.recovered).toBe(1);
        expect(next.workspace.files).toHaveLength(1);
        expect(dirname(recoveredPath)).toBe(next.sessions.paths.canvases);
        expect(next.sessions.forFile(next.workspace.active)?.kind).toBe('managed');
        expect(await readFile(recoveredPath, 'utf8')).toContain('Recovered 🦀界');
        expect(next.workspace.model.viewport).toEqual(view);
        expect(next.workspace.model.plane.get({ x: 14, y: 0 })?.char).toBe(dirty ? '!' : undefined);
        await expect(readFile(oldPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      } finally {
        await finish(next);
      }

      const again = await openLocalWorkspace(parseOptions([]), f.paths, {}, [], f.firstCwd);
      again.persistence.start(again.workspace);
      try {
        expect(again.workspace.active.path).toBe(recoveredPath);
        expect(again.sessions.list()).toHaveLength(1);
        expect(again.persistence.recovered).toBe(0);
        expect(again.workspace.model.viewport).toEqual(view);
      } finally {
        await finish(again);
      }
    });
  }
}

test('startup from different directories restores managed sessions, views and the active canvas', async () => {
  const f = await fixture();
  const first = await openLocalWorkspace(parseOptions([]), f.paths, {}, [], f.firstCwd);
  const id = first.sessions.forFile(first.workspace.active)!.id;
  first.persistence.start(first.workspace);
  first.workspace.model.commands.insert('Persistent 🦀');
  first.workspace.model.pan(42, -17);
  const view = { ...first.workspace.model.viewport };
  await finish(first);
  const reopened = await openLocalWorkspace(parseOptions([]), f.paths, {}, [], f.secondCwd);
  reopened.persistence.start(reopened.workspace);
  try {
    expect(reopened.restored).toBe(true);
    expect(reopened.sessions.forFile(reopened.workspace.active)?.id).toBe(id);
    expect(reopened.workspace.model.plane.get({ x: 0, y: 0 })?.char).toBe('P');
    expect(reopened.workspace.model.viewport).toEqual(view);
    expect(await readOptional(join(f.firstCwd, 'terminal-canvas.chardesk'))).toBeNull();
    expect(await readOptional(join(f.secondCwd, 'terminal-canvas.chardesk'))).toBeNull();
  } finally {
    await finish(reopened);
  }
});

test('explicit paths activate the requested external canvas after restoring the workspace', async () => {
  const f = await fixture();
  const first = await openLocalWorkspace(parseOptions([]), f.paths, {}, [], f.firstCwd);
  first.persistence.start(first.workspace);
  await finish(first);
  const next = await openLocalWorkspace(
    parseOptions(['requested.chardesk']),
    f.paths,
    {},
    [],
    f.secondCwd
  );
  next.persistence.start(next.workspace);
  try {
    expect(next.workspace.active.path).toBe(
      join(await realpath(f.secondCwd), 'requested.chardesk')
    );
    expect(next.sessions.forFile(next.workspace.active)?.kind).toBe('external');
    expect(await readOptional(join(f.secondCwd, 'requested.chardesk'))).not.toBeNull();
  } finally {
    await finish(next);
  }
});

test('closing all canvases persists an empty workspace without deleting its session catalog', async () => {
  const f = await fixture();
  const first = await openLocalWorkspace(parseOptions([]), f.paths, {}, [], f.firstCwd);
  first.persistence.start(first.workspace);
  const id = first.sessions.forFile(first.workspace.active)!.id;
  await first.sessions.close(first.workspace.active);
  await finish(first);
  const next = await openLocalWorkspace(parseOptions([]), f.paths, {}, [], f.secondCwd);
  next.persistence.start(next.workspace);
  try {
    expect(next.workspace.files).toHaveLength(0);
    expect(next.sessions.list().map((record) => record.id)).toEqual([id]);
    await next.sessions.open(id);
    expect(next.workspace.files).toHaveLength(1);
  } finally {
    await finish(next);
  }
});

test('known legacy checkpoint migration is repeatable and leaves original files unchanged', async () => {
  const f = await fixture();
  const path = join(f.firstCwd, 'terminal-canvas.chardesk');
  const old = await TerminalWorkspace.open(path);
  old.model.commands.insert('Legacy');
  const legacyPath = `${path}.workspace.json`;
  const legacy = await WorkspacePersistence.open(legacyPath);
  legacy.start(old);
  await legacy.close();
  old.dispose();
  const originalFile = await readFile(path, 'utf8'),
    originalCheckpoint = await readFile(legacyPath, 'utf8');
  const next = await openLocalWorkspace(parseOptions([]), f.paths, {}, [], f.firstCwd);
  next.persistence.start(next.workspace);
  expect(next.workspace.model.plane.get({ x: 0, y: 0 })?.char).toBe('L');
  expect(next.sessions.list()).toHaveLength(1);
  await finish(next);
  expect(await readFile(path, 'utf8')).toBe(originalFile);
  expect(await readFile(legacyPath, 'utf8')).toBe(originalCheckpoint);
  const again = await openLocalWorkspace(parseOptions([]), f.paths, {}, [], f.firstCwd);
  again.persistence.start(again.workspace);
  expect(again.sessions.list()).toHaveLength(1);
  await finish(again);
});

test('legacy settings seed the new location only when the new file is absent', async () => {
  const f = await fixture(),
    legacy = join(f.root, 'legacy.json');
  const original = JSON.stringify({ version: 1, values: { panStep: 20, selectionColor: 8 } });
  await writeFile(legacy, original);
  const settings = await TerminalSettingsStore.load(f.paths.settings, {}, legacy);
  expect(settings.values.panStep).toBe(20);
  expect(await readOptional(f.paths.settings)).toBeNull();
  settings.set('panStep', 50);
  await settings.flush();
  expect(await readFile(legacy, 'utf8')).toBe(original);
  expect((await TerminalSettingsStore.load(f.paths.settings, {}, legacy)).values.panStep).toBe(50);
});

test('a missing catalog canvas is preserved as a missing entry rather than recreated empty', async () => {
  const f = await fixture();
  const first = await openLocalWorkspace(parseOptions([]), f.paths, {}, [], f.firstCwd);
  const path = first.workspace.active.path;
  const id = first.sessions.forFile(first.workspace.active)!.id;
  await first.persistence.abandon();
  await first.sessions.dispose();
  first.workspace.dispose();
  await rm(path);
  const next = await openLocalWorkspace(parseOptions([]), f.paths, {}, [], f.secondCwd);
  try {
    expect(next.workspace.files).toHaveLength(0);
    expect(next.sessions.list()[0]?.id).toBe(id);
    expect(next.warnings[0]).toContain('missing');
    expect(await readOptional(path)).toBeNull();
    await expect(next.sessions.open(id)).rejects.toThrow('missing');
  } finally {
    await finish(next);
  }
});

test('legacy migration preserves invalid data, honors a living lock and releases its destination lock', async () => {
  const f = await fixture();
  const legacyPath = join(f.firstCwd, 'terminal-canvas.chardesk.workspace.json');
  await writeFile(legacyPath, 'invalid checkpoint');
  await expect(openLocalWorkspace(parseOptions([]), f.paths, {}, [], f.firstCwd)).rejects.toThrow();
  expect(await readFile(legacyPath, 'utf8')).toBe('invalid checkpoint');
  expect(await readOptional(`${f.paths.workspace}.lock`)).toBeNull();
  expect(await readOptional(`${legacyPath}.lock`)).toBeNull();
  expect(await readOptional(f.paths.workspace)).toBeNull();
  await rm(legacyPath);
  const legacy = await WorkspacePersistence.open(legacyPath);
  const old = TerminalWorkspace.empty();
  legacy.start(old);
  await legacy.flush();
  try {
    await expect(openLocalWorkspace(parseOptions([]), f.paths, {}, [], f.firstCwd)).rejects.toThrow(
      'already open'
    );
    expect(await readOptional(`${f.paths.workspace}.lock`)).toBeNull();
    expect(await readOptional(f.paths.workspace)).toBeNull();
    const explicit = await openLocalWorkspace(
      parseOptions(['--workspace', join(f.root, 'explicit.json')]),
      f.paths,
      {},
      [],
      f.firstCwd
    );
    expect(explicit.restored).toBe(false);
    await finish(explicit);
  } finally {
    await legacy.abandon();
    old.dispose();
  }
});

test('read-only help and snapshot commands do not create application data or workspace locks', async () => {
  const f = await fixture();
  const source = new URL('../src/main.ts', import.meta.url).pathname;
  const config = new URL('../tsconfig.json', import.meta.url).pathname;
  for (const args of [
    ['--help'],
    ['--snapshot'],
    ['--snapshot', '--blank', join(f.firstCwd, 'read-only.chardesk')],
  ]) {
    const child = Bun.spawn([process.execPath, '--tsconfig-override', config, source, ...args], {
      cwd: f.secondCwd,
      env: { ...process.env, CHARDESK_HOME: join(f.root, 'untouched') },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const stderr = new Response(child.stderr).text();
    const stdout = await new Response(child.stdout).text();
    expect(await child.exited).toBe(0);
    expect(await stderr).toBe('');
    if (args.length === 1 && args[0] === '--snapshot') {
      expect(stdout).toContain('Normal visual mode');
      expect(stdout).not.toContain('UNICODE, IN EVERY DIRECTION');
    }
  }
  expect(await readOptional(join(f.root, 'untouched', 'data', 'catalog.sqlite'))).toBeNull();
  expect(await readOptional(join(f.firstCwd, 'read-only.chardesk.workspace.json'))).toBeNull();
  expect(await readOptional(join(f.firstCwd, 'read-only.chardesk'))).toBeNull();
}, 15000);

test('explicit settings cannot overwrite the session database or its journal', async () => {
  const f = await fixture();
  for (const suffix of ['', '-journal']) {
    await expect(
      openLocalWorkspace(parseOptions([]), f.paths, {}, [f.paths.catalog + suffix], f.firstCwd)
    ).rejects.toThrow('separate filenames');
  }
});
