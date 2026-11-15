import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { serializeCharDeskDocumentEnvelope } from '@chardesk/document';
import { LocalCanvasStore } from '../../../packages/local-runtime/src/canvasStore.ts';
import { unlinkSync, writeFileSync } from 'node:fs';
import { LocalSessions } from '../../../packages/local-runtime/src/sessions.ts';
import { CanvasFile } from '../../../packages/local-runtime/src/document.ts';
import { TerminalWorkspace } from '../../../packages/local-runtime/src/workspace.ts';
import { localCapabilities } from '../../../packages/local-runtime/src/capabilities.ts';
import { resolveAppPaths } from '../../../packages/local-runtime/src/appPaths.ts';
import { openLocalWorkspace } from '../../../packages/local-runtime/src/localWorkspace.ts';
import { parseOptions } from '../../../packages/local-runtime/src/options.ts';
import { executeLocal } from '../../../packages/local-runtime/src/command.ts';

test('version storage recognizes either side of file replacement and invalidates external changes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-versions-'));
  const path = join(directory, 'canvas.sqlite');
  let store = new LocalCanvasStore(path);
  try {
    const original = store.versionFor('canvas', 'a');
    store.prepareVersion('canvas', 'b', 'version-b');
    store.close();
    store = new LocalCanvasStore(path);
    // Crash before rename: disk still contains A.
    expect(store.versionFor('canvas', 'a')).toBe(original);
    store.prepareVersion('canvas', 'b', 'version-b');
    store.close();
    store = new LocalCanvasStore(path);
    // Crash after rename but before acknowledgement: B identifies the prepared version.
    expect(store.versionFor('canvas', 'b')).toBe('version-b');
    store.close();
    store = new LocalCanvasStore(path);
    expect(store.versionFor('canvas', 'b')).toBe('version-b');
    const external = store.versionFor('canvas', 'external');
    expect(external).not.toBe('version-b');
    expect(store.versionFor('canvas', 'b')).not.toBe('version-b');
    expect(store.versionFor('other-canvas', 'b')).not.toBe('version-b');
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('temporary CLI runtimes retain content versions for read/modify/write and reject stale or externally changed content', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-headless-version-'));
  const before = process.env.CHARDESK_HOME;
  process.env.CHARDESK_HOME = join(directory, 'home');
  const file = join(directory, 'shared.chardesk');
  try {
    await writeFile(
      file,
      serializeCharDeskDocumentEnvelope({ mode: 'freeform', title: 'Shared', body: 'OLD' })
    );
    const call = (name: string, input: Record<string, unknown>) =>
      executeLocal(name, input, { file }) as Promise<{ version: string; code?: string }>;
    const initial = await call('canvas_read', { viewport: [0, 0, 10, 2] });
    expect(await call('canvas_read', { viewport: [0, 0, 10, 2] })).toMatchObject({
      version: initial.version,
    });
    const mutation = await call('canvas_write', {
      at: [0, 1],
      content: '界🦀',
      baseVersion: initial.version,
    });
    expect(mutation).toMatchObject({ changed: true, persistence: 'saved' });
    expect(mutation.version).not.toBe(initial.version);
    expect(await call('canvas_read', { viewport: [0, 0, 10, 2] })).toMatchObject({
      version: mutation.version,
      content: expect.stringContaining('界🦀'),
    });
    expect(
      await call('canvas_write', { at: [0, 1], content: 'STALE', baseVersion: initial.version })
    ).toMatchObject({ ok: false, code: 'version_conflict' });
    await writeFile(file, (await readFile(file, 'utf8')).replace('OLD', 'EXTERNAL'));
    expect(
      await call('canvas_write', { at: [0, 1], content: 'STALE', baseVersion: mutation.version })
    ).toMatchObject({ ok: false, code: 'version_conflict' });
    expect(await readFile(file, 'utf8')).toContain('EXTERNAL');
  } finally {
    if (before === undefined) delete process.env.CHARDESK_HOME;
    else process.env.CHARDESK_HOME = before;
    await rm(directory, { recursive: true, force: true });
  }
});

