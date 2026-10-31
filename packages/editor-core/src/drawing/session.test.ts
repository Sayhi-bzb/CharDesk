import { expect, test } from 'vitest';
import { FreeformEditorSession } from '../runtime.js';
import { createShapePoints } from './planner.js';
import type { ToolType } from '../interaction/tool.js';

const point = (x: number, y: number) => ({ x, y });
const pointer = (
  session: FreeformEditorSession,
  phase: 'down' | 'move' | 'up',
  x: number,
  y: number
) => session.pointer({ phase, cell: point(x, y), screen: point(x, y) });

test.each(['box', 'splitBox', 'line', 'stepline', 'circle', 'bg'] as const)(
  '%s preview commits shared geometry once, including final release coordinate',
  (tool) => {
    const model = new FreeformEditorSession();
    try {
      model.setDrawingSettings({ foreground: '#ff0000', background: '#0000ff' });
      model.setTool(tool);
      pointer(model, 'down', -5, -8);
      pointer(model, 'move', 0, -4);
      expect(model.plane.materialize().size).toBe(0);
      expect(model.canUndo).toBe(false);
      expect(model.frame().source.getContentBounds()).toBeNull();
      pointer(model, 'up', 3, -2);
      const expected = createShapePoints(tool, point(-5, -8), point(3, -2), model.drawingSettings, {
        axis: 'horizontal',
      });
      expect(model.plane.materialize().size).toBe(expected.length);
      for (const entry of expected)
        expect(model.plane.get(entry)).toMatchObject({ char: entry.char, color: entry.color });
      model.commands.undo();
      expect(model.plane.materialize().size).toBe(0);
      expect(model.canUndo).toBe(false);
      model.commands.redo();
      expect(model.plane.materialize().size).toBe(expected.length);
    } finally {
      model.dispose();
    }
  }
);

test('wide brush interpolates sparse pointer events, previews atomically, and cancels without history', () => {
  const model = new FreeformEditorSession('original');
  try {
    model.setDrawingSettings({ char: '界' });
    model.setTool('brush');
    const before = model.plane.materialize(),
      version = model.version;
    pointer(model, 'down', -6, -3);
    pointer(model, 'move', 0, -3);
    for (const x of [-6, -4, -2, 0])
      expect(model.frame().source.get(point(x, -3))?.char).toBe('界');
    expect(model.version).toBe(version);
    expect(model.plane.materialize()).toEqual(before);
    model.cancelInteraction();
    expect(model.frame().source.get(point(-6, -3))).toBeUndefined();
    expect(model.canUndo).toBe(false);
    pointer(model, 'down', -6, -3);
    pointer(model, 'up', 0, -3);
    expect(model.plane.get(point(0, -3))?.char).toBe('界');
    model.commands.undo();
    expect(model.plane.materialize()).toEqual(before);
    expect(model.canUndo).toBe(false);
  } finally {
    model.dispose();
  }
});

test('eraser previews whole wide glyph removal, cancels, and commits one stroke', () => {
  const model = new FreeformEditorSession('界AB');
  try {
    const before = model.plane.materialize();
    model.setTool('eraser');
    pointer(model, 'down', 1, 0);
    expect(model.frame().source.get(point(0, 0))).toBeUndefined();
    expect(model.plane.materialize()).toEqual(before);
    model.cancelInteraction();
    expect(model.plane.materialize()).toEqual(before);
    pointer(model, 'down', 1, 0);
    pointer(model, 'up', 3, 0);
    expect(model.plane.materialize().size).toBe(0);
    model.commands.undo();
    expect(model.plane.materialize()).toEqual(before);
    expect(model.canUndo).toBe(false);
  } finally {
    model.dispose();
  }
});

test('fill recolors existing full glyphs without filling empty cells and preserves typing context', () => {
  const model = new FreeformEditorSession('界A');
  try {
    model.commands.pointAt(point(-5, -5));
    model.commands.beginInsert();
    model.commands.insert('X');
    model.markSaved();
    const before = model.viewAt(model.documents.getActiveAddress());
    model.setDrawingSettings({ foreground: '#ff0000' });
    model.setTool('fill');
    pointer(model, 'down', 1, 0);
    pointer(model, 'up', 5, 0);
    expect(model.plane.get(point(0, 0))?.color).toBe('#ff0000');
    expect(model.plane.get(point(2, 0))?.color).toBe('#ff0000');
    expect(model.plane.get(point(4, 0))).toBeUndefined();
    expect(model.viewAt(model.documents.getActiveAddress()).interaction).toEqual(
      before.interaction
    );
    model.commands.insert('\nB');
    expect(model.plane.get(point(-5, -4))?.char).toBe('B');
  } finally {
    model.dispose();
  }
});

