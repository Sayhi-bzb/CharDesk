import { describe, expect, test } from 'vitest';
import { getGraphemeCellWidth } from '@chardesk/protocol';
import { FreeformEditorSession } from './runtime.js';
import type { ClipboardCommandResult, PreparedClipboardPaste } from './clipboard/commands.js';
import type { EditorCommandResult } from './editor/types.js';

const point = (x: number, y = 0) => ({ x, y });
const pointer = (
  session: FreeformEditorSession,
  phase: 'down' | 'move' | 'up',
  x: number,
  y = 0,
  shift = false
) => session.pointer({ phase, cell: point(x, y), screen: point(x, y), delta: point(2, 1), shift });
const click = (session: FreeformEditorSession, x: number, y = 0, shift = false) => {
  pointer(session, 'down', x, y, shift);
  pointer(session, 'up', x, y);
};
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
function occupiedCells(session: FreeformEditorSession) {
  const occupied = new Set<string>();
  for (const [key, cell] of session.plane.materialize()) {
    const [x, y] = key.split(',').map(Number);
    expect(Number.isSafeInteger(x) && Number.isSafeInteger(y), `invalid anchor ${key}`).toBe(true);
    for (let offset = 0; offset < getGraphemeCellWidth(cell.char); offset++) {
      const slot = `${x! + offset},${y}`;
      expect(occupied.has(slot), `overlapping footprint ${slot}`).toBe(false);
      occupied.add(slot);
    }
  }
}

describe('Unicode delivery boundaries', () => {
  test.each(['Café', '👩🏽‍💻!', '🇨🇳🇺🇸', '1️⃣x', '각Z', 'A\t界\tB', '界\n👩🏽‍💻', 'é\tZ'])(
    'all code-point splits preserve %j',
    (text) => {
      const points = Array.from(text);
      for (let split = 1; split < points.length; split++) {
        const whole = new FreeformEditorSession(),
          chunked = new FreeformEditorSession();
        try {
          for (const session of [whole, chunked]) {
            session.commands.pointAt(point(-7, -3));
            session.commands.beginInsert();
          }
          whole.commands.insert(text);
          chunked.commands.insert(points.slice(0, split).join(''));
          chunked.commands.insert(points.slice(split).join(''));
          expect(chunked.plane.materialize(), `split ${split}`).toEqual(whole.plane.materialize());
          expect(chunked.cursor, `split ${split}`).toEqual(whole.cursor);
          occupiedCells(chunked);
        } finally {
          whole.dispose();
          chunked.dispose();
        }
      }
    }
  );
  test('newline followed by Backspace remembers the previous input cell across events', () => {
    const session = new FreeformEditorSession();
    try {
      session.commands.beginInsert();
      session.commands.insert('界');
      session.commands.insert('\n');
      session.commands.deleteBackward();
      expect(session.cursor).toEqual(point(0));
      expect(session.plane.materialize().size).toBe(0);
    } finally {
      session.dispose();
    }
  });
  test('implicit input at a negative nonzero origin keeps its newline column', () => {
    const session = new FreeformEditorSession();
    try {
      session.commands.pointAt(point(-8, -2));
      session.commands.insert('AB\nC');
      expect(session.plane.get(point(-8, -1))?.char).toBe('C');
      expect(session.cursor).toEqual(point(-7, -1));
    } finally {
      session.dispose();
    }
  });
});

