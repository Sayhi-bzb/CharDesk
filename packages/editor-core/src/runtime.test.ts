import { expect, test } from 'vitest';
import { FreeformEditorSession } from './runtime.js';
import { CanvasDocumentRegistry } from './CanvasDocumentRegistry.js';
test('headless commands publish one final state and share document/history with Web', () => {
  const runtime = new FreeformEditorSession();
  try {
    expect(runtime.documents).toBeInstanceOf(CanvasDocumentRegistry);
    expect(typeof globalThis.window).toBe('undefined');
    runtime.commands.beginInsert();
    const seen: Array<ReturnType<typeof runtime.getSnapshot>> = [];
    const detach = runtime.subscribe(() => seen.push(runtime.getSnapshot()));
    runtime.commands.insert('界👩🏽‍💻\nA');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.interaction.mode).toBe('text-edit');
    expect(runtime.cursor).toEqual({ x: 1, y: 1 });
    expect(runtime.documents.getCollaborationDocument('terminal-main')).not.toBeNull();
    runtime.markSaved();
    runtime.commands.insert('B');
    expect(runtime.dirty).toBe(true);
    runtime.commands.undo();
    expect(runtime.dirty).toBe(false);
    runtime.commands.redo();
    expect(runtime.plane.get({ x: 1, y: 1 })?.char).toBe('B');
    detach();
  } finally {
    runtime.dispose();
  }
});
test('overlapping Unicode range moves are one undoable document action', () => {
  const runtime = new FreeformEditorSession('A界B');
  try {
    const before = runtime.plane.materialize();
    runtime.selection = { anchor: { x: 0, y: 0 }, focus: { x: 3, y: 0 } };
    runtime.commands.moveSelection(1, 0);
    expect(runtime.plane.get({ x: 2, y: 0 })?.char).toBe('界');
    runtime.commands.undo();
    expect(runtime.plane.materialize()).toEqual(before);
    expect(runtime.canUndo).toBe(false);
  } finally {
    runtime.dispose();
  }
});

test('session commands reject asynchronous mutation transactions', () => {
  const session = new FreeformEditorSession();
  try {
    expect(() => session.editor.transact(() => Promise.resolve())).toThrow(
      'cannot span an async boundary'
    );
  } finally {
    session.dispose();
  }
});

test('session Copy forwards ANSI options to the shared formatter and transport', async () => {
  const runtime = new FreeformEditorSession('\x1b[1;31m界🦀\x1b[0m');
  const writes: Array<{
    plain: string;
    rich: string | null;
    options: { rich: boolean; ansi: boolean };
  }> = [];
  const detach = runtime.configureClipboard({
    read: async () => ({ plainText: '' }),
    write: async (payload, options) => {
      writes.push({ ...payload, options });
      return { status: 'written' };
    },
  });
  try {
    runtime.commands.selectAll();
    for (const options of [undefined, { ansi: true }]) {
      const result = runtime.commands.copy(options);
      expect(result.status).toBe('pending');
      if (result.status === 'pending') expect((await result.completion).succeeded).toBe(true);
    }
    expect(writes[0]?.plain).toBe('界🦀');
    expect(writes[0]?.rich).not.toBeNull();
    expect(writes[1]?.plain).toContain('界🦀');
    expect(writes[1]?.plain).toMatch(/\[1(?:;|m)/);
    expect(writes[1]?.rich).toBeNull();
    expect(writes[1]?.options).toEqual({ rich: false, ansi: true });
    expect(runtime.canUndo).toBe(false);
  } finally {
    detach();
    runtime.dispose();
  }
});
