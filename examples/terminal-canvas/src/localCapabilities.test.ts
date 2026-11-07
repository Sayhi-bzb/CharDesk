import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serializeCharDeskDocumentEnvelope } from '@chardesk/document';
import { executeLocal } from '../../../packages/local-runtime/src/command.ts';
import { LocalSessions } from '../../../packages/local-runtime/src/sessions.ts';
import { TerminalWorkspace } from '../../../packages/local-runtime/src/workspace.ts';
import { resolveAppPaths } from '../../../packages/local-runtime/src/appPaths.ts';
import { startLocalEndpoint } from '../../../packages/local-runtime/src/ipc.ts';

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
