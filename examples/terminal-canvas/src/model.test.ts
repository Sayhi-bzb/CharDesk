import { describe, expect, test } from 'bun:test';
import { TerminalCanvas } from './model.ts';

describe('terminal canvas editing', () => {
  test('uses sparse CellPlane projection at distant negative coordinates', () => {
    const model = new TerminalCanvas();
    try {
      model.pointAt({ x: -1_000_000, y: -1_000_000 });
      model.beginInsert();
      model.insert('界👩🏽‍💻é');
      expect(model.cursor).toEqual({ x: -999_995, y: -1_000_000 });
      expect(model.plane.get({ x: -999_998, y: -1_000_000 })?.char).toBe('👩🏽‍💻');
      expect(model.plane.getStats().cachedChunks).toBeLessThan(5);
    } finally {
      model.dispose();
    }
  });

  test('overwriting the trailing half removes the whole wide grapheme', () => {
    const model = new TerminalCanvas('界B');
    try {
      model.cursor = { x: 1, y: 0 };
      model.beginInsert();
      model.insert('A');
      expect(model.plane.get({ x: 0, y: 0 })).toBeUndefined();
      expect(model.plane.get({ x: 1, y: 0 })?.char).toBe('A');
      expect(model.plane.get({ x: 2, y: 0 })?.char).toBe('B');
      model.undo();
      expect(model.plane.get({ x: 0, y: 0 })?.char).toBe('界');
    } finally {
      model.dispose();
    }
  });

  test('backspace removes one grapheme and returns to its lead column', () => {
    const model = new TerminalCanvas();
    try {
      model.beginInsert();
      model.insert('A👩🏽‍💻');
      model.deleteBackward();
      expect(model.cursor).toEqual({ x: 1, y: 0 });
      expect(model.plane.get({ x: 1, y: 0 })).toBeUndefined();
      expect(model.plane.get({ x: 0, y: 0 })?.char).toBe('A');
    } finally {
      model.dispose();
    }
  });

  test('joins combining marks and Emoji arriving in separate input events', () => {
    const model = new TerminalCanvas();
    try {
      model.beginInsert();
      for (const text of ['e', '́', '👩', '🏽', '‍', '💻']) model.insert(text);
      expect(model.plane.get({ x: 0, y: 0 })?.char).toBe('é');
      expect(model.plane.get({ x: 1, y: 0 })?.char).toBe('👩🏽‍💻');
      expect(model.cursor).toEqual({ x: 3, y: 0 });
    } finally {
      model.dispose();
    }
  });

  test('newlines return to the input origin and tabs use protocol cell layout', () => {
    const model = new TerminalCanvas();
    try {
      model.pointAt({ x: 9, y: -3 });
      model.beginInsert();
      model.insert('A界\nB\tC');
      expect(model.plane.get({ x: 9, y: -2 })?.char).toBe('B');
      expect(model.plane.get({ x: 13, y: -2 })?.char).toBe('C');
      model.insert('\nD');
      expect(model.plane.get({ x: 9, y: -1 })?.char).toBe('D');
    } finally {
      model.dispose();
    }
  });

  test('tab stops are independent of terminal event boundaries', () => {
    const chunked = new TerminalCanvas();
    const whole = new TerminalCanvas();
    try {
      chunked.beginInsert();
      whole.beginInsert();
      for (const chunk of ['A', '\t', '界', '\t', 'B']) chunked.insert(chunk);
      whole.insert('A\t界\tB');
      expect(chunked.plane.materialize()).toEqual(whole.plane.materialize());
      expect(chunked.cursor).toEqual(whole.cursor);
    } finally {
      chunked.dispose();
      whole.dispose();
    }
  });

  test('expands a selection across wide glyphs and moves overlapping content atomically', () => {
    const model = new TerminalCanvas('A界BC');
    try {
      model.selection = { anchor: { x: 2, y: 0 }, focus: { x: 3, y: 0 } };
      expect(model.selectionBounds).toEqual({ x: 1, y: 0, width: 3, height: 1 });
      expect(model.moveSelection(1, 0)).toBe(true);
      expect(model.plane.get({ x: 1, y: 0 })).toBeUndefined();
      expect(model.plane.get({ x: 2, y: 0 })?.char).toBe('界');
      expect(model.plane.get({ x: 4, y: 0 })?.char).toBe('B');
      model.undo();
      expect(model.plane.get({ x: 1, y: 0 })?.char).toBe('界');
      expect(model.plane.get({ x: 4, y: 0 })?.char).toBe('C');
      expect(model.dirty).toBe(false);
      model.redo();
      expect(model.dirty).toBe(true);
    } finally {
      model.dispose();
    }
  });

  test('new edits after undo discard redo, and saved revisions track dirty state', () => {
    const model = new TerminalCanvas();
    try {
      model.insert('A');
      model.markSaved();
      model.insert('B');
      model.undo();
      expect(model.dirty).toBe(false);
      model.insert('C');
      expect(model.canRedo).toBe(false);
      expect(model.plane.get({ x: 2, y: 0 })?.char).toBe('C');
      expect(model.dirty).toBe(true);
    } finally {
      model.dispose();
    }
  });

  test('panning does not mutate content or dirty state', () => {
    const model = new TerminalCanvas('hello');
    try {
      const revision = model.plane.getRevision();
      model.pan(-5000, 5000);
      expect(model.plane.getRevision()).toBe(revision);
      expect(model.dirty).toBe(false);
    } finally {
      model.dispose();
    }
  });
});
