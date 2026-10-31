import { expect, test } from 'vitest';
import { FreeformEditorSession } from './runtime.js';
import { searchCanvasSurface } from './search.js';

test('document switching restores selection, typing context, camera and tool without sharing history', () => {
  const model = new FreeformEditorSession('first');
  try {
    const first = model.documents.getActiveAddress();
    model.commands.pointAt({ x: -5, y: -3 });
    model.commands.insert('A\nB');
    model.editor.transact(() => model.pan(10, 20));
    model.setTool('pan');
    const interaction = structuredClone(model.getSnapshot().interaction);
    const viewport = { ...model.viewport };
    model.documents.activateDocument('second', { grid: [] });
    model.markSaved();
    model.setTool('select');
    model.commands.pointAt({ x: 50, y: 60 });
    model.commands.insert('X');
    const second = model.documents.getActiveAddress();
    const secondInteraction = structuredClone(model.getSnapshot().interaction);
    expect(model.switchDocument(first.documentId)).toBe(true);
    expect(model.currentTool).toBe('pan');
    expect(model.getSnapshot().interaction).toEqual(interaction);
    expect(model.viewport).toEqual(viewport);
    expect(model.dirty).toBe(true);
    model.commands.undo();
    expect(model.plane.get({ x: -5, y: -3 })).toBeUndefined();
    expect(model.isDirtyAt(second)).toBe(true);
    model.switchDocument(second.documentId);
    expect(model.currentTool).toBe('select');
    expect(model.getSnapshot().interaction).toEqual(secondInteraction);
    expect(model.plane.get({ x: 50, y: 60 })?.char).toBe('X');
    model.commands.undo();
    expect(model.dirty).toBe(false);
    model.switchDocument(first.documentId);
    expect(model.plane.get({ x: 0, y: 0 })?.char).toBe('f');
  } finally {
    model.dispose();
  }
});

test('saving an inactive document never marks the current document saved', () => {
  const model = new FreeformEditorSession();
  try {
    model.commands.insert('first');
    const first = model.documents.getActiveAddress();
    const version = model.version;
    model.documents.activateDocument('second', { grid: [] });
    model.markSaved();
    model.commands.insert('second');
    expect(model.markSavedAt(first, version)).toBe(true);
    expect(model.isDirtyAt(first)).toBe(false);
    expect(model.dirty).toBe(true);
    model.switchDocument(first.documentId);
    model.commands.insert('changed');
    expect(model.markSavedAt(first, version)).toBe(false);
    expect(model.dirty).toBe(true);
  } finally {
    model.dispose();
  }
});

test('shared Unicode search is read-only and reports cell coordinates at negative origins', () => {
  const model = new FreeformEditorSession();
  try {
    model.commands.pointAt({ x: -20, y: -10 });
    model.commands.insert('A界B\nC界D');
    const content = model.plane.materialize(),
      version = model.version;
    const found = searchCanvasSurface(model.plane, '界');
    expect(found.matches.map((match) => match.origin)).toEqual([
      [-19, -10],
      [-19, -9],
    ]);
    expect(searchCanvasSurface(model.plane, 'A界\nC界').matches[0]?.bounds).toEqual([
      -20, -10, 3, 2,
    ]);
    expect(model.plane.materialize()).toEqual(content);
    expect(model.version).toBe(version);
  } finally {
    model.dispose();
  }
});
