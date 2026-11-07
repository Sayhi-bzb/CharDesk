import { expect, test } from 'vitest';
import { FreeformEditorSession } from '../runtime.js';

const point = (x: number, y = 0) => ({ x, y });
function pointer(
  session: FreeformEditorSession,
  phase: 'down' | 'move' | 'up',
  x: number,
  y = 0,
  options: { shift?: boolean; append?: boolean; delta?: { x: number; y: number } } = {}
) {
  session.pointer({ phase, cell: point(x, y), screen: point(x, y), ...options });
}
function click(session: FreeformEditorSession, x: number, y = 0, shift = false) {
  pointer(session, 'down', x, y, { shift });
  pointer(session, 'up', x, y);
}

test('click and Shift+click use the same anchor and include complete wide graphemes', () => {
  const session = new FreeformEditorSession('A界B');
  try {
    click(session, 0);
    click(session, 2, 0, true);
    expect(session.selection).toEqual({ anchor: point(0), focus: point(1) });
    expect(session.selectionBounds).toEqual({ x: 0, y: 0, width: 3, height: 1 });
    expect(session.canUndo).toBe(false);
    session.commands.insert('X');
    expect(session.plane.materialize().size).toBe(4);
    expect(session.selectionBounds?.width).toBe(2);
    session.commands.undo();
    expect(session.plane.get(point(1))?.char).toBe('界');
  } finally {
    session.dispose();
  }
});

test('range movement previews without document/history writes, commits once, and cancels cleanly', () => {
  const session = new FreeformEditorSession('A界B');
  try {
    click(session, 0);
    click(session, 2, 0, true);
    const original = session.plane.materialize();
    const version = session.version;
    pointer(session, 'down', 1);
    expect(session.gestureState.type).toBe('rangeMovePending');
    pointer(session, 'move', 2, 1, { delta: point(1, 1) });
    expect(session.gestureState.type).toBe('movingRange');
    expect(session.plane.materialize()).toEqual(original);
    expect(session.frame().source.get(point(2, 1))?.char).toBe('界');
    expect(session.frame().source.get(point(0))).toBeUndefined();
    expect(session.version).toBe(version);
    expect(session.canUndo).toBe(false);
    session.commands.escape();
    expect(session.rangePreview).toBeNull();
    expect(session.plane.materialize()).toEqual(original);
    expect(session.canUndo).toBe(false);
    // Escape clears selection after canceling. Re-select and commit the drag.
    click(session, 0);
    click(session, 2, 0, true);
    const seen: string[] = [];
    const stop = session.subscribe(() => seen.push(session.gestureState.type));
    pointer(session, 'down', 1);
    pointer(session, 'move', 2, 1, { delta: point(1, 1) });
    pointer(session, 'up', 2, 1);
    stop();
    expect(seen).toEqual(['rangeMovePending', 'movingRange', 'idle']);
    expect(session.plane.get(point(2, 1))?.char).toBe('界');
    expect(session.rangePreview).toBeNull();
    session.commands.undo();
    expect(session.plane.materialize()).toEqual(original);
    expect(session.canUndo).toBe(false);
  } finally {
    session.dispose();
  }
});

test('cancel restores the prior selection, append fills/deletes disjoint ranges, and Hand preserves history', () => {
  const session = new FreeformEditorSession('ABCD');
  try {
    click(session, 0);
    click(session, 1, 0, true);
    const selection = session.selection;
    pointer(session, 'down', 8);
    pointer(session, 'move', 10, 0, { delta: point(2) });
    session.cancelInteraction();
    expect(session.selection).toEqual(selection);
    pointer(session, 'down', 3, 0, { append: true });
    pointer(session, 'up', 3);
    session.commands.insert('Q');
    expect([...session.plane.materialize().values()].map((c) => c.char).join('')).toBe('QQCQ');
    const version = session.version;
    session.setTool('pan');
    pointer(session, 'down', 5, 5);
    pointer(session, 'move', 8, 3, { delta: point(3, -2) });
    pointer(session, 'up', 8, 3);
    expect(session.viewport.x).toBe(-6);
    expect(session.viewport.y).toBe(0);
    expect(session.version).toBe(version);
    session.commands.erase();
    expect(session.plane.get(point(2))?.char).toBe('C');
    expect(session.plane.materialize().size).toBe(1);
  } finally {
    session.dispose();
  }
});

