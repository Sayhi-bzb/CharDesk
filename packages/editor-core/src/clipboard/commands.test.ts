import { expect, test } from 'vitest';
import { FreeformEditorSession } from '../runtime.js';
import type { ClipboardPort, ClipboardCommandResult, PreparedClipboardPaste } from './commands.js';
import type { ClipboardPayload } from './payload.js';
import type { EditorCommandResult } from '../editor/types.js';
import type { RichTextCell } from '../textCommandTypes.js';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function finish(result: EditorCommandResult<ClipboardCommandResult>) {
  expect(result.status).toBe('pending');
  if (result.status !== 'pending') throw new Error('Expected clipboard continuation');
  return result.completion;
}
function memoryClipboard() {
  let payload: ClipboardPayload = { plain: '', rich: null };
  const port: ClipboardPort = {
    write: async (data) => {
      payload = data;
      return { status: 'written' };
    },
    read: async () =>
      payload.rich
        ? { richCells: (JSON.parse(payload.rich) as { cells: RichTextCell[] }).cells }
        : { plainText: payload.plain },
  };
  return {
    port,
    get payload() {
      return payload;
    },
  };
}

test.each(['copy', 'cut'] as const)(
  '%s reports an unconfirmed dispatch without deleting content',
  async (kind) => {
    const session = new FreeformEditorSession('界A');
    try {
      session.selection = { anchor: { x: 0, y: 0 }, focus: { x: 2, y: 0 } };
      const original = session.plane.materialize();
      const selection = session.selectionBounds;
      session.configureClipboard({
        write: async () => ({ status: 'dispatched' }),
        read: async () => ({}),
      });
      expect(await finish(session.commands[kind]())).toMatchObject({
        succeeded: true,
        changed: false,
        data: { status: 'dispatched', changed: false },
      });
      expect(session.plane.materialize()).toEqual(original);
      expect(session.selectionBounds).toEqual(selection);
      expect(session.canUndo).toBe(false);
    } finally {
      session.dispose();
    }
  }
);

test('copy/cut/paste round-trip styles and Unicode and publish a single final paste state', async () => {
  const session = new FreeformEditorSession('\x1b[31;44;1m界\x1b[0mA');
  const clipboard = memoryClipboard();
  try {
    session.configureClipboard(clipboard.port);
    session.selection = { anchor: { x: 0, y: 0 }, focus: { x: 2, y: 0 } };
    const original = session.plane.materialize();
    expect((await finish(session.commands.copy())).succeeded).toBe(true);
    expect(clipboard.payload.plain).toBe('界A');
    expect(session.canUndo).toBe(false);
    expect((await finish(session.commands.cut())).succeeded).toBe(true);
    expect(session.plane.materialize().size).toBe(0);
    session.commands.undo();
    expect(session.plane.materialize()).toEqual(original);
    session.commands.pointAt({ x: 5, y: 2 });
    const snapshots: ReturnType<typeof session.getSnapshot>[] = [];
    const detach = session.subscribe(() => snapshots.push(session.getSnapshot()));
    const result = await finish(session.commands.paste());
    detach();
    expect(result.succeeded).toBe(true);
    expect(snapshots).toHaveLength(1);
    expect(session.plane.get({ x: 5, y: 2 })).toEqual(original.get('0,0'));
    expect(session.selectionBounds).toEqual({ x: 5, y: 2, width: 3, height: 1 });
    session.commands.undo();
    expect(session.plane.materialize()).toEqual(original);
  } finally {
    session.dispose();
  }
});

test('failed clipboard writes never delete and plain paste selects its result', async () => {
  const session = new FreeformEditorSession('AB');
  try {
    session.configureClipboard({
      write: async () => ({ status: 'failed' }),
      read: async () => ({ plainText: '界\nZ' }),
    });
    session.selection = { anchor: { x: 0, y: 0 }, focus: { x: 1, y: 0 } };
    const before = session.plane.materialize();
    expect(await finish(session.commands.cut())).toMatchObject({
      succeeded: false,
      reason: 'clipboard-failed',
    });
    expect(session.plane.materialize()).toEqual(before);
    expect(session.canUndo).toBe(false);
    expect((await finish(session.commands.paste())).succeeded).toBe(true);
    expect(session.selectionBounds).toEqual({ x: 0, y: 0, width: 2, height: 2 });
    expect(session.inserting).toBe(false);
  } finally {
    session.dispose();
  }
});

