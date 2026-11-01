import { expect, test } from 'bun:test';
import { createTestRenderer, KeyCodes } from '@opentui/core/testing';
import type { EditorCommandResult } from '@chardesk/editor-core/editor/types';
import type { ClipboardCommandResult } from '@chardesk/editor-core/clipboard/commands';
import { serializeCharDeskDocumentEnvelope } from '@chardesk/document';
import { TerminalCanvas } from './model.ts';
import { createTextPreparation } from './text.ts';
import { CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';
import { serializeCanvasDocument } from '@chardesk/editor-core/documentText';

async function finish(result: EditorCommandResult<ClipboardCommandResult>) {
  if (result.status !== 'pending') throw new Error(`Expected pending, got ${result.status}`);
  return result.completion;
}
const text = (model: TerminalCanvas) =>
  [...model.plane.materialize().values()].map((cell) => cell.char).join('');

test('native sparse document paste keeps all active-page fragments at their relative offsets', async () => {
  const source = new TerminalCanvas(),
    target = new TerminalCanvas('', { prepareText: createTextPreparation() });
  try {
    source.commands.pointAt({ x: -5, y: -8 });
    source.commands.insert('A');
    source.commands.pointAt({ x: 1_000_000, y: 1_000_000 });
    source.commands.insert('界');
    target.commands.pointAt({ x: 10, y: 20 });
    expect(
      await finish(
        target.commands.pasteProvided(serializeCanvasDocument(source.documents.getDocumentDraft()!))
      )
    ).toMatchObject({ succeeded: true });
    expect(target.plane.get({ x: 10, y: 20 })?.char).toBe('A');
    expect(target.plane.get({ x: 1_000_015, y: 1_000_028 })?.char).toBe('界');
    expect(target.getSnapshot().pasteDiagnostics[0]?.code).toBe('canvas-content-only');
  } finally {
    source.dispose();
    target.dispose();
  }
});

test('Auto Paste compiles Markdown and plain mode preserves source and terminal defaults', async () => {
  const auto = new TerminalCanvas('', { prepareText: createTextPreparation() });
  const plain = new TerminalCanvas('', { prepareText: createTextPreparation('plain') });
  try {
    const source = '**bold** and [link](https://example.com)';
    expect(await finish(auto.commands.pasteProvided(source))).toMatchObject({ succeeded: true });
    expect(text(auto)).toContain('bold');
    expect(text(auto)).not.toContain('**');
    expect(
      [...auto.plane.materialize().values()].some((cell) => cell.href === 'https://example.com')
    ).toBe(true);
    await finish(plain.commands.pasteProvided(source));
    expect(text(plain)).toBe(source);
    expect(
      [...plain.plane.materialize().values()].every(
        (cell) => cell.color === '#000000' && !cell.bgColor
      )
    ).toBe(true);
    auto.commands.undo();
    expect(auto.plane.materialize().size).toBe(0);
    expect(auto.canUndo).toBe(false);
  } finally {
    auto.dispose();
    plain.dispose();
  }
});

test.each(['auto', 'ansi'] as const)(
  '%s decodes ANSI styles without losing grapheme width',
  async (mode) => {
    const model = new TerminalCanvas('', { prepareText: createTextPreparation(mode) });
    try {
      await finish(model.commands.pasteProvided('\x1b[31;1m界\x1b[0mZ'));
      expect(model.plane.get({ x: 0, y: 0 })).toMatchObject({ char: '界', attrs: { bold: true } });
      expect(model.plane.get({ x: 2, y: 0 })?.char).toBe('Z');
      expect(model.selectionBounds?.width).toBe(3);
    } finally {
      model.dispose();
    }
  }
);

test('forced Markdown renders Mermaid through the shared compiler', async () => {
  const model = new TerminalCanvas('', { prepareText: createTextPreparation('markdown') });
  try {
    expect(
      await finish(model.commands.pasteProvided('```mermaid\nflowchart LR\nA --> B\n```'))
    ).toMatchObject({ succeeded: true });
    expect(model.getSnapshot().pasteDiagnostics).toEqual([]);
    expect(text(model)).toContain('A');
    expect(text(model)).toContain('B');
    expect(text(model)).not.toContain('flowchart');
    expect(text(model)).not.toContain('```');
    expect(model.selectionBounds!.height).toBeGreaterThan(1);
  } finally {
    model.dispose();
  }
}, 15000);

test.each([
  ['math', '$$\n\\frac{1}{2}\n$$', '\\frac'],
  ['JSON tree', '```json\n{"name":"demo","count":2}\n```', '{'],
  ['YAML tree', '```yaml\nname: demo\ncount: 2\n```', '```'],
  ['code', '```typescript\nconst value = 1;\n```', '```'],
])(
  'bundled compiler renders %s without a browser',
  async (_, source, marker) => {
    const model = new TerminalCanvas('', { prepareText: createTextPreparation('markdown') });
    try {
      expect(await finish(model.commands.pasteProvided(source!))).toMatchObject({
        succeeded: true,
      });
      expect(model.getSnapshot().pasteDiagnostics).toEqual([]);
      expect(text(model)).not.toContain(marker!);
      expect(model.plane.materialize().size).toBeGreaterThan(0);
    } finally {
      model.dispose();
    }
  },
  15000
);

test('native documents are decoded before compilation and unsupported modes fail atomically', async () => {
  const model = new TerminalCanvas('', { prepareText: createTextPreparation() });
  try {
    const source = serializeCharDeskDocumentEnvelope({
      mode: 'freeform',
      title: 'demo',
      body: '[1m界[0m',
    });
    await finish(model.commands.pasteProvided(source));
    expect(text(model)).toBe('界');
    expect(model.plane.get({ x: 0, y: 0 })?.attrs?.bold).toBe(true);
    model.commands.undo();
    const slide = serializeCharDeskDocumentEnvelope({ mode: 'slide', body: 'page' });
    expect(await finish(model.commands.pasteProvided(slide))).toMatchObject({
      succeeded: false,
      reason: 'prepare-failed',
    });
    expect(model.plane.materialize().size).toBe(0);
    expect(model.canUndo).toBe(false);
  } finally {
    model.dispose();
  }
});

test('large plain paste stays one undoable operation and preserves negative placement', async () => {
  const model = new TerminalCanvas('', { prepareText: createTextPreparation('plain') });
  try {
    model.commands.pointAt({ x: -20, y: -10 });
    const source = Array.from({ length: 100 }, () => '界'.repeat(100)).join('\n');
    await finish(model.commands.pasteProvided(source));
    expect(model.plane.get({ x: -20, y: -10 })?.char).toBe('界');
    expect(model.plane.get({ x: 178, y: 89 })?.char).toBe('界');
    expect(model.plane.materialize().size).toBe(10000);
    model.commands.undo();
    expect(model.plane.materialize().size).toBe(0);
    expect(model.canUndo).toBe(false);
  } finally {
    model.dispose();
  }
});

test('native paste events and Command+V compile identically and report diagnostics', async () => {
  const setup = await createTestRenderer({ width: 100, height: 30, kittyKeyboard: true });
  const model = new TerminalCanvas('', { prepareText: createTextPreparation() });
  const surface = new CanvasSurface(setup.renderer, model, 'test.chardesk', 'darwin');
  setup.renderer.root.add(surface);
  let source = '**bold**';
  const detach = attachControls(surface, () => {}, {
    read: async () => ({ plainText: source }),
    write: async () => ({ status: 'written' }),
  });
  async function waitForPaste() {
    for (let i = 0; i < 100 && surface.status === 'Working with clipboard…'; i++)
      await Bun.sleep(1);
    expect(surface.status).not.toBe('Working with clipboard…');
  }
  try {
    setup.renderer.keyInput.processPaste(new TextEncoder().encode(source));
    await waitForPaste();
    const first = model.plane.materialize();
    expect(surface.tool).toBe('hand');
    model.commands.undo();
    setup.mockInput.pressKey('v', { super: true });
    await waitForPaste();
    expect(model.plane.materialize()).toEqual(first);
    expect(surface.status).toBe('Pasted');
    model.commands.undo();
    source = '\x1b[999mX';
    setup.renderer.keyInput.processPaste(new TextEncoder().encode(source));
    await waitForPaste();
    expect(model.getSnapshot().pasteDiagnostics.length).toBeGreaterThan(0);
    expect(surface.status).toContain('Paste warnings');
    source = serializeCharDeskDocumentEnvelope({ mode: 'slide', body: '' });
    const before = model.plane.materialize();
    setup.renderer.keyInput.processPaste(new TextEncoder().encode(source));
    await waitForPaste();
    expect(surface.status).toContain('Unable to prepare pasted text');
    expect(model.plane.materialize()).toEqual(before);
    setup.mockInput.pressKey(KeyCodes.F2);
    expect(surface.tool).toBe('edit');
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
  }
});
