import { expect, test } from 'vitest';
import { FreeformEditorSession } from '../runtime.js';
import { parseCanvasDocument, serializeCanvasDocument } from '../documentText.js';
import { planSelectionStyle, readSelectionStyle, readSelectionStyleChange } from './style.js';
const point = (x: number, y = 0) => ({ x, y });
const range = (start: number, end: number, y = 0) => ({
  start: point(start, y),
  end: point(end, y),
});

function fixture() {
  const session = new FreeformEditorSession();
  session.apply({
    rows: [
      {
        y: 0,
        erase: [],
        spans: [
          {
            x: -2,
            text: '🦀',
            color: '#ff0000',
            attrs: { bold: true },
            href: 'https://example.com',
          },
          { x: 1, text: '界', color: '#00ff00', attrs: { italic: true }, bgColor: '#0000ff' },
          { x: 4, text: ' ', color: '#ff0000', href: 'https://example.com/blank' },
        ],
      },
    ],
  });
  session.documents.clearHistory();
  session.markSaved();
  return session;
}

test('style state merges overlapping ranges and counts wide anchors once, including follower-only selection', () => {
  const model = fixture();
  try {
    const style = readSelectionStyle(model.plane, [range(-1, 1), range(-2, 2)]);
    expect(style.count).toBe(2);
    expect(style.attributes).toMatchObject({ bold: 'mixed', italic: 'mixed', underline: 'off' });
    expect(style.foreground).toEqual({ kind: 'mixed' });
    expect(style.background).toEqual({ kind: 'mixed' });
    expect(readSelectionStyle(model.plane, [range(-1, -1)]).attributes?.bold).toBe('on');
    expect(readSelectionStyle(model.plane, []).attributes).toBeNull();
  } finally {
    model.dispose();
  }
});

test('one style patch preserves links, other attributes, coverage holes, selection and history across ranges', () => {
  const model = fixture();
  try {
    const before = model.plane.materialize();
    const patch = planSelectionStyle(
      model.plane,
      [range(-1, -1), range(2, 2)],
      { kind: 'attributes', attributes: { underline: true, bold: false } },
      '#000000'
    );
    model.apply(patch);
    expect(model.plane.get(point(-2))).toMatchObject({
      char: '🦀',
      href: 'https://example.com',
      attrs: { underline: true },
    });
    expect(model.plane.get(point(1))).toMatchObject({
      char: '界',
      bgColor: '#0000ff',
      attrs: { italic: true, underline: true },
    });
    expect(model.plane.get(point(-1))).toBeUndefined();
    expect(model.plane.get(point(2))).toBeUndefined();
    expect(model.plane.get(point(0))).toBeUndefined();
    expect(model.plane.get(point(4))).toEqual(before.get('4,0'));
    model.commands.undo();
    expect(model.plane.materialize()).toEqual(before);
    expect(model.canUndo).toBe(false);
    model.commands.redo();
    expect(model.plane.get(point(-2))?.attrs?.underline).toBe(true);
  } finally {
    model.dispose();
  }
});

test('blank materialization and cleanup distinguish attributes, foreground, background and linked spaces', () => {
  const model = fixture();
  try {
    const apply = (change: Parameters<typeof planSelectionStyle>[2]) =>
      model.apply(planSelectionStyle(model.plane, [range(4, 6)], change, '#123456'));
    apply({ kind: 'attributes', attributes: { bold: true } });
    expect(model.plane.get(point(5))).toBeUndefined();
    apply({ kind: 'foreground', color: '#ffffff' });
    expect(model.plane.get(point(4))?.color).toBe('#ffffff');
    expect(model.plane.get(point(5))).toBeUndefined();
    apply({ kind: 'background', color: '#112233' });
    expect(model.plane.get(point(5))).toEqual({ char: ' ', color: '#123456', bgColor: '#112233' });
    apply({ kind: 'background', color: null });
    expect(model.plane.get(point(5))).toBeUndefined();
    expect(model.plane.get(point(4))?.href).toBe('https://example.com/blank');
    apply({ kind: 'attributes', attributes: { underline: true } });
    expect(model.plane.get(point(6))?.attrs?.underline).toBe(true);
    apply({ kind: 'attributes', attributes: { underline: false } });
    expect(model.plane.get(point(6))).toBeUndefined();
  } finally {
    model.dispose();
  }
});

test('Session commands preserve interaction, support native document round trips, and leave no-op history empty', () => {
  const model = fixture();
  try {
    model.selection = { anchor: point(-1), focus: point(2) };
    model.pan(10, -20);
    const interaction = structuredClone(model.getSnapshot().interaction),
      view = { ...model.viewport };
    model.commands.style({ kind: 'attributes', attributes: { strike: false } });
    expect(model.canUndo).toBe(false);
    model.commands.style({ kind: 'background', color: '#aabbcc' });
    const draft = parseCanvasDocument(
      serializeCanvasDocument(model.documents.getDocumentDraft()!)
    ).document;
    const restored = new FreeformEditorSession('', { document: draft });
    try {
      for (const [key, cell] of model.plane.materialize()) {
        const [x, y] = key.split(',').map(Number);
        expect(restored.plane.get({ x: x!, y: y! })).toEqual(cell);
      }
      // Native rectangular text also restores unstyled padding between sparse islands.
      expect(restored.plane.get(point(3))).toEqual({ char: ' ', color: '#000000' });
    } finally {
      restored.dispose();
    }
    expect(model.getSnapshot().interaction).toEqual(interaction);
    expect(model.viewport).toEqual(view);
    model.commands.undo();
    expect(model.canUndo).toBe(false);
  } finally {
    model.dispose();
  }
});

test('oversized or malformed requests reject atomically while Inspector queries remain bounded', () => {
  const model = fixture();
  try {
    const before = model.plane.materialize();
    const ranges = [range(-1000000, 1000000)];
    expect(readSelectionStyle(model.plane, ranges)).toMatchObject({
      limited: true,
      attributes: null,
    });
    expect(() =>
      planSelectionStyle(
        model.plane,
        ranges,
        { kind: 'attributes', attributes: { bold: true } },
        '#000000'
      )
    ).toThrow('too large');
    for (const input of [
      { kind: 'attributes', attributes: [] },
      { kind: 'attributes', attributes: { bad: true } },
      { kind: 'attributes', attributes: { bold: 1 } },
      { kind: 'foreground', color: null },
    ])
      expect(() => readSelectionStyleChange(input)).toThrow();
    expect(model.plane.materialize()).toEqual(before);
    expect(model.canUndo).toBe(false);
  } finally {
    model.dispose();
  }
});