test.each(['selection', 'content', 'dispose', 'reconfigure'] as const)(
  'pending cut cannot delete a stale target after %s',
  async (change) => {
    const session = new FreeformEditorSession('AB');
    const write = deferred<{ status: 'written' }>();
    try {
      session.configureClipboard({ write: () => write.promise, read: async () => ({}) });
      session.selection = { anchor: { x: 0, y: 0 }, focus: { x: 1, y: 0 } };
      const pending = finish(session.commands.cut());
      if (change === 'selection') session.commands.pointAt({ x: 5, y: 0 });
      if (change === 'content')
        session.apply({
          rows: [{ y: 0, erase: [], spans: [{ x: 0, text: 'Q', color: '#000000' }] }],
        });
      if (change === 'dispose') session.dispose();
      if (change === 'reconfigure') session.configureClipboard(memoryClipboard().port);
      write.resolve({ status: 'written' });
      expect(await pending).toMatchObject({ succeeded: false, reason: 'stale-target' });
      if (change !== 'dispose') expect(session.plane.materialize().size).toBe(2);
    } finally {
      if (change !== 'dispose') session.dispose();
    }
  }
);

test.each(['selection', 'dispose'] as const)(
  'pending paste cannot write after %s',
  async (change) => {
    const session = new FreeformEditorSession('AB');
    const read = deferred<PreparedClipboardPaste>();
    session.configureClipboard({
      write: async () => ({ status: 'written' }),
      read: () => read.promise,
    });
    const pending = finish(session.commands.paste());
    if (change === 'selection') session.commands.pointAt({ x: 9, y: 0 });
    else session.dispose();
    read.resolve({ plainText: 'wrong target' });
    expect(await pending).toMatchObject({ succeeded: false, reason: 'stale-target' });
    if (change === 'selection') {
      expect(session.plane.materialize().size).toBe(2);
      session.dispose();
    }
  }
);

test('clipboard read rejection and empty data leave content/history untouched', async () => {
  const session = new FreeformEditorSession('AB');
  try {
    session.configureClipboard({
      write: async () => ({ status: 'written' }),
      read: async () => {
        throw new Error('Denied');
      },
    });
    expect(await finish(session.commands.paste())).toMatchObject({
      succeeded: false,
      reason: 'clipboard-failed',
    });
    session.configureClipboard({
      write: async () => ({ status: 'written' }),
      read: async () => ({ plainText: '' }),
    });
    expect(await finish(session.commands.paste())).toMatchObject({
      succeeded: true,
      data: { status: 'noop', reason: 'empty-clipboard' },
    });
    expect(session.plane.materialize().size).toBe(2);
    expect(session.canUndo).toBe(false);
  } finally {
    session.dispose();
  }
});

test('oversized clipboard envelopes fail before transport or deletion', async () => {
  const session = new FreeformEditorSession('A');
  let writes = 0;
  session.configureClipboard({
    read: async () => ({}),
    write: async () => {
      writes++;
      return { status: 'written' };
    },
  });
  try {
    session.selection = { anchor: { x: 0, y: 0 }, focus: { x: 0, y: 1_000_000_000 } };
    for (const operation of [() => session.commands.copy(), () => session.commands.cut()])
      expect(await finish(operation())).toMatchObject({
        succeeded: false,
        reason: 'prepare-failed',
      });
    expect(writes).toBe(0);
    expect(session.plane.get({ x: 0, y: 0 })?.char).toBe('A');
    expect(session.canUndo).toBe(false);
  } finally {
    session.dispose();
  }
});
