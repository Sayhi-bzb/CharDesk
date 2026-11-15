import { afterEach, expect, it, vi } from 'vitest';
import { FreeformEditorSession } from '@chardesk/editor-core/runtime';
import { localCapabilities } from './capabilities';
import * as compiler from '@chardesk/chargraph';
import type { TerminalWorkspace } from './workspace';
import type { LocalSessions } from './sessions';

const models: FreeformEditorSession[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  models.splice(0).forEach((model) => model.dispose());
});
const host = (persistentHistory = true) => {
  const model = new FreeformEditorSession();
  models.push(model);
  const file = { address: model.documents.getActiveAddress() };
  const workspace = {
    model,
    active: file,
    files: [file],
    saveFile: vi.fn(async () => {}),
    saveAll: vi.fn(async () => {}),
  };
  const tools = localCapabilities(
    workspace as unknown as TerminalWorkspace,
    { forFile: () => ({ id: 'test' }) } as unknown as LocalSessions,
    persistentHistory
  );
  return { model, workspace, execute: tools.execute };
};

it.each(['atomic', 'code'])(
  'the local %s host forwards the shared undoable receipt',
  async (mode) => {
    const { model, execute, workspace } = host();
    await execute('canvas_write', {
      at: [-1, 2],
      content: '  ',
      style: { bgColor: '#123456', attrs: { underline: true } },
    });
    const before = model.plane.materialize();
    const result = await (mode === 'atomic'
      ? execute('canvas_erase', { at: [-1, 2], size: [2, 1] })
      : execute('canvas_code', {
          mode: 'apply',
          script: 'return await canvas.erase({at:[-1,2],size:[2,1]});',
        }));
    expect(result).toMatchObject({
      changed: true,
      operationId: expect.any(String),
      persistence: 'saved',
    });
    expect(mode === 'atomic' ? result : (result as { result: unknown }).result).toMatchObject({
      erasedCells: 2,
      impact: { clearedCells: 2 },
    });
    expect(model.plane.materialize().size).toBe(0);
    expect(
      await execute('canvas_undo', {
        operationId: (result as { operationId: string }).operationId,
      })
    ).toMatchObject({ ok: true });
    expect(model.plane.materialize()).toEqual(before);
    expect(workspace.saveFile).toHaveBeenCalled();
  }
);

it('local no-ops and one-shot writes do not advertise unusable undo tokens', async () => {
  const { execute } = host();
  await execute('canvas_write', { at: [0, 0], content: 'A' });
  for (const result of [
    await execute('canvas_write', { at: [0, 0], content: 'A' }),
    await execute('canvas_erase', { at: [4, 4], size: [1, 1] }),
    await execute('canvas_code', {
      mode: 'apply',
      script: 'await canvas.erase({at:[4,4],size:[1,1]});',
    }),
  ]) {
    expect(result).toMatchObject({ changed: false });
    expect((result as { operationId?: string }).operationId).toBeUndefined();
  }
  const oneShot = host(false);
  const result = await oneShot.execute('canvas_write', {
    at: [0, 0],
    content: 'A',
  });
  expect(result).toMatchObject({ changed: true, persistence: 'saved' });
  expect((result as { operationId?: string }).operationId).toBeUndefined();
});

it('reads and searches expose the same content version independently of view and history state', async () => {
  const { execute, model } = host();
  await execute('canvas_write', { at: [0, 0], content: 'A界🦀' });
  const version = model.documents.getContentVersion();
  expect(await execute('canvas_read', { viewport: [0, 0, 8, 1] })).toMatchObject({ version });
  expect(await execute('canvas_search', { query: '界' })).toMatchObject({ version });
  model.pan(10, 10);
  model.documents.clearHistory();
  expect(await execute('canvas_read', { viewport: [0, 0, 8, 1] })).toMatchObject({ version });
  model.commands.pointAt({ x: 0, y: 0 });
  model.commands.insert('B');
  const next = await execute('canvas_read', { viewport: [0, 0, 8, 1] });
  expect(next).toMatchObject({ version: model.documents.getContentVersion() });
  expect((next as { version: string }).version).not.toBe(version);
});