test.each([
  'brush',
  'eraser',
  'box',
  'splitBox',
  'line',
  'stepline',
  'circle',
  'bg',
  'fill',
] as ToolType[])('%s rejects excessive gestures atomically and remains usable', (tool) => {
  const model = new FreeformEditorSession('safe');
  try {
    model.setTool(tool);
    const before = model.plane.materialize();
    pointer(model, 'down', 0, 0);
    pointer(model, 'move', 1_000_000, 1_000_000);
    pointer(model, 'up', 1_000_000, 1_000_000);
    expect(model.getSnapshot().drawingError).toBeTruthy();
    expect(model.gestureState.type).toBe('idle');
    expect(model.plane.materialize()).toEqual(before);
    expect(model.canUndo).toBe(false);
    model.setTool('select');
    model.commands.pointAt(point(10, 0));
    model.commands.insert('ok');
    expect(model.plane.get(point(10, 0))?.char).toBe('o');
  } finally {
    model.dispose();
  }
});

test('drawing settings and tools restore per page; malformed persisted settings do not mutate state', () => {
  const model = new FreeformEditorSession();
  try {
    const first = model.documents.getActiveAddress();
    model.setDrawingSettings({ char: '👩🏽‍💻', foreground: '#ff0000' });
    model.setTool('brush');
    const view = model.viewAt(first);
    model.documents.activateDocument('other', { grid: [] });
    model.setDrawingSettings({ char: 'B' });
    model.setTool('box');
    const second = model.viewAt(model.documents.getActiveAddress());
    model.switchDocument(first.documentId);
    expect(model.viewAt(first)).toEqual(view);
    model.restoreViewAt(first, JSON.parse(JSON.stringify(view)));
    expect(model.drawingSettings.char).toBe('👩🏽‍💻');
    for (const drawing of [
      { char: '\n', foreground: '#000000' },
      { char: 'ab', foreground: '#000000' },
      { char: '#', foreground: 'invalid' },
    ]) {
      expect(() => model.restoreViewAt(first, { ...view, drawing })).toThrow();
      expect(model.viewAt(first)).toEqual(view);
    }
    pointer(model, 'down', -3, -3);
    model.switchDocument('other');
    expect(model.viewAt(model.documents.getActiveAddress())).toEqual(second);
    model.switchDocument(first.documentId);
    expect(model.plane.materialize().size).toBe(0);
  } finally {
    model.dispose();
  }
});

test('page switches isolate drawing parameters without dirtying content', () => {
  const model = new FreeformEditorSession();
  try {
    const first = model.documents.getActiveAddress();
    model.documents.ensurePage(first.documentId, { id: 'second', kind: 'cell-plane', grid: [] });
    model.markSaved();
    model.setDrawingSettings({ char: '界', foreground: '#ff0000', background: '#0000ff' });
    model.setTool('brush');
    model.documents.activatePage(first.documentId, 'second');
    model.setDrawingSettings({ char: 'B', foreground: '#00ff00' });
    model.setTool('box');
    model.documents.activatePage(first.documentId, first.pageId);
    expect(model.currentTool).toBe('brush');
    expect(model.drawingSettings).toEqual({
      char: '界',
      foreground: '#ff0000',
      background: '#0000ff',
    });
    model.documents.activatePage(first.documentId, 'second');
    expect(model.currentTool).toBe('box');
    expect(model.drawingSettings.char).toBe('B');
    expect(model.dirty).toBe(false);
    expect(model.canUndo).toBe(false);
  } finally {
    model.dispose();
  }
});

test.each(['brush', 'eraser', 'box', 'bg'] as const)(
  '%s rejects integer-edge coordinates before preview or content writes',
  (tool) => {
    const model = new FreeformEditorSession('safe');
    try {
      const before = model.plane.materialize();
      model.setTool(tool);
      pointer(model, 'down', Number.MAX_SAFE_INTEGER, 0);
      pointer(model, 'up', Number.MAX_SAFE_INTEGER, 0);
      expect(model.getSnapshot().drawingError).toBeTruthy();
      expect(model.plane.materialize()).toEqual(before);
      expect(model.canUndo).toBe(false);
    } finally {
      model.dispose();
    }
  }
);
