import { expect, test } from 'vitest';
import { FreeformEditorSession } from './runtime.js';
import * as Y from 'yjs';
import type { ClipboardCommandResult, PreparedClipboardPaste } from './clipboard/commands.js';
import type { EditorCommandResult } from './editor/types.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function finish(result: EditorCommandResult<ClipboardCommandResult>) {
  if (result.status !== 'pending') throw new Error(`Expected pending, got ${result.status}`);
  return result.completion;
}
const rows = (text: string): PreparedClipboardPaste => ({
  richRows: [{ y: 0, spans: [{ x: 0, text, width: text.length, color: '#000000' }] }],
});

test('provided and transported text use one preparation pipeline and publish one final commit', async () => {
  const inputs: string[] = [];
  const session = new FreeformEditorSession('', {
    prepareText: async (text) => {
      inputs.push(text);
      return rows(text.toUpperCase());
    },
  });
  session.configureClipboard({ read: async () => ({ plainText: 'ab' }), write: async () => ({ status: 'written' }) });
  const snapshots: string[] = [];
  const detach = session.subscribe(() => snapshots.push(session.version));
  try {
    const pending = finish(session.commands.paste());
    expect(session.plane.materialize().size).toBe(0);
    const before = snapshots.length;
    expect(await pending).toMatchObject({ succeeded: true, changed: true });
    expect(snapshots.length - before).toBe(1);
    session.commands.undo();
    expect(session.canUndo).toBe(false);
    expect(session.plane.materialize().size).toBe(0);
    expect(await finish(session.commands.pasteProvided('cd'))).toMatchObject({ succeeded: true });
    expect(inputs).toEqual(['ab', 'cd']);
    expect(session.plane.getCell({ x: 0, y: 0 })?.char).toBe('C');
  } finally {
    detach();
    session.dispose();
  }
});

test.each(['system', 'provided'] as const)(
  'new %s paste supersedes an older pending preparation',
  async (latest) => {
    const old = deferred<PreparedClipboardPaste>();
    const session = new FreeformEditorSession('', {
      prepareText: async (text) => (text === 'old' ? old.promise : rows('N')),
    });
    let source = 'old';
    session.configureClipboard({
      read: async () => ({ plainText: source }),
      write: async () => ({ status: 'written' }),
    });
    try {
      const first = finish(session.commands.paste());
      await Promise.resolve();
      source = 'new';
      const second =
        latest === 'system' ? session.commands.paste() : session.commands.pasteProvided('new');
      expect(await finish(second)).toMatchObject({ succeeded: true });
      old.resolve(rows('OLD'));
      expect(await first).toMatchObject({ succeeded: false, reason: 'stale-target' });
      expect(session.plane.materialize().size).toBe(1);
      expect(session.plane.getCell({ x: 0, y: 0 })?.char).toBe('N');
      session.commands.undo();
      expect(session.plane.materialize().size).toBe(0);
    } finally {
      session.dispose();
    }
  }
);

test.each(['move-back', 'edit', 'escape', 'switch', 'replace', 'detach', 'dispose'] as const)(
  '%s during preparation invalidates the captured target',
  async (change) => {
    const prepared = deferred<PreparedClipboardPaste>();
    const session = new FreeformEditorSession('', { prepareText: () => prepared.promise });
    const detach = session.configureClipboard({ read: async () => ({}), write: async () => ({ status: 'written' }) });
    try {
      const pending = finish(session.commands.pasteProvided('old'));
      await Promise.resolve();
      if (change === 'move-back') {
        session.commands.navigate(1, 0);
        session.commands.navigate(-1, 0);
      }
      if (change === 'edit') session.commands.insert('X');
      if (change === 'escape') session.commands.escape();
      if (change === 'switch') session.documents.activateDocument('other', { grid: [] });
      if (change === 'replace') {
        const replacement = new Y.Doc();
        Y.applyUpdate(
          replacement,
          Y.encodeStateAsUpdate(session.documents.getCollaborationDocument('terminal-main')!)
        );
        session.documents.adoptDocument('terminal-main', replacement);
      }
      if (change === 'detach') detach();
      if (change === 'dispose') session.dispose();
      prepared.resolve(rows('OLD'));
      expect(await pending).toMatchObject({ succeeded: false, reason: 'stale-target' });
      if (change !== 'dispose')
        expect(session.plane.materialize().size).toBe(change === 'edit' ? 1 : 0);
    } finally {
      session.dispose();
    }
  }
);