it('a read remains bound to its captured content and version when presentation triggers another edit', async () => {
  const { workspace, model, execute } = host();
  await execute('canvas_write', { at: [0, 0], content: 'OLD' });
  const version = model.documents.getContentVersion();
  const tools = localCapabilities(
    workspace as unknown as TerminalWorkspace,
    { forFile: () => ({ id: 'test' }) } as unknown as LocalSessions,
    true,
    undefined,
    (snapshot) => {
      model.commands.pointAt({ x: 0, y: 0 });
      model.commands.insert('NEW');
      return snapshot;
    }
  );
  const result = await tools.execute('canvas_read', { viewport: [0, 0, 3, 1] });
  expect(result).toMatchObject({ version, content: expect.stringContaining('OLD') });
  expect((result as { content: string }).content).not.toContain('NEW');
  expect(model.plane.getCell({ x: 0, y: 0 })?.char).toBe('N');
  expect(model.documents.getContentVersion()).not.toBe(version);
});

it('two clients cannot commit against the same base version, and stale undo cannot change content', async () => {
  const { execute, model, workspace } = host();
  const baseVersion = model.documents.getContentVersion();
  const [first, second] = await Promise.all([
    execute('canvas_write', { at: [0, 0], content: 'FIRST', baseVersion }),
    execute('canvas_write', { at: [0, 0], content: 'SECOND', baseVersion }),
  ]);
  expect(first).toMatchObject({
    changed: true,
    version: model.documents.getContentVersion(),
    persistence: 'saved',
  });
  expect(second).toMatchObject({
    ok: false,
    code: 'version_conflict',
    baseVersion,
    currentVersion: model.documents.getContentVersion(),
  });
  expect(model.plane.getCell({ x: 0, y: 0 })?.char).toBe('F');
  expect(workspace.saveFile).toHaveBeenCalledTimes(1);
  const operationId = (first as { operationId: string }).operationId;
  expect(await execute('canvas_undo', { operationId, baseVersion })).toMatchObject({
    ok: false,
    code: 'version_conflict',
  });
  expect(
    await execute('canvas_undo', { operationId, baseVersion: model.documents.getContentVersion() })
  ).toMatchObject({ ok: true, persistence: 'saved' });
  expect(model.plane.materialize().size).toBe(0);
});

it.each([true, false])(
  'render preparation rechecks the accepted version after human edits (explicit precondition: %s)',
  async (explicit) => {
    const { execute, model, workspace } = host();
    let finish!: (result: Awaited<ReturnType<typeof compiler.compileCharDeskText>>) => void;
    const prepared = compiler.compileCharDeskText('AGENT', { format: 'plain' });
    vi.spyOn(compiler, 'compileCharDeskText').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const baseVersion = model.documents.getContentVersion();
    const pending = execute('canvas_render', {
      at: [0, 0],
      source: 'AGENT',
      ...(explicit ? { baseVersion } : {}),
    });
    model.commands.insert('HUMAN');
    const humanVersion = model.documents.getContentVersion();
    finish(await prepared);
    expect(await pending).toMatchObject({
      ok: false,
      code: 'version_conflict',
      baseVersion,
      currentVersion: humanVersion,
    });
    expect(model.plane.getCell({ x: 0, y: 0 })?.char).toBe('H');
    expect(workspace.saveFile).not.toHaveBeenCalled();
    model.commands.undo();
    expect(model.plane.materialize().size).toBe(0);
  }
);

it('agent writes preserve the human view and cancel stale gestures without settling a new range', async () => {
  const { execute, model } = host();
  model.commands.insert('ABCDE');
  model.commands.pointAt({ x: 1, y: 0 });
  const before = model.viewAt(model.documents.getActiveAddress());
  model.pointer({ phase: 'down', cell: { x: 7, y: 0 }, screen: { x: 7, y: 0 } });
  model.pointer({ phase: 'move', cell: { x: 10, y: 0 }, screen: { x: 10, y: 0 } });
  expect(model.gestureState.type).not.toBe('idle');
  expect(await execute('canvas_write', { at: [0, 3], content: 'AGENT' })).toMatchObject({
    changed: true,
  });
  expect(model.gestureState.type).toBe('idle');
  expect(model.viewAt(model.documents.getActiveAddress())).toEqual(before);
  model.pointer({ phase: 'up', cell: { x: 10, y: 0 }, screen: { x: 10, y: 0 } });
  expect(model.viewAt(model.documents.getActiveAddress())).toEqual(before);
});