test('clicking an existing range collapses it, then typing and Shift+click use the new anchor', () => {
  const session = new FreeformEditorSession('ABCDE');
  try {
    click(session, 0);
    click(session, 4, 0, true);
    click(session, 2);
    expect(session.selection).toBeNull();
    expect(session.cursor).toEqual(point(2));
    expect(session.canUndo).toBe(false);
    click(session, 4, 0, true);
    expect(session.selection).toEqual({ anchor: point(2), focus: point(4) });
    click(session, 2);
    session.commands.insert('Z');
    expect([...session.plane.materialize().values()].map((c) => c.char).join('')).toBe('ABZDE');
    session.commands.undo();
    expect(session.plane.get(point(2))?.char).toBe('C');
  } finally {
    session.dispose();
  }
});

test('a bounding-box hole starts a new selection instead of moving the old range', () => {
  const session = new FreeformEditorSession('A界\nABC');
  try {
    click(session, 0);
    click(session, 1, 1, true);
    expect(session.selectionCoverage.contains(point(2, 1))).toBe(false);
    pointer(session, 'down', 2, 1);
    expect(session.gestureState.type).toBe('selecting');
    pointer(session, 'up', 2, 1);
    expect(session.selection).toBeNull();
    expect(session.cursor).toEqual(point(2, 1));
    expect(session.canUndo).toBe(false);
  } finally {
    session.dispose();
  }
});

for (const glyph of ['界', '👩🏽‍💻']) {
  test(`${glyph}: move preview coverage equals committed coverage and cancellation restores selection`, () => {
    const session = new FreeformEditorSession(`ABC\n${glyph}BC\nABC`);
    try {
      click(session, 1);
      click(session, 2, 2, true);
      const original = session.selectionCoverage.areas;
      for (const cancel of [true, false]) {
        pointer(session, 'down', 1);
        pointer(session, 'move', 6, 0, { delta: point(5) });
        const presentation = session.selectionPresentation;
        expect(presentation.phase).toBe('moving');
        expect(presentation.coverage.contains(point(5, 1))).toBe(true);
        expect(presentation.coverage.contains(point(6, 1))).toBe(true);
        expect(presentation.coverage.contains(point(5))).toBe(false);
        expect(session.canUndo).toBe(false);
        if (cancel) {
          session.cancelInteraction();
          expect(session.selectionCoverage.areas).toEqual(original);
          expect(session.selectionPresentation.phase).toBe('resting');
        } else {
          pointer(session, 'up', 6);
          expect(session.selectionCoverage.areas).toEqual(presentation.coverage.areas);
          session.commands.undo();
          expect(session.plane.get(point(0, 1))?.char).toBe(glyph);
        }
      }
    } finally {
      session.dispose();
    }
  });
}

test('append preview expands a wide follower and committing uses the release coordinate', () => {
  const session = new FreeformEditorSession('AB\n界C');
  try {
    click(session, 1);
    pointer(session, 'down', 1, 1, { append: true });
    expect(session.selectionPresentation.phase).toBe('selecting');
    expect(session.selectionPresentation.coverage.contains(point(0, 1))).toBe(true);
    expect(session.selectionPresentation.coverage.contains(point(1, 1))).toBe(true);
    pointer(session, 'up', 2, 1);
    expect(session.selectionCoverage.contains(point(2, 1))).toBe(true);
    expect(session.selectionCoverage.contains(point(0, 1))).toBe(true);
    expect(session.canUndo).toBe(false);
  } finally {
    session.dispose();
  }
});

test('Shift+click follows keyboard and document selection rather than a tool-local anchor', () => {
  const session = new FreeformEditorSession('ABCDE');
  try {
    click(session, 1);
    session.commands.navigate(1, 0);
    click(session, 4, 0, true);
    expect(session.selection).toEqual({ anchor: point(2), focus: point(4) });
    session.setTool('pan');
    session.setTool('select');
    click(session, 0, 0, true);
    expect(session.selection).toEqual({ anchor: point(2), focus: point(0) });
  } finally {
    session.dispose();
  }
});

