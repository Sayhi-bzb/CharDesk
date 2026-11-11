import { afterEach, describe, expect, it } from 'vitest';
import { createCanvasRuntime, type CanvasRuntime } from '@/domains/canvas/public';
import { createSelectionCommandFactory } from '@/domains/actions/public';
import { CanvasActivityStore } from '@/shared/canvas-activity/model';
import { connectCanvasActivity } from './canvasActivity';
import { createCanvasCodeTool } from './site-tools/canvasCode';
import { createCanvasEraseTool, createCanvasFillTool, createCanvasManageTool, createCanvasSearchTool, createCanvasUndoTool, createCanvasWriteTool } from './site-tools/canvasTools';

const disposers: (() => void)[] = [];
afterEach(() => disposers.splice(0).reverse().forEach((dispose) => dispose()));
async function host() {
  const canvas: CanvasRuntime = createCanvasRuntime({
    persistence: false,
    selectionCommands: createSelectionCommandFactory({ renderClipboardText: async () => ({ kind: 'spans', renderer: 'raw', pipeline: [], rows: [], width: 0, height: 0, diagnostics: [] }) }),
    parseSessionSource: async () => ({ mode: 'freeform', grid: [] }),
    initialSessions: [{ id: 'canvas-a', name: 'A', mode: 'freeform', grid: [] }],
  });
  await canvas.ready;
  disposers.push(() => canvas.dispose());
  const activity = new CanvasActivityStore();
  disposers.push(connectCanvasActivity(canvas, activity));
  const write = createCanvasWriteTool(canvas);
  const erase = createCanvasEraseTool(canvas);
  const code = createCanvasCodeTool({
    read: { name: 'canvas_read', description: '', inputSchema: {}, execute: () => ({}) },
    search: createCanvasSearchTool(canvas), manage: createCanvasManageTool(canvas), write, erase,
    history: canvas.commands.history,
  });
  return { canvas, activity, write, erase, code };
}