describe('interrupted gestures', () => {
  test.each(['beginInsert', 'navigate', 'moveSelection'] as const)(
    '%s cancels a live range move before editing',
    (command) => {
      const session = new FreeformEditorSession('ABCD');
      try {
        click(session, 0);
        click(session, 1, 0, true);
        pointer(session, 'down', 0);
        pointer(session, 'move', 2, 1);
        expect(session.rangePreview).not.toBeNull();
        if (command === 'beginInsert') session.commands.beginInsert();
        else if (command === 'navigate') session.commands.navigate(1, 0);
        else session.commands.moveSelection(1, 0);
        const content = session.plane.materialize(),
          interaction = session.getSnapshot().interaction;
        expect(session.gestureState.type).toBe('idle');
        expect(session.rangePreview).toBeNull();
        pointer(session, 'up', 2, 1);
        expect(session.plane.materialize()).toEqual(content);
        expect(session.getSnapshot().interaction).toEqual(interaction);
      } finally {
        session.dispose();
      }
    }
  );
  test('Shift+click uses the keyboard-updated anchor rather than the previous mouse click', () => {
    const session = new FreeformEditorSession('0123456789');
    try {
      click(session, 0);
      session.commands.navigate(5, 0);
      click(session, 8, 0, true);
      expect(session.selection).toEqual({ anchor: point(5), focus: point(8) });
    } finally {
      session.dispose();
    }
  });
  test('right button input cannot replace a selection or create a drag', () => {
    const session = new FreeformEditorSession('ABCD');
    try {
      click(session, 0);
      click(session, 1, 0, true);
      const interaction = session.getSnapshot().interaction;
      session.pointer({ phase: 'down', cell: point(8), screen: point(8), button: 2 });
      session.pointer({ phase: 'up', cell: point(8), screen: point(8), button: 2 });
      expect(session.getSnapshot().interaction).toEqual(interaction);
      expect(session.gestureState.type).toBe('idle');
    } finally {
      session.dispose();
    }
  });
});

describe('clipboard races and format fallback', () => {
  test('a late older paste cannot overwrite a newer completed paste at the same cursor', async () => {
    const session = new FreeformEditorSession();
    const old = deferred<PreparedClipboardPaste>(),
      newer = deferred<PreparedClipboardPaste>();
    let reads = 0;
    try {
      session.configureClipboard({
        write: async () => ({ status: 'written' }),
        read: () => (reads++ === 0 ? old.promise : newer.promise),
      });
      const first = finish(session.commands.paste()),
        second = finish(session.commands.paste());
      newer.resolve({ plainText: 'N' });
      expect((await second).succeeded).toBe(true);
      old.resolve({ plainText: 'old' });
      expect(await first).toMatchObject({ succeeded: false, reason: 'stale-target' });
      expect(session.plane.get(point(0))?.char).toBe('N');
      expect(session.plane.materialize().size).toBe(1);
    } finally {
      session.dispose();
    }
  });
  test.each([
    { richRows: [], plainText: 'fallback' },
    { richCells: [], plainText: 'fallback' },
  ])('empty structured data falls back to plain text: %j', async (data) => {
    const session = new FreeformEditorSession();
    try {
      session.configureClipboard({ write: async () => ({ status: 'written' }), read: async () => data });
      const result = await finish(session.commands.paste());
      expect(result).toMatchObject({ succeeded: true, changed: true });
      expect(session.plane.materialize().size).toBe(8);
      expect(session.plane.get(point(0))?.char).toBe('f');
    } finally {
      session.dispose();
    }
  });
  test.each([{ richRows: [] }, { richCells: [] }])(
    'empty structured clipboard is a no-op: %j',
    async (data) => {
      const session = new FreeformEditorSession('AB');
      try {
        session.configureClipboard({ write: async () => ({ status: 'written' }), read: async () => data });
        expect(await finish(session.commands.paste())).toMatchObject({
          succeeded: true,
          changed: false,
          data: { status: 'noop', reason: 'empty-clipboard' },
        });
        expect(session.canUndo).toBe(false);
      } finally {
        session.dispose();
      }
    }
  );
  test('legacy follower placeholders cannot erase the preceding wide glyph on rich paste', async () => {
    const session = new FreeformEditorSession();
    try {
      session.configureClipboard({
        write: async () => ({ status: 'written' }),
        read: async () => ({
          richCells: [
            { x: 0, y: 0, char: '界', color: '#000000' },
            { x: 1, y: 0, char: ' ', color: '#000000' },
            { x: 2, y: 0, char: 'B', color: '#000000' },
          ],
        }),
      });
      await finish(session.commands.paste());
      expect(session.plane.get(point(0))?.char).toBe('界');
      expect(session.plane.get(point(2))?.char).toBe('B');
      occupiedCells(session);
    } finally {
      session.dispose();
    }
  });
  test('plain paste preserves the existing target background', async () => {
    const session = new FreeformEditorSession('\x1b[44mAB\x1b[0m');
    try {
      const background = session.plane.get(point(0))?.bgColor;
      expect(background).toBeTruthy();
      session.configureClipboard({
        write: async () => ({ status: 'written' }),
        read: async () => ({ plainText: 'X' }),
      });
      await finish(session.commands.paste());
      expect(session.plane.get(point(0))?.bgColor).toBe(background);
    } finally {
      session.dispose();
    }
  });
});

