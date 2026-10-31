import { expect, test } from 'vitest';
import { FreeformEditorSession } from './runtime.js';
import { readEditorView } from './viewState.js';

test('validated views restore typing context and viewport without changing document or history', () => {
  const model = new FreeformEditorSession('original');
  try {
    model.commands.pointAt({ x: -7, y: -8 });
    model.commands.beginInsert();
    model.commands.insert('界');
    model.setTool('pan');
    model.editor.transact(() => model.pan(20, 10));
    const address = model.documents.getActiveAddress(),
      view = model.viewAt(address);
    const version = model.version,
      content = model.plane.materialize();
    model.commands.pointAt({ x: 10, y: 20 });
    model.setTool('select');
    model.restoreViewAt(address, JSON.parse(JSON.stringify(view)));
    expect(model.viewAt(address)).toEqual(view);
    expect(model.version).toBe(version);
    expect(model.plane.materialize()).toEqual(content);
    model.commands.insert('\nB');
    expect(model.plane.get({ x: -7, y: -7 })?.char).toBe('B');
  } finally {
    model.dispose();
  }
});

test('inactive-document view restoration is isolated and malformed persisted input is rejected first', () => {
  const model = new FreeformEditorSession();
  try {
    const first = model.documents.getActiveAddress();
    model.commands.navigate(4, 5, true);
    const view = model.viewAt(first);
    model.documents.activateDocument('other', { grid: [] });
    const interaction = model.getSnapshot().interaction;
    model.restoreViewAt(first, view);
    expect(model.getSnapshot().interaction).toEqual(interaction);
    for (const invalid of [
      null,
      {},
      { ...view, viewport: { x: Infinity, y: 0 } },
      { ...view, interaction: { mode: 'text-edit', session: {} } },
      { ...view, tool: 'missing-tool' },
    ]) {
      expect(() => model.restoreViewAt(first, invalid)).toThrow();
      expect(model.getSnapshot().interaction).toEqual(interaction);
    }
    model.switchDocument(first.documentId);
    expect(model.viewAt(first).interaction).toEqual(view.interaction);
    const decoded = readEditorView(view);
    decoded.viewport.x = 100;
    expect(view.viewport.x).not.toBe(100);
  } finally {
    model.dispose();
  }
});
