import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serializeCharDeskDocumentEnvelope } from '@chardesk/document';
import { executeLocal } from '../../../packages/local-runtime/src/command.ts';
import { LocalSessions } from '../../../packages/local-runtime/src/sessions.ts';
import { TerminalWorkspace } from '../../../packages/local-runtime/src/workspace.ts';
import { resolveAppPaths } from '../../../packages/local-runtime/src/appPaths.ts';
import { startLocalEndpoint } from '../../../packages/local-runtime/src/ipc.ts';
import type { readCanvasSurface } from '../../../packages/canvas-capabilities/src/read.ts';

test('offline and live image reads share PNG blocks and target the current content without changing editor state', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-image-read-'));
  const previous = process.env.CHARDESK_HOME;
  process.env.CHARDESK_HOME = join(directory, 'home');
  const path = join(directory, 'work.chardesk');
  let endpoint: Awaited<ReturnType<typeof startLocalEndpoint>> | undefined;
  let sessions: LocalSessions | undefined;
  let workspace: TerminalWorkspace | undefined;
  type ReadResult = Awaited<ReturnType<typeof readCanvasSurface>>;
  const read = (input: Record<string, unknown>) =>
    executeLocal('canvas_read', input, { file: path }) as Promise<ReadResult>;
  const pixels = async (result: ReadResult) => {
    const block = result.contentBlocks.find((block) => block.type === 'image')!;
    expect(block.type).toBe('image');
    if (block.type !== 'image') throw new Error('Expected image');
    const bytes = Buffer.from(block.data, 'base64');
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const decoded = await loadImage(bytes);
    expect([decoded.width, decoded.height]).toEqual([result.image!.width, result.image!.height]);
    const canvas = createCanvas(decoded.width, decoded.height);
    const context = canvas.getContext('2d');
    context.drawImage(decoded, 0, 0);
    return context;
  };
  try {
    await writeFile(
      path,
      serializeCharDeskDocumentEnvelope({
        mode: 'freeform',
        title: 'Read',
        body: '[48;2;18;52;86m🦀界[m',
      })
    );
    const offline = await read({ representation: 'both', viewport: [1, 0, 3, 1], detail: 'low' });
    expect(offline.contentBlocks.map(({ type }) => type)).toEqual(['text', 'image']);
    expect(offline).toMatchObject({
      viewport: [1, 0, 3, 1],
      image: { width: 27, height: 20 },
      representation: 'both',
    });
    expect([...(await pixels(offline)).getImageData(0, 0, 1, 1).data]).toEqual([18, 52, 86, 255]);
    sessions = await LocalSessions.open(resolveAppPaths());
    workspace = TerminalWorkspace.empty();
    await sessions.attach(workspace);
    await sessions.openPath(path);
    const disk = await readFile(path, 'utf8');
    workspace.model.apply({
      rows: [{ y: -2, erase: [], spans: [{ x: -4, text: 'Memory', color: '#000000' }] }],
    });
    let background = '#112233';
    endpoint = await startLocalEndpoint(resolveAppPaths(), workspace, sessions, () => ({
      theme: 'dark',
      palette: { color: '#eeeeee', background },
    }));
    const viewport = { ...workspace.model.viewport },
      selection = structuredClone(workspace.model.selection),
      version = workspace.model.version;
    const live = await read({
      representation: 'both',
      style: 'appearance',
      viewport: [-4, -2, 8, 2],
      detail: 'low',
    });
    expect(live.content).toContain('Memory');
    expect(live).toMatchObject({
      appearance: { theme: 'dark' },
      structuredContent: { representation: 'both', viewport: [-4, -2, 8, 2] },
    });
    expect([...(await pixels(live)).getImageData(71, 39, 1, 1).data]).toEqual([17, 34, 51, 255]);
    background = '#223344';
    const refreshed = await read({
      representation: 'image',
      viewport: [-4, -2, 8, 2],
      detail: 'low',
    });
    expect(refreshed.content).toBe('');
    expect(refreshed.contentBlocks.map(({ type }) => type)).toEqual(['image']);
    expect([...(await pixels(refreshed)).getImageData(71, 39, 1, 1).data]).toEqual([
      34, 51, 68, 255,
    ]);
    expect(workspace.model.viewport).toEqual(viewport);
    expect(workspace.model.selection).toEqual(selection);
    expect(workspace.model.version).toBe(version);
    expect(await readFile(path, 'utf8')).toBe(disk);
  } finally {
    await endpoint?.();
    await sessions?.dispose();
    workspace?.dispose();
    if (previous === undefined) delete process.env.CHARDESK_HOME;
    else process.env.CHARDESK_HOME = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test('local capabilities save files and route live edits into the owning history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-capabilities-'));
  const previous = process.env.CHARDESK_HOME;
  process.env.CHARDESK_HOME = join(directory, 'home');
  const path = join(directory, 'work.chardesk');
  let dispose: (() => Promise<void>) | undefined;
  let sessions: LocalSessions | undefined;
  let workspace: TerminalWorkspace | undefined;
  try {
    await writeFile(
      path,
      serializeCharDeskDocumentEnvelope({ mode: 'freeform', title: 'Test', body: 'A🦀界' })
    );
    const written = (await executeLocal(
      'canvas_write',
      { at: [0, 2], content: 'Hello' },
      { file: path }
    )) as { persistence: string };
    expect(written.persistence).toBe('saved');
    const read = (await executeLocal(
      'canvas_read',
      { viewport: [0, 0, 20, 4] },
      { file: path }
    )) as { content: string };
    expect(read.content).toContain('A🦀界');
    expect(read.content).toContain('Hello');
    sessions = await LocalSessions.open(resolveAppPaths());
    workspace = TerminalWorkspace.empty();
    await sessions.attach(workspace);
    await sessions.openPath(path);
    dispose = await startLocalEndpoint(resolveAppPaths(), workspace, sessions);
    const viewport = { ...workspace.model.viewport };
    const live = (await executeLocal(
      'canvas_write',
      { at: [0, 4], content: 'Live' },
      { file: path }
    )) as { operationId: string; persistence: string };
    expect(live.persistence).toBe('saved');
    expect(live.operationId).toBeDefined();
    expect(workspace.model.plane.get({ x: 0, y: 4 })?.char).toBe('L');
    expect(workspace.model.viewport).toEqual(viewport);
    const preview = (await executeLocal(
      'canvas_code',
      { script: "await canvas.write({at:[0,6],content:'Preview'}); return 1;" },
      { file: path }
    )) as { mode: string };
    expect(preview).toMatchObject({ mode: 'preview' });
    expect(workspace.model.plane.get({ x: 0, y: 6 })).toBeUndefined();
    const applied = (await executeLocal(
      'canvas_code',
      {
        mode: 'apply',
        script:
          "await canvas.write({at:[0,6],content:'First'}); await canvas.write({at:[0,7],content:'Second'}); return 42;",
      },
      { file: path }
    )) as { operationId: string; result: number; persistence: string };
    expect(applied.result).toBe(42);
    expect(applied.persistence).toBe('saved');
    const codeUndo = (await executeLocal(
      'canvas_undo',
      { operationId: applied.operationId },
      { file: path }
    )) as { ok: boolean };
    expect(codeUndo.ok).toBe(true);
    expect(workspace.model.plane.get({ x: 0, y: 6 })).toBeUndefined();
    expect(workspace.model.plane.get({ x: 0, y: 7 })).toBeUndefined();
    const undo = (await executeLocal(
      'canvas_undo',
      { operationId: live.operationId },
      { file: path }
    )) as { ok: boolean };
    expect(undo.ok).toBe(true);
    expect(workspace.model.plane.get({ x: 0, y: 4 })).toBeUndefined();
    await dispose();
    dispose = undefined;
  } finally {
    await dispose?.();
    await sessions?.dispose();
    workspace?.dispose();
    if (previous === undefined) delete process.env.CHARDESK_HOME;
    else process.env.CHARDESK_HOME = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