// Fixed seeds make long traces reproducible; expected states are stored before
// each mutation so undo/redo are checked without reusing editing planners.
test.each(Array.from({ length: 12 }, (_, i) => i + 1))(
  'seed %i: mixed edits preserve footprints, undo/redo and saved state',
  (seed) => {
    const session = new FreeformEditorSession('A界B\n👩🏽‍💻Z');
    let randomState = seed;
    const random = (max: number) => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return (randomState >>> 8) % max;
    };
    try {
      for (let step = 0; step < 60; step++) {
        session.commands.escape();
        session.commands.pointAt(point(random(17) - 8, random(9) - 4));
        if (random(2)) session.commands.navigate(random(4) + 1, random(3) - 1, true);
        const before = session.plane.materialize();
        session.markSaved();
        const version = session.version;
        const operation = random(4);
        if (operation === 0) session.commands.insert(['X', '界', '👩🏽‍💻'][random(3)]!);
        else if (operation === 1) session.commands.erase();
        else if (operation === 2) session.commands.moveSelection(random(5) - 2, random(5) - 2);
        else session.commands.pasteProvided('é\n界');
        occupiedCells(session);
        const after = session.plane.materialize();
        if (session.version !== version) {
          session.commands.undo();
          expect(session.plane.materialize(), `seed ${seed}, step ${step}, undo`).toEqual(before);
          expect(session.dirty).toBe(false);
          session.commands.redo();
          expect(session.plane.materialize(), `seed ${seed}, step ${step}, redo`).toEqual(after);
        } else expect(after).toEqual(before);
      }
    } finally {
      session.dispose();
    }
  }
);

test('starting Paste invalidates pending Cut before either IO operation finishes', async () => {
  const session = new FreeformEditorSession('AB');
  const write = deferred<{ status: 'written' }>(),
    read = deferred<PreparedClipboardPaste>();
  try {
    session.configureClipboard({ write: () => write.promise, read: () => read.promise });
    const cutting = finish(session.commands.cut());
    const pasting = finish(session.commands.paste());
    write.resolve({ status: 'written' });
    expect(await cutting).toMatchObject({ succeeded: false, reason: 'stale-target' });
    expect(session.plane.get(point(0))?.char).toBe('A');
    read.resolve({ plainText: 'N' });
    expect((await pasting).succeeded).toBe(true);
    expect(session.plane.get(point(0))?.char).toBe('N');
  } finally {
    session.dispose();
  }
});

test('reverse range multi-character input starts at the upper-left target', () => {
  const session = new FreeformEditorSession();
  try {
    session.selection = { anchor: point(3, 1), focus: point(1, -1) };
    session.commands.insert('界Z');
    expect(session.plane.get(point(1, -1))?.char).toBe('界');
    expect(session.cursor).toEqual(point(4, -1));
  } finally {
    session.dispose();
  }
});

test('reentrant editor subscribers receive the immediately preceding snapshot', () => {
  const session = new FreeformEditorSession();
  try {
    session.commands.beginInsert();
    const seen: Array<[number, number]> = [];
    const cursorX = (state: ReturnType<typeof session.getSnapshot>) =>
      state.interaction.mode === 'text-edit'
        ? state.interaction.session.activeCell.x
        : state.interaction.selection.activeCell.x;
    const stop = session.editor.subscribe((next, previous) => {
      seen.push([cursorX(previous), cursorX(next)]);
      if (cursorX(next) === 1) session.commands.insert('B');
    });
    session.commands.insert('A');
    stop();
    expect(seen).toEqual([
      [0, 1],
      [1, 2],
    ]);
    expect(session.plane.get(point(1))?.char).toBe('B');
  } finally {
    session.dispose();
  }
});

test.each([1, 2, 80])(
  'cursor remains visible after navigation in a %i-column viewport',
  (width) => {
    const session = new FreeformEditorSession();
    try {
      session.resize(width, 1);
      for (const x of [-100, 100, 0]) {
        session.commands.pointAt(point(x, -3));
        expect(session.cursor.x).toBeGreaterThanOrEqual(session.viewport.x);
        expect(session.cursor.x).toBeLessThan(session.viewport.x + session.viewport.width);
        expect(session.cursor.y).toBe(session.viewport.y);
        expect(session.canUndo).toBe(false);
      }
    } finally {
      session.dispose();
    }
  }
);
