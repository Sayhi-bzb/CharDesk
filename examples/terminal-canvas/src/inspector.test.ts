import { expect, test } from 'bun:test';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TerminalWorkspace } from './workspace.ts';
import { CanvasFile } from './document.ts';
import { CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';

async function fixture(platform: NodeJS.Platform = 'darwin') {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-inspector-'));
  const workspace = await TerminalWorkspace.open(join(root, 'canvas.chardesk'));
  const model = workspace.model;
  model.apply({
    rows: [
      {
        y: 0,
        erase: [],
        spans: [
          {
            x: 0,
            text: '🦀',
            color: '#ff0000',
            attrs: { bold: true },
            href: 'https://example.com',
          },
          { x: 2, text: '界', color: '#0000ff', attrs: { italic: true }, bgColor: '#112233' },
        ],
      },
    ],
  });
  model.documents.clearHistory();
  await workspace.saveFile();
  const clock = new ManualClock(),
    setup = await createTestRenderer({ width: 110, height: 30, kittyKeyboard: true, clock });
  const surface = new CanvasSurface(setup.renderer, model, 'Inspector', platform);
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {}, undefined, workspace);
  await setup.renderOnce();
  return {
    root,
    workspace,
    model,
    setup,
    surface,
    open() {
      setup.mockInput.pressKey('F11', { shift: true });
    },
    escape() {
      setup.mockInput.pressEscape();
      clock.advance(40);
    },
    primary(key: string) {
      setup.mockInput.pressKey(key, platform === 'darwin' ? { super: true } : { ctrl: true });
    },
    pick(index: number) {
      surface.panel!.selected = index;
      setup.mockInput.pressEnter();
    },
    async dispose() {
      detach();
      await setup.dispose();
      workspace.dispose();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('Inspector shows mixed states, uses shared style commands, preserves the view and saves complete wide glyph styles', async () => {
  const f = await fixture();
  try {
    f.surface.setTool('edit');
    f.model.selection = { anchor: { x: 1, y: 0 }, focus: { x: 3, y: 0 } };
    const before = f.model.plane.materialize(),
      interaction = structuredClone(f.model.getSnapshot().interaction),
      view = { ...f.model.viewport };
    f.open();
    expect(f.surface.panel?.dialog).toBe(true);
    expect(f.surface.panel?.title).toBe('Inspector');
    expect(f.surface.panel?.items[0]).toContain('mixed');
    expect(f.model.plane.materialize()).toEqual(before);
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).toContain('Foreground');
    f.pick(0);
    expect(f.surface.panel?.items[0]).toContain('on');
    expect(f.model.plane.get({ x: 2, y: 0 })?.attrs).toMatchObject({ bold: true, italic: true });
    f.escape();
    f.primary('z');
    expect(f.model.plane.materialize()).toEqual(before);
    expect(f.model.canUndo).toBe(false);
    f.open();
    f.pick(5);
    await f.setup.mockInput.typeText('bad', 0);
    f.setup.mockInput.pressEnter();
    expect(f.surface.panel?.error).toContain('#RRGGBB');
    expect(f.model.plane.materialize()).toEqual(before);
    f.primary('a');
    await f.setup.mockInput.typeText('#abcdef', 0);
    f.setup.mockInput.pressEnter();
    expect(f.surface.panel?.title).toBe('Inspector');
    expect(f.model.selectionStyle.foreground).toEqual({ kind: 'color', value: '#abcdef' });
    expect(f.model.getSnapshot().interaction).toEqual(interaction);
    expect(f.model.viewport).toEqual(view);
    expect(f.model.plane.get({ x: 1, y: 0 })).toBeUndefined();
    expect(f.model.plane.get({ x: 3, y: 0 })).toBeUndefined();
    expect(f.model.plane.get({ x: 0, y: 0 })?.href).toBe('https://example.com');
    await f.workspace.saveFile();
    const reopened = await CanvasFile.open(f.workspace.active.path);
    try {
      expect(reopened.model.plane.materialize()).toEqual(f.model.plane.materialize());
    } finally {
      reopened.model.dispose();
    }
  } finally {
    await f.dispose();
  }
});

test('Inspector fills selected empty cells with background and clears them in separate undoable operations', async () => {
  const f = await fixture();
  try {
    f.model.selection = { anchor: { x: -2, y: 4 }, focus: { x: 2, y: 4 } };
    const before = f.model.plane.materialize();
    f.open();
    f.pick(0);
    expect(f.model.canUndo).toBe(false);
    f.pick(6);
    await f.setup.mockInput.typeText('#123456', 0);
    f.setup.mockInput.pressEnter();
    expect(f.model.plane.get({ x: -2, y: 4 })?.bgColor).toBe('#123456');
    expect(f.model.plane.get({ x: 2, y: 4 })?.bgColor).toBe('#123456');
    f.pick(7);
    expect(f.model.plane.materialize()).toEqual(before);
    f.escape();
    f.primary('z');
    expect(f.model.plane.get({ x: 0, y: 4 })?.bgColor).toBe('#123456');
    f.primary('z');
    expect(f.model.plane.materialize()).toEqual(before);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('Inspector consumes unrelated input, guards stale color targets and closes safely when too small', async () => {
  const f = await fixture();
  try {
    f.model.commands.selectAll();
    const before = f.model.plane.materialize();
    f.open();
    await f.setup.mockInput.typeText('unrelated', 0);
    await f.setup.mockInput.pasteBracketedText('do not paste');
    expect(f.model.plane.materialize()).toEqual(before);
    f.pick(6);
    await f.setup.mockInput.typeText('#123456', 0);
    f.model.commands.pointAt({ x: 20, y: 20 });
    f.setup.mockInput.pressEnter();
    expect(f.surface.panel?.error).toContain('Selection changed');
    expect(f.model.plane.materialize()).toEqual(before);
    f.escape();
    f.open();
    await f.setup.resize(20, 9);
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).toContain('Enlarge terminal');
    f.setup.mockInput.pressEnter();
    expect(f.model.plane.materialize()).toEqual(before);
    f.escape();
    expect(f.surface.panel).toBeNull();
  } finally {
    await f.dispose();
  }
});

test.each(['darwin', 'win32'] as const)(
  '%s Inspector and formatting use rebindable commands',
  async (platform) => {
    const f = await fixture(platform);
    try {
      f.model.commands.selectAll();
      f.primary('b');
      expect(f.model.selectionStyle.attributes?.bold).toBe('on');
      f.model.editor.keymap.setUserBindings('terminal.format-bold', [['F12']]);
      f.primary('b');
      expect(f.model.selectionStyle.attributes?.bold).toBe('on');
      f.setup.mockInput.pressKey('F12');
      expect(f.model.selectionStyle.attributes?.bold).toBe('off');
      f.model.editor.keymap.setUserBindings('terminal.inspector', [['F9']]);
      f.open();
      expect(f.surface.panel).toBeNull();
      f.setup.mockInput.pressKey('F9');
      expect(f.surface.panel?.title).toBe('Inspector');
    } finally {
      await f.dispose();
    }
  }
);