test('viewport-only pan during preparation preserves its editing target', async () => {
  const prepared = deferred<PreparedClipboardPaste>();
  const session = new FreeformEditorSession('', { prepareText: () => prepared.promise });
  try {
    const pending = finish(session.commands.pasteProvided('A'));
    await Promise.resolve();
    session.editor.transact(() => session.pan(10, 10));
    prepared.resolve(rows('A'));
    expect(await pending).toMatchObject({ succeeded: true });
    expect(session.plane.getCell({ x: 0, y: 0 })?.char).toBe('A');
  } finally {
    session.dispose();
  }
});

test('preparation failures, empty output and diagnostics do not create phantom history', async () => {
  const session = new FreeformEditorSession('', {
    prepareText: async (text) => {
      if (text === 'fail') throw new Error('compiler failed');
      return {
        ...rows(text === 'empty' ? '' : text),
        diagnostics: [{ code: 'warning', message: 'kept literal' }],
      };
    },
  });
  try {
    expect(await finish(session.commands.pasteProvided('fail'))).toMatchObject({
      succeeded: false,
      reason: 'prepare-failed',
    });
    expect(session.dirty).toBe(false);
    expect(await finish(session.commands.pasteProvided('empty'))).toMatchObject({
      succeeded: true,
      changed: false,
    });
    expect(session.canUndo).toBe(false);
    expect(session.getSnapshot().pasteDiagnostics).toEqual([
      { code: 'warning', message: 'kept literal' },
    ]);
    await finish(session.commands.pasteProvided('A'));
    session.commands.undo();
    expect(session.canUndo).toBe(false);
    expect(session.dirty).toBe(false);
  } finally {
    session.dispose();
  }
});

test('rich clipboard data bypasses text compilation and survives an injected preparer', async () => {
  const session = new FreeformEditorSession('', {
    prepareText: async () => {
      throw new Error('unexpected');
    },
  });
  session.configureClipboard({
    read: async () => ({ ...rows('R'), plainText: '**source**' }),
    write: async () => ({ status: 'written' }),
  });
  try {
    expect(await finish(session.commands.paste())).toMatchObject({ succeeded: true });
    expect(session.plane.getCell({ x: 0, y: 0 })?.char).toBe('R');
  } finally {
    session.dispose();
  }
});

test.each(['pan', 'brush'] as const)(
  '%s gesture arbitrates a pending paste without replacing an active drawing',
  async (tool) => {
    const ready = deferred<PreparedClipboardPaste>();
    const model = new FreeformEditorSession('', { prepareText: () => ready.promise });
    try {
      model.setTool(tool);
      const pending = finish(model.commands.pasteProvided('prepared'));
      await Promise.resolve();
      const at = { x: 10, y: 5 };
      model.pointer({ phase: 'down', cell: at, screen: at });
      if (tool === 'pan') model.pointer({ phase: 'up', cell: at, screen: at });
      ready.resolve(rows('PASTE'));
      const result = await pending;
      if (tool === 'pan') {
        expect(result).toMatchObject({ succeeded: true, changed: true });
        expect(model.plane.get({ x: 0, y: 0 })?.char).toBe('P');
      } else {
        expect(result).toMatchObject({ succeeded: false, reason: 'stale-target' });
        expect(model.gestureState.type).toBe('drawing');
        expect(model.plane.materialize().size).toBe(0);
        model.pointer({ phase: 'up', cell: at, screen: at });
        expect(model.plane.get(at)?.char).toBe('#');
      }
    } finally {
      model.dispose();
    }
  }
);