it('a one-shot Code save failure reports the applied mutation without an undo token', async () => {
  const { execute, workspace, model } = host(false);
  workspace.saveFile.mockRejectedValueOnce(new Error('disk failure'));
  const result = await execute('canvas_code', {
    mode: 'apply',
    script: 'await canvas.write({at:[0,0],content:"A"});',
  });
  expect(result).toMatchObject({ changed: true, persistence: 'failed' });
  expect((result as { operationId?: string }).operationId).toBeUndefined();
  expect(model.plane.get({ x: 0, y: 0 })?.char).toBe('A');
});

it.each([false, true])(
  'Code preparation isolates earlier writes while human edits survive a %s script failure',
  async (fail) => {
    const { execute, model, workspace } = host();
    const rendered = await compiler.compileCharDeskText('AGENT', { format: 'plain' });
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(compiler, 'compileCharDeskText').mockImplementationOnce(async () => {
      entered();
      await gate;
      return rendered;
    });
    const baseVersion = model.documents.getContentVersion();
    const pending = execute('canvas_code', {
      mode: 'apply',
      baseVersion,
      script: `await canvas.write({at:[0,0],content:'FIRST'}); await canvas.render({at:[0,1],source:'AGENT',format:'raw'}); ${fail ? "throw new Error('script failed');" : 'return 42;'}`,
    });
    await ready;
    expect(model.plane.materialize().size).toBe(0);
    model.commands.insert('HUMAN');
    const humanVersion = model.documents.getContentVersion();
    release();
    expect(await pending).toMatchObject(
      fail
        ? { ok: false, message: 'script failed' }
        : { ok: false, code: 'version_conflict', baseVersion, currentVersion: humanVersion }
    );
    expect(model.plane.getCell({ x: 0, y: 0 })?.char).toBe('H');
    expect(model.plane.getCell({ x: 0, y: 1 })).toBeUndefined();
    expect(workspace.saveFile).not.toHaveBeenCalled();
    model.commands.undo();
    expect(model.plane.materialize().size).toBe(0);
  }
);

it('Code publishes one final content transaction and one undoable edit, including read-after-write in the draft', async () => {
  const { execute, model } = host();
  const frames: string[] = [];
  const detach = model.documents.subscribeContent(() =>
    frames.push([...model.plane.materialize().values()].map((cell) => cell.char).join(''))
  );
  const result = await execute('canvas_code', {
    mode: 'apply',
    script:
      "await canvas.write({at:[0,0],content:'OLD'}); await canvas.write({at:[0,0],content:'NEW界🦀'}); return await canvas.read({viewport:[0,0,8,1]});",
  });
  expect(result).toMatchObject({
    changed: true,
    version: model.documents.getContentVersion(),
    operationId: expect.any(String),
    persistence: 'saved',
    result: { content: expect.stringContaining('NEW界🦀') },
  });
  expect(frames).toEqual(['NEW界🦀']);
  detach();
  model.commands.undo();
  expect(model.plane.materialize().size).toBe(0);
});

it('Code undo is staged until success and updates the original history instead of adding an inverse edit', async () => {
  const { execute, model } = host();
  const written = await execute('canvas_write', { at: [0, 0], content: 'A' });
  const operationId = (written as { operationId: string }).operationId;
  const script = `await canvas.undo({operationId:${JSON.stringify(operationId)}});`;
  expect(
    await execute('canvas_code', { mode: 'apply', script: script + "throw new Error('stop');" })
  ).toMatchObject({ ok: false, message: 'stop' });
  expect(model.plane.getCell({ x: 0, y: 0 })?.char).toBe('A');
  expect(await execute('canvas_code', { mode: 'apply', script })).toMatchObject({
    changed: true,
    persistence: 'saved',
  });
  expect(model.plane.materialize().size).toBe(0);
  expect(model.canUndo).toBe(false);
  model.commands.redo();
  expect(model.plane.getCell({ x: 0, y: 0 })?.char).toBe('A');
});

