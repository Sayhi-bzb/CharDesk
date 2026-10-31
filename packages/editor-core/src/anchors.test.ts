import { expect, test } from 'vitest';
import { FreeformEditorSession } from './runtime.js';
import { parseCanvasDocument, serializeCanvasDocument } from './documentText.js';

test('anchor navigation does not change selection, content or history; edits and range moves remain atomic', () => {
  const session = new FreeformEditorSession('AB');
  try {
    session.commands.anchors.add('Name');
    const id = session.anchors[0]!.id;
    session.commands.anchors.rename(id, 'Renamed');
    session.selection = { anchor: { x: 0, y: 0 }, focus: { x: 1, y: 0 } };
    const interaction = structuredClone(session.getSnapshot().interaction);
    const version = session.version;
    session.commands.anchors.jump(id);
    expect(session.version).toBe(version);
    expect(session.getSnapshot().interaction).toEqual(interaction);
    session.commands.moveSelection(-10, -20);
    expect(session.anchors[0]?.point).toEqual({ x: -10, y: -20 });
    expect(session.plane.get({ x: -10, y: -20 })?.char).toBe('A');
    session.commands.undo();
    expect(session.anchors[0]?.point).toEqual({ x: 0, y: 0 });
    expect(session.plane.get({ x: 0, y: 0 })?.char).toBe('A');
    session.commands.anchors.remove(id);
    expect(session.anchors).toHaveLength(0);
    session.commands.undo();
    expect(session.anchors[0]?.label).toBe('Renamed');
  } finally {
    session.dispose();
  }
});

test('prepared heading anchors commit with pasted content, survive save and undo in one step', async () => {
  const session = new FreeformEditorSession('', {
    autoAnchors: true,
    prepareText: async () => ({
      richRows: [0, 1].map((y) => ({
        y,
        spans: [{ x: 0, text: `Heading${y}`, width: 8, color: '#000000' }],
      })),
      headings: [
        { level: 1, row: 0, label: 'Root' },
        { level: 2, row: 1, label: 'Child' },
      ],
    }),
  });
  try {
    session.commands.pointAt({ x: -10, y: -20 });
    const result = session.commands.pasteProvided('headings');
    if (result.status !== 'pending') throw new Error('Expected pending');
    expect((await result.completion).succeeded).toBe(true);
    expect(session.anchors).toHaveLength(2);
    expect(session.anchors[1]?.parentId).toBe(session.anchors[0]?.id);
    expect(session.anchors[0]?.point).toEqual({ x: -10, y: -20 });
    const document = parseCanvasDocument(
      serializeCanvasDocument(session.documents.getDocumentDraft()!)
    ).document;
    const restored = new FreeformEditorSession('', { document });
    try {
      expect(restored.anchors).toEqual(session.anchors);
    } finally {
      restored.dispose();
    }
    session.commands.undo();
    expect(session.plane.materialize().size).toBe(0);
    expect(session.anchors).toHaveLength(0);
    expect(session.canUndo).toBe(false);
    session.commands.redo();
    expect(session.anchors).toHaveLength(2);
  } finally {
    session.dispose();
  }
});