test('request outcomes survive temporary runtimes and reusing an ID never overwrites intervening edits', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-idempotent-'));
  const previous = process.env.CHARDESK_HOME;
  process.env.CHARDESK_HOME = join(directory, 'home');
  const file = join(directory, 'shared.chardesk');
  try {
    await writeFile(
      file,
      serializeCharDeskDocumentEnvelope({ mode: 'freeform', title: 'Shared', body: 'OLD' })
    );
    const call = (name: string, input: Record<string, unknown>) =>
      executeLocal(name, input, { file }) as Promise<Record<string, unknown>>;
    const before = await call('canvas_read', { viewport: [0, 0, 8, 1] });
    const input = {
      at: [0, 0],
      content: 'FIRST',
      baseVersion: before.version,
      requestId: 'edit-1',
    };
    const first = await call('canvas_write', input);
    expect(first).toMatchObject({ changed: true, persistence: 'saved' });
    const next = await call('canvas_write', {
      at: [0, 0],
      content: 'SECOND',
      baseVersion: first.version,
      requestId: 'edit-2',
    });
    expect(next).toMatchObject({ changed: true, persistence: 'saved' });
    expect(await call('canvas_write', input)).toEqual(first);
    const read = await call('canvas_read', { viewport: [0, 0, 8, 1] });
    expect(read).toMatchObject({
      version: next.version,
      content: expect.stringContaining('SECOND'),
    });
    expect(await call('canvas_write', { ...input, content: 'DIFFERENT' })).toMatchObject({
      ok: false,
      code: 'request_id_conflict',
    });
    expect(await call('canvas_read', { viewport: [0, 0, 8, 1] })).toMatchObject({
      version: next.version,
    });
  } finally {
    if (previous === undefined) delete process.env.CHARDESK_HOME;
    else process.env.CHARDESK_HOME = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test('identical in-flight requests join one execution and completed results remain readable after reopening storage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-request-join-'));
  const path = join(directory, 'canvas.sqlite');
  let store = new LocalCanvasStore(path);
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const execute = async () => {
      calls++;
      await gate;
      return { version: 'v2', persistence: 'saved' };
    };
    const first = store.runRequest('canvas', 'request', 'fingerprint', execute);
    const duplicate = store.runRequest('canvas', 'request', 'fingerprint', execute);
    expect(duplicate).toBe(first);
    await Promise.resolve();
    expect(calls).toBe(1);
    release();
    expect(await first).toEqual({ version: 'v2', persistence: 'saved' });
    store.close();
    store = new LocalCanvasStore(path);
    expect(await store.runRequest('canvas', 'request', 'fingerprint', execute)).toEqual(
      await first
    );
    expect(calls).toBe(1);
  } finally {
    release();
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('SIGKILL after request reservation produces execution_unknown without dispatching the mutation again', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-request-crash-'));
  const path = join(directory, 'canvas.sqlite');
  const ready = join(directory, 'ready');
  const fixture = new URL('./requestCrash.js', import.meta.url).pathname;
  const child = Bun.spawn([process.execPath, fixture, path, ready], {
    stdout: 'ignore',
    stderr: 'pipe',
  });
  let store: LocalCanvasStore | undefined;
  try {
    const deadline = Date.now() + 5000;
    while (!(await Bun.file(ready).exists()) && child.exitCode === null) {
      if (Date.now() > deadline) throw new Error('Request reservation was not reached.');
      await Bun.sleep(2);
    }
    if (child.exitCode !== null) throw new Error(await new Response(child.stderr).text());
    child.kill('SIGKILL');
    await child.exited;
    store = new LocalCanvasStore(path);
    let dispatched = false;
    const result = await store.runRequest('canvas', 'interrupted', 'fingerprint', async () => {
      dispatched = true;
      return { changed: true };
    });
    expect(result).toMatchObject({ ok: false, code: 'execution_unknown' });
    expect(dispatched).toBe(false);
  } finally {
    child.kill();
    await child.exited;
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
}, 10000);

test.each([false, true])(
  'failed agent saves remain recoverable after reopening (external conflict: %s)',
  async (external) => {
    const directory = await mkdtemp(join(tmpdir(), 'chardesk-failed-content-'));
    const previous = process.env.CHARDESK_HOME;
    process.env.CHARDESK_HOME = join(directory, 'home');
    const file = join(directory, 'shared.chardesk');
    const source = (body: string) =>
      serializeCharDeskDocumentEnvelope({ mode: 'freeform', title: 'Shared', body });
    let sessions: LocalSessions | undefined;
    let workspace: TerminalWorkspace | undefined;
    try {
      await writeFile(file, source('OLD'));
      sessions = await LocalSessions.open(resolveAppPaths());
      workspace = TerminalWorkspace.empty();
      await sessions.attach(workspace);
      const opened = await sessions.openPath(file);
      const request = { at: [0, 0], content: 'RECOVERED', requestId: 'failed-save' };
      if (external) {
        const capture = opened.afterCapture!;
        opened.afterCapture = (snapshot) => {
          capture(snapshot);
          writeFileSync(file, source('EXTERNAL'));
        };
      } else {
        const prepare = opened.beforeSave!;
        opened.beforeSave = (snapshot) => {
          prepare(snapshot);
          throw new Error('disk unavailable');
        };
      }
      const failed = (await localCapabilities(workspace, sessions, true).execute(
        'canvas_write',
        request
      )) as { version: string; operationId?: string };
      expect(failed).toMatchObject({ changed: true, persistence: 'failed' });
      await sessions.dispose();
      sessions = undefined;
      workspace.dispose();
      workspace = undefined;
      const restored = (await executeLocal(
        'canvas_read',
        { viewport: [0, 0, 12, 1] },
        { file }
      )) as { version: string; content: string; recoveredCanvasId?: string };
      if (external) {
        expect(restored.content).toContain('EXTERNAL');
        expect(restored.recoveredCanvasId).toBeString();
        const copy = (await executeLocal(
          'canvas_read',
          { viewport: [0, 0, 12, 1] },
          { session: restored.recoveredCanvasId }
        )) as { content: string };
        expect(copy.content).toContain('RECOVERED');
        expect(await readFile(file, 'utf8')).toContain('EXTERNAL');
        const reopened = (await executeLocal(
          'canvas_read',
          { viewport: [0, 0, 12, 1] },
          { file }
        )) as { recoveredCanvasId?: string };
        expect(reopened.recoveredCanvasId).toBeUndefined();
      } else {
        expect(restored).toMatchObject({
          version: failed.version,
          content: expect.stringContaining('RECOVERED'),
        });
        expect(await readFile(file, 'utf8')).toContain('OLD');
        const replay = (await executeLocal('canvas_write', request, { file })) as {
          operationId?: string;
        };
        expect(replay).toMatchObject({
          changed: true,
          persistence: 'failed',
          version: failed.version,
        });
        expect(replay.operationId).toBeUndefined();
        expect(
          await executeLocal(
            'canvas_write',
            {
              at: [0, 1],
              content: 'SAVED',
              baseVersion: restored.version,
              requestId: 'repair-save',
            },
            { file }
          )
        ).toMatchObject({ changed: true, persistence: 'saved' });
        expect(await readFile(file, 'utf8')).toContain('RECOVERED');
        expect(await readFile(file, 'utf8')).toContain('SAVED');
      }
    } finally {
      await sessions?.dispose();
      workspace?.dispose();
      if (previous === undefined) delete process.env.CHARDESK_HOME;
      else process.env.CHARDESK_HOME = previous;
      await rm(directory, { recursive: true, force: true });
    }
  }
);

test('competing checkpoint and pending-save snapshots preserve both versions without overwriting the native file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-competing-recovery-'));
  const file = join(directory, 'shared.chardesk');
  const source = (body: string) =>
    serializeCharDeskDocumentEnvelope({ mode: 'freeform', title: 'Shared', body });
  const paths = resolveAppPaths({ environment: { CHARDESK_HOME: join(directory, 'home') } });
  let sessions: LocalSessions | undefined;
  let workspace: TerminalWorkspace | undefined;
  try {
    await writeFile(file, source('OLD'));
    sessions = await LocalSessions.open(paths);
    workspace = TerminalWorkspace.empty();
    await sessions.attach(workspace);
    const opened = await sessions.openPath(file);
    opened.beforeSave = () => {
      throw new Error('disk unavailable');
    };
    expect(
      await localCapabilities(workspace, sessions, true).execute('canvas_write', {
        at: [0, 0],
        content: 'PENDING SAVE',
      })
    ).toMatchObject({ persistence: 'failed' });
    expect(sessions.content.recoveryFor(sessions.forFile(opened)!.id)?.source).toContain(
      'PENDING SAVE'
    );
    await sessions.dispose();
    sessions = undefined;
    workspace.dispose();
    workspace = TerminalWorkspace.fromRecovery(
      new CanvasFile(opened.path, 'Shared', source('OLD')),
      source('CHECKPOINT'),
      [],
      true
    );
    sessions = await LocalSessions.open(paths);
    await sessions.attach(workspace);
    expect(workspace.model.plane.getCell({ x: 0, y: 0 })?.char).toBe('C');
    expect(workspace.dirty).toBe(true);
    const copy = sessions.list().find((record) => record.name.includes('recovered edits'))!;
    expect(copy).toBeDefined();
    expect(await readFile(copy.path, 'utf8')).toContain('PENDING SAVE');
    expect(await readFile(file, 'utf8')).toContain('OLD');
    expect(sessions.recoveryMessages).toHaveLength(1);
    await workspace.saveAll();
    expect(await readFile(file, 'utf8')).toContain('CHECKPOINT');
    expect(await readFile(copy.path, 'utf8')).toContain('PENDING SAVE');
  } finally {
    await sessions?.dispose();
    workspace?.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

async function pendingContent(directory: string) {
  const paths = resolveAppPaths({ environment: { CHARDESK_HOME: join(directory, 'home') } });
  const input = join(directory, 'external', 'canvas.chardesk');
  await mkdir(dirname(input), { recursive: true });
  await writeFile(
    input,
    serializeCharDeskDocumentEnvelope({ mode: 'freeform', title: 'Pending', body: 'OLD' })
  );
  const sessions = await LocalSessions.open(paths);
  const workspace = TerminalWorkspace.empty();
  try {
    await sessions.attach(workspace);
    const file = await sessions.openPath(input);
    file.beforeSave = () => {
      throw new Error('save interrupted');
    };
    expect(
      await localCapabilities(workspace, sessions, true).execute('canvas_write', {
        at: [0, 0],
        content: 'PENDING',
      })
    ).toMatchObject({ changed: true, persistence: 'failed' });
    return { paths, file: file.path, canvasId: sessions.forFile(file)!.id };
  } finally {
    await sessions.dispose();
    workspace.dispose();
  }
}

test.each(['file', 'parent'])(
  'missing native %s recovers a separate Canvas without applying the original request to it',
  async (missing) => {
    const directory = await mkdtemp(join(tmpdir(), 'chardesk-missing-recovery-'));
    const previous = process.env.CHARDESK_HOME;
    process.env.CHARDESK_HOME = join(directory, 'home');
    try {
      const pending = await pendingContent(directory);
      await rm(missing === 'file' ? pending.file : dirname(pending.file), {
        recursive: true,
        force: true,
      });
      const result = (await executeLocal(
        'canvas_write',
        { at: [0, 0], content: 'MUST NOT APPLY', requestId: 'original-target' },
        { file: pending.file }
      )) as { code: string; recoveredCanvasId: string };
      expect(result).toMatchObject({
        ok: false,
        code: 'canvas_recovered',
        canvasId: pending.canvasId,
      });
      expect(result.recoveredCanvasId).toBeString();
      expect(await Bun.file(pending.file).exists()).toBe(false);
      const recovered = (await executeLocal(
        'canvas_read',
        { viewport: [0, 0, 20, 1] },
        { session: result.recoveredCanvasId }
      )) as { content: string };
      expect(recovered.content).toContain('PENDING');
      expect(recovered.content).not.toContain('MUST NOT APPLY');
    } finally {
      if (previous === undefined) delete process.env.CHARDESK_HOME;
      else process.env.CHARDESK_HOME = previous;
      await rm(directory, { recursive: true, force: true });
    }
  }
);

test.each([false, true])(
  'interactive startup opens pending recovery without recreating a missing original (explicit path: %s)',
  async (explicit) => {
    const directory = await mkdtemp(join(tmpdir(), 'chardesk-startup-recovery-'));
    let opened: Awaited<ReturnType<typeof openLocalWorkspace>> | undefined;
    try {
      const pending = await pendingContent(directory);
      await rm(dirname(pending.file), { recursive: true, force: true });
      opened = await openLocalWorkspace(
        parseOptions(explicit ? [pending.file] : []),
        pending.paths,
        {},
        [],
        directory
      );
      expect(opened.workspace.model.plane.getCell({ x: 0, y: 0 })?.char).toBe('P');
      expect(opened.sessions.forFile(opened.workspace.requireActive())?.id).not.toBe(pending.canvasId);
      expect(opened.warnings.join('\n')).toContain('recovered edits');
      expect(await Bun.file(pending.file).exists()).toBe(false);
    } finally {
      if (opened) {
        await opened.persistence.abandon();
        await opened.sessions.dispose();
        opened.workspace.dispose();
      }
      await rm(directory, { recursive: true, force: true });
    }
  }
);

test.each(['publication', 'cleanup'])(
  'interruption during recovery %s resumes the same managed-copy intent',
  async (interruption) => {
    const directory = await mkdtemp(join(tmpdir(), 'chardesk-recovery-intent-'));
    let sessions: LocalSessions | undefined;
    let workspace: TerminalWorkspace | undefined;
    try {
      const pending = await pendingContent(directory);
      await writeFile(
        pending.file,
        serializeCharDeskDocumentEnvelope({ mode: 'freeform', title: 'External', body: 'EXTERNAL' })
      );
      sessions = await LocalSessions.open(pending.paths);
      workspace = TerminalWorkspace.empty();
      await sessions.attach(workspace);
      if (interruption === 'publication') {
        sessions.catalog.ready = (id) => {
          unlinkSync(sessions!.catalog.get(id)!.path);
          throw new Error('interrupted publication');
        };
      } else
        sessions.content.clearRecovery = () => {
          throw new Error('interrupted cleanup');
        };
      await expect(sessions.openPath(pending.file)).rejects.toThrow('interrupted');
      const first = sessions.list().find((record) => record.id !== pending.canvasId)!;
      expect(first).toBeDefined();
      await sessions.dispose();
      sessions = undefined;
      workspace.dispose();
      workspace = TerminalWorkspace.empty();
      sessions = await LocalSessions.open(pending.paths);
      await sessions.attach(workspace);
      const file = await sessions.openPath(pending.file);
      expect(file.recoveredCanvasId).toBe(first.id);
      expect(sessions.list().filter((record) => record.id !== pending.canvasId)).toHaveLength(1);
      expect(await readFile(sessions.catalog.get(first.id)!.path, 'utf8')).toContain('PENDING');
      expect(await readFile(pending.file, 'utf8')).toContain('EXTERNAL');
      expect(sessions.content.recoveryFor(pending.canvasId)).toBeNull();
    } finally {
      await sessions?.dispose();
      workspace?.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  }
);

test('SIGKILL after a real content commit but before recording the result never replays the write', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-postcommit-crash-'));
  const previous = process.env.CHARDESK_HOME;
  process.env.CHARDESK_HOME = join(directory, 'home');
  const file = join(directory, 'canvas.chardesk'),
    ready = join(directory, 'ready');
  await writeFile(
    file,
    serializeCharDeskDocumentEnvelope({ mode: 'freeform', title: 'Shared', body: 'OLD' })
  );
  const child = Bun.spawn(
    [
      process.execPath,
      new URL('./committedRequestCrash.js', import.meta.url).pathname,
      file,
      ready,
    ],
    { stdout: 'ignore', stderr: 'pipe', env: process.env }
  );
  try {
    const deadline = Date.now() + 5000;
    while (!(await Bun.file(ready).exists()) && child.exitCode === null) {
      if (Date.now() > deadline) throw new Error('Committed request was not reached.');
      await Bun.sleep(2);
    }
    if (child.exitCode !== null) throw new Error(await new Response(child.stderr).text());
    const committed = JSON.parse(await readFile(ready, 'utf8')) as { version: string };
    expect(committed).toMatchObject({ changed: true, persistence: 'saved' });
    child.kill('SIGKILL');
    await child.exited;
    const disk = await readFile(file, 'utf8');
    expect(disk).toContain('COMMITTED');
    expect(
      await executeLocal(
        'canvas_write',
        { at: [0, 0], content: 'COMMITTED', requestId: 'committed-request' },
        { file }
      )
    ).toMatchObject({ ok: false, code: 'execution_unknown' });
    expect(await executeLocal('canvas_read', { viewport: [0, 0, 12, 1] }, { file })).toMatchObject({
      version: committed.version,
      content: expect.stringContaining('COMMITTED'),
    });
    expect(await readFile(file, 'utf8')).toBe(disk);
  } finally {
    child.kill();
    await child.exited;
    if (previous === undefined) delete process.env.CHARDESK_HOME;
    else process.env.CHARDESK_HOME = previous;
    await rm(directory, { recursive: true, force: true });
  }
}, 10000);

test('autosave waits for recovery binding instead of replacing the pending branch before it is preserved', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-binding-barrier-'));
  let sessions: LocalSessions | undefined;
  let workspace: TerminalWorkspace | undefined;
  let release!: () => void;
  try {
    const pending = await pendingContent(directory);
    const old = await readFile(pending.file, 'utf8');
    workspace = TerminalWorkspace.fromRecovery(
      new CanvasFile(pending.file, 'Shared', old),
      serializeCharDeskDocumentEnvelope({ mode: 'freeform', title: 'Shared', body: 'CHECKPOINT' }),
      [],
      true
    );
    const capture = workspace.captureFile.bind(workspace);
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    workspace.captureFile = async (file) => {
      const snapshot = await capture(file);
      entered();
      await gate;
      return snapshot;
    };
    sessions = await LocalSessions.open(pending.paths);
    const attaching = sessions.attach(workspace);
    await ready;
    let saved = false;
    const saving = workspace.saveFile().then(() => {
      saved = true;
    });
    await Bun.sleep(50);
    expect(saved).toBe(false);
    expect(await readFile(pending.file, 'utf8')).toBe(old);
    expect(sessions.content.recoveryFor(pending.canvasId)?.source).toContain('PENDING');
    workspace.model.commands.pointAt({ x: 15, y: 0 });
    workspace.model.commands.insert('HUMAN');
    release();
    await attaching;
    await saving;
    const version = workspace.model.documents.getContentVersion();
    expect(await readFile(pending.file, 'utf8')).toContain('CHECKPOINT');
    expect(await readFile(pending.file, 'utf8')).toContain('HUMAN');
    const copy = sessions.list().find((record) => record.id !== pending.canvasId)!;
    expect(await readFile(copy.path, 'utf8')).toContain('PENDING');
    await sessions.dispose();
    sessions = undefined;
    workspace.dispose();
    workspace = TerminalWorkspace.empty();
    sessions = await LocalSessions.open(pending.paths);
    await sessions.attach(workspace);
    await sessions.openPath(pending.file);
    expect(workspace.model.documents.getContentVersion()).toBe(version);
  } finally {
    release?.();
    await sessions?.dispose();
    workspace?.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

test('session shutdown drains recovery binding before releasing its claims and journal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-binding-shutdown-'));
  let sessions: LocalSessions | undefined;
  let workspace: TerminalWorkspace | undefined;
  let release!: () => void;
  try {
    const pending = await pendingContent(directory);
    workspace = TerminalWorkspace.fromRecovery(
      new CanvasFile(pending.file, 'Shared', await readFile(pending.file, 'utf8')),
      serializeCharDeskDocumentEnvelope({ mode: 'freeform', title: 'Shared', body: 'CHECKPOINT' }),
      [],
      true
    );
    const capture = workspace.captureFile.bind(workspace);
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    workspace.captureFile = async (file) => {
      const snapshot = await capture(file);
      entered();
      await gate;
      return snapshot;
    };
    sessions = await LocalSessions.open(pending.paths);
    const attaching = sessions.attach(workspace);
    await ready;
    let closed = false;
    const closing = sessions.dispose().then(() => {
      closed = true;
    });
    await Bun.sleep(50);
    expect(closed).toBe(false);
    release();
    await attaching;
    await closing;
    sessions = await LocalSessions.open(pending.paths);
    const copy = sessions.list().find((record) => record.id !== pending.canvasId)!;
    expect(copy.status).toBe('ready');
    expect(await readFile(copy.path, 'utf8')).toContain('PENDING');
    expect(sessions.content.recoveryFor(pending.canvasId)).toBeNull();
  } finally {
    release?.();
    await sessions?.dispose();
    workspace?.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