describe('Activity follows actual Canvas changes', () => {
  it('aggregates tool calls and clears a drag-selected range through ordinary Delete', async () => {
    const { canvas, activity, write } = await host();
    for (let i = 0; i < 20; i++) await write.execute({ at: [i, 0], content: 'a' });
    expect(activity.getSnapshot()).toHaveLength(1);
    expect(activity.getSnapshot()[0].ranges).toEqual([{ y: 0, from: 0, to: 20 }]);
    canvas.commands.staticGrid.setSelectionRange({ start: { x: 0, y: 0 }, end: { x: 19, y: 0 } });
    canvas.commands.staticGrid.delete('backward');
    expect(activity.getSnapshot()).toEqual([]);
  });

  it('removes only the changed Cells after human deletion/overwrite', async () => {
    const { canvas, activity, write } = await host();
    await write.execute({ at: [0, 0], content: 'abcdef' });
    canvas.commands.text.eraseAt({ x: 1, y: 0 }, [2, 1]);
    canvas.commands.text.writeRowsAt([{ y: 0, spans: [{ x: 0, width: 1, text: 'X', color: '#123456' }] }], { x: 4, y: 0 }, 'patch');
    expect(activity.getSnapshot()[0].ranges).toEqual([
      { y: 0, from: 0, to: 1 }, { y: 0, from: 3, to: 4 }, { y: 0, from: 5, to: 6 },
    ]);
  });

  it('tracks both Cells of wide glyphs, including deleting via the trailing Cell', async () => {
    const { canvas, activity, write } = await host();
    await write.execute({ at: [0, 0], content: '🦀你' });
    expect(activity.getSnapshot()[0].ranges).toEqual([{ y: 0, from: 0, to: 4 }]);
    canvas.commands.text.eraseAt({ x: 1, y: 0 }, [1, 1]);
    expect(activity.getSnapshot()[0].ranges).toEqual([{ y: 0, from: 2, to: 4 }]);
    canvas.commands.text.eraseAt({ x: 3, y: 0 }, [1, 1]);
    expect(activity.getSnapshot()).toEqual([]);
  });

  it('does not report a no-op write or blank erase', async () => {
    const { activity, write, erase } = await host();
    await write.execute({ at: [0, 0], content: 'same' });
    const journal = activity.getJournal();
    await write.execute({ at: [0, 0], content: 'same' });
    await erase.execute({ at: [100, 100], size: [10, 10] });
    expect(activity.getJournal()).toBe(journal);
  });

  it('uses the effective diff so an unchanged span cannot recreate an already observed hint', async () => {
    const { activity, write } = await host();
    await write.execute({ at: [0, 0], content: 'abcdef' });
    const changes = activity.getSnapshot()[0].changes;
    activity.record({ kind: 'seen', changes, ranges: [{ y: 0, from: 0, to: 6 }] });
    await write.execute({ at: [0, 0], content: 'abcXef' });
    expect(activity.getSnapshot()[0].ranges).toEqual([{ y: 0, from: 3, to: 4 }]);
  });

  it('clears hints through ordinary undo, without requiring canvas_undo', async () => {
    const { canvas, activity, write } = await host();
    await write.execute({ at: [0, 0], content: 'new' });
    canvas.commands.history.undo();
    expect(activity.getSnapshot()).toEqual([]);
    canvas.commands.history.redo();
    expect(activity.getSnapshot()).toEqual([]);
  });

  it('gives composed scripts one region and clears it through their operation receipt', async () => {
    const { canvas, activity, code } = await host();
    const result = await code.execute({ mode: 'apply', script: 'for (let x=0;x<12;x++) await canvas.write({at:[x,0],content:"X"});' }) as { operationId: string };
    expect(activity.getSnapshot()).toHaveLength(1);
    expect(activity.getSnapshot()[0].ranges).toEqual([{ y: 0, from: 0, to: 12 }]);
    expect(await createCanvasUndoTool(canvas).execute({ operationId: result.operationId })).toMatchObject({ undone: true });
    expect(activity.getSnapshot()).toEqual([]);
  });

  it('does not leave notifications for rolled-back scripts', async () => {
    const { activity, code } = await host();
    expect(await code.execute({ mode: 'apply', script: 'await canvas.write({at:[0,0],content:"X"}); throw new Error("stop");' })).toMatchObject({ ok: false });
    expect(activity.getSnapshot()).toEqual([]);
  });

  it('keeps styled spaces and fill changes in the same lifecycle', async () => {
    const { canvas, activity, write } = await host();
    await write.execute({ at: [0, 0], content: ' ', style: { bgColor: '#123456' } });
    expect(activity.getSnapshot()[0].ranges).toEqual([{ y: 0, from: 0, to: 1 }]);
    await createCanvasFillTool(canvas).execute({ at: [0, 0], size: [1, 1], style: { bgColor: '#654321' } });
    expect(activity.getSnapshot()).toHaveLength(1);
    canvas.commands.text.eraseAt({ x: 0, y: 0 }, [1, 1]);
    expect(activity.getSnapshot()).toEqual([]);
  });

  it('scopes agent writes to their actual page and clears page removal', async () => {
    const { canvas, activity, write } = await host();
    canvas.commands.sessions.create('slide');
    const canvasId = canvas.getState().activeCanvasId;
    const firstPage = canvas.documents.getActivePageId();
    await write.execute({ at: [0, 0], content: 'A' });
    canvas.commands.slides.addWithOptions('Notes');
    const secondPage = canvas.documents.getActivePageId();
    await write.execute({ at: [0, 0], content: 'B' });
    expect(activity.getSnapshot().map((m) => m.pageId)).toEqual([firstPage, secondPage]);
    canvas.documents.removePage(canvasId, secondPage);
    expect(activity.getSnapshot().map((m) => m.pageId)).toEqual([firstPage]);
  });
});