it('a rejected primitive or lifecycle operation cannot leave earlier Code writes in the live document', async () => {
  const { execute, model } = host();
  for (const action of [
    'await canvas.fill({at:[0,0],size:[1,1],style:{invalid:true}});',
    "await canvas.manage({action:'create',name:'unexpected'});",
  ]) {
    expect(
      await execute('canvas_code', {
        mode: 'apply',
        script: "await canvas.write({at:[0,0],content:'BAD'});" + action,
      })
    ).toMatchObject({ ok: false });
    expect(model.plane.materialize().size).toBe(0);
    expect(model.canUndo).toBe(false);
  }
});

it('aborting render preparation cannot commit after its transport has gone away', async () => {
  const { execute, model, workspace } = host();
  const rendered = await compiler.compileCharDeskText('ABORTED', { format: 'plain' });
  let release!: () => void;
  vi.spyOn(compiler, 'compileCharDeskText').mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return rendered;
  });
  const controller = new AbortController();
  const before = model.documents.getContentVersion();
  const pending = execute(
    'canvas_render',
    { at: [0, 0], source: 'ABORTED' },
    { signal: controller.signal }
  );
  controller.abort();
  release();
  expect(await pending).toMatchObject({ ok: false, code: 'operation_failed' });
  expect(model.documents.getContentVersion()).toBe(before);
  expect(model.plane.materialize().size).toBe(0);
  expect(workspace.saveFile).not.toHaveBeenCalled();
});

it('preparing Code on one Canvas does not block another Canvas or change the human active view', async () => {
  const { model, workspace } = host();
  const first = workspace.active;
  model.documents.registerDocument('other', { grid: [] });
  const second = { address: model.documents.getDocumentAddress('other')! };
  workspace.files.push(second);
  const tools = localCapabilities(
    workspace as unknown as TerminalWorkspace,
    {
      forFile: (file: typeof first) => ({ id: file === first ? 'first' : 'second' }),
    } as unknown as LocalSessions,
    true
  );
  const rendered = await compiler.compileCharDeskText('A', { format: 'plain' });
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(compiler, 'compileCharDeskText').mockImplementationOnce(async () => {
    entered();
    await gate;
    return rendered;
  });
  const active = model.documents.getActiveAddress();
  const view = model.viewAt(active);
  const pending = tools.execute('canvas_code', {
    canvasId: 'first',
    mode: 'apply',
    script: "await canvas.render({at:[0,0],source:'A',format:'raw'});",
  });
  await ready;
  expect(
    await tools.execute('canvas_write', { canvasId: 'second', at: [0, 0], content: 'B' })
  ).toMatchObject({ changed: true, persistence: 'saved' });
  expect(model.documents.getContentReader('other')!.getCell({ x: 0, y: 0 })?.char).toBe('B');
  expect(model.documents.getActiveAddress()).toEqual(active);
  expect(model.viewAt(active)).toEqual(view);
  release();
  expect(await pending).toMatchObject({ changed: true, persistence: 'saved' });
  expect(model.plane.getCell({ x: 0, y: 0 })?.char).toBe('A');
  expect(model.documents.getContentReader('other')!.getCell({ x: 0, y: 0 })?.char).toBe('B');
  expect(workspace.saveFile).toHaveBeenNthCalledWith(1, second);
  expect(workspace.saveFile).toHaveBeenNthCalledWith(2, first);
});

it('a retired file handle cannot commit into a reopened target after render preparation', async () => {
  const { execute, model, workspace } = host();
  const rendered = await compiler.compileCharDeskText('LATE', { format: 'plain' });
  let release!: () => void;
  vi.spyOn(compiler, 'compileCharDeskText').mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return rendered;
  });
  const version = model.documents.getContentVersion();
  const pending = execute('canvas_render', { at: [0, 0], source: 'LATE' });
  workspace.files.splice(0, 1, { address: model.documents.getActiveAddress() });
  release();
  expect(await pending).toMatchObject({ ok: false, code: 'canvas_not_found' });
  expect(model.documents.getContentVersion()).toBe(version);
  expect(model.plane.materialize().size).toBe(0);
  expect(workspace.saveFile).not.toHaveBeenCalled();
});