for (const operation of ['copy', 'delete', 'fill', 'move'] as const) {
  test(`${operation} respects physical row coverage and leaves its envelope hole untouched`, async () => {
    const session = new FreeformEditorSession('A界\nABC');
    try {
      click(session, 0);
      click(session, 1, 1, true);
      const original = session.plane.materialize();
      if (operation === 'copy') {
        let plain = '';
        session.configureClipboard({
          read: async () => ({}),
          write: async (payload) => {
            plain = payload.plain;
            return { status: 'written' };
          },
        });
        const result = session.commands.copy();
        if (result.status === 'pending') await result.completion;
        expect(plain).toBe('A界\nAB');
        expect(session.canUndo).toBe(false);
      } else {
        if (operation === 'delete') session.commands.erase();
        if (operation === 'fill') session.commands.insert('Q');
        if (operation === 'move') {
          session.commands.moveSelection(-5, -3);
          expect(session.plane.get(point(-5, -3))?.char).toBe('A');
          expect(session.plane.get(point(-4, -3))?.char).toBe('界');
          expect(session.selectionCoverage.contains(point(-3, -2))).toBe(false);
        }
        expect(session.plane.get(point(2, 1))?.char).toBe('C');
        session.commands.undo();
        expect(session.plane.materialize()).toEqual(original);
      }
    } finally {
      session.dispose();
    }
  });
}

for (const operation of ['fill', 'style', 'copy', 'cut', 'paste'] as const) {
  test(`${operation} targets the visible selection before pointer release`, async () => {
    const session = new FreeformEditorSession('0123456789');
    let copied = '';
    session.configureClipboard({
      write: async (payload) => {
        copied = payload.plain;
        return { status: 'written' };
      },
      read: async () => ({}),
    });
    try {
      session.commands.pointAt(point(40));
      const original = session.plane.materialize();
      pointer(session, 'down', 2);
      pointer(session, 'move', 4);
      if (operation === 'fill') session.commands.insert('X');
      else if (operation === 'style')
        session.commands.style({ kind: 'foreground', color: '#ff3344' });
      else {
        const result =
          operation === 'paste'
            ? session.commands.pasteProvided('ab')
            : session.commands[operation]();
        expect(result.status).toBe('pending');
        if (result.status === 'pending') expect((await result.completion).succeeded).toBe(true);
      }
      expect(session.gestureState.type).toBe('idle');
      if (operation === 'copy' || operation === 'cut') expect(copied).toBe('234');
      if (operation === 'copy') expect(session.plane.materialize()).toEqual(original);
      else {
        if (operation === 'fill')
          for (let x = 2; x <= 4; x++) expect(session.plane.get(point(x))?.char).toBe('X');
        if (operation === 'style')
          for (let x = 2; x <= 4; x++) expect(session.plane.get(point(x))?.color).toBe('#ff3344');
        if (operation === 'cut')
          for (let x = 2; x <= 4; x++) expect(session.plane.get(point(x))).toBeUndefined();
        if (operation === 'paste') {
          expect(session.plane.get(point(2))?.char).toBe('a');
          expect(session.plane.get(point(3))?.char).toBe('b');
          expect(session.plane.get(point(4))?.char).toBe('4');
        }
        expect(session.plane.get(point(1))).toEqual(original.get('1,0'));
        expect(session.plane.get(point(5))).toEqual(original.get('5,0'));
        session.commands.undo();
        expect(session.plane.materialize()).toEqual(original);
      }
      expect(session.canUndo).toBe(false);
    } finally {
      session.dispose();
    }
  });
}

test('deletion completes an appended selection including wide followers', () => {
  const session = new FreeformEditorSession('AB-X界🦀Z');
  try {
    click(session, 0);
    click(session, 1, 0, true);
    pointer(session, 'down', 5, 0, { append: true });
    pointer(session, 'move', 7);
    session.commands.deleteBackward();
    for (const x of [0, 1, 4, 6]) expect(session.plane.get(point(x))).toBeUndefined();
    expect(session.plane.get(point(2))?.char).toBe('-');
    expect(session.plane.get(point(3))?.char).toBe('X');
    expect(session.plane.get(point(8))?.char).toBe('Z');
    expect(session.gestureState.type).toBe('idle');
  } finally {
    session.dispose();
  }
});

test('Undo still cancels a selecting gesture before reverting document history', () => {
  const session = new FreeformEditorSession('ABCDE');
  try {
    session.commands.pointAt(point(5));
    session.commands.insert('X');
    pointer(session, 'down', 1);
    pointer(session, 'move', 3);
    session.commands.undo();
    expect(session.gestureState.type).toBe('idle');
    expect(session.selection).toBeNull();
    expect(session.plane.get(point(5))).toBeUndefined();
    expect(session.canUndo).toBe(false);
  } finally {
    session.dispose();
  }
});
