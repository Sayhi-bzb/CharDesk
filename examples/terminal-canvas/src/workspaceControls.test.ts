import { afterEach, expect, test } from 'bun:test';
import { createTestRenderer, KeyCodes, ManualClock } from '@opentui/core/testing';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TerminalWorkspace } from './workspace.ts';
import { CanvasSurface, CANVAS_TOP } from './surface.ts';
import { attachControls } from './controller.ts';
import { serializeCharDeskDocumentEnvelope } from '@chardesk/document';
import { createTextPreparation } from './text.ts';
import type { TerminalColors } from '@opentui/core';

test('template previews follow appearance until placement, then remain literal document content', async () => {
  const f = await fixture();
  const terminal: TerminalColors = {
    palette: [],
    defaultForeground: '#eeeeee',
    defaultBackground: '#111111',
    cursorColor: null,
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightForeground: null,
    highlightBackground: null,
  };
  try {
    const model = f.workspace.model,
      original = model.plane.materialize(),
      version = model.version;
    f.setup.renderer.emit('palette', terminal);
    f.setup.mockInput.pressKey('F4', { shift: true });
    expect(f.surface.panel?.title).toBe('Templates and components');
    await f.setup.mockInput.typeText('button', 0);
    f.setup.mockInput.pressEnter();
    expect(f.surface.placement?.source.get({ x: 0, y: 0 })?.color).toBe('#eeeeee');
    f.setup.renderer.emit('palette', {
      ...terminal,
      defaultForeground: '#111111',
      defaultBackground: '#ffffff',
    });
    expect(f.surface.placement?.source.get({ x: 0, y: 0 })?.color).toBe('#111111');
    expect(model.plane.materialize()).toEqual(original);
    expect(model.version).toBe(version);
    expect(model.canUndo).toBe(false);
    const point = { ...f.surface.placement!.at };
    f.setup.mockInput.pressEnter();
    expect(model.plane.get(point)).toMatchObject({ color: '#111111', bgColor: '#ffffff' });
    const placed = model.plane.materialize();
    f.setup.renderer.emit('palette', terminal);
    expect(model.plane.materialize()).toEqual(placed);
    model.commands.undo();
    expect(model.plane.materialize()).toEqual(original);
  } finally {
    await f.dispose();
  }
});

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});
async function fixture(
  platform: NodeJS.Platform = 'darwin',
  delivery: 'written' | 'dispatched' = 'written'
) {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-workspace-ui-'));
  directories.push(root);
  const first = join(root, 'one.chardesk'),
    second = join(root, 'two.chardesk');
  await writeFile(
    first,
    serializeCharDeskDocumentEnvelope({ mode: 'freeform', title: 'One', body: 'Alpha 界\nBeta 界' })
  );
  await writeFile(
    second,
    serializeCharDeskDocumentEnvelope({ mode: 'freeform', title: 'Two', body: 'Second' })
  );
  const workspace = await TerminalWorkspace.open(first, '', {
    prepareText: createTextPreparation(),
    autoAnchors: true,
  });
  const clock = new ManualClock(),
    setup = await createTestRenderer({
      width: 110,
      height: 34,
      kittyKeyboard: true,
      screenMode: 'alternate-screen',
      clock,
    });
  const surface = new CanvasSurface(setup.renderer, workspace.model, 'One', platform);
  setup.renderer.root.add(surface);
  let clipboard = '',
    quits = 0,
    writes = 0;
  const detach = attachControls(
    surface,
    () => {
      quits++;
    },
    {
      read: async () => ({ plainText: clipboard }),
      write: async (payload) => {
        writes++;
        clipboard = payload.plain;
        return { status: delivery };
      },
    },
    workspace
  );
  await setup.renderOnce();
  return {
    root,
    first,
    second,
    setup,
    surface,
    workspace,
    clock,
    get quits() {
      return quits;
    },
    get clipboard() {
      return clipboard;
    },
    get writes() {
      return writes;
    },
    escape() {
      setup.mockInput.pressEscape();
      clock.advance(40);
    },
    primary(key: string, shift = false) {
      setup.mockInput.pressKey(
        key,
        platform === 'darwin' ? { super: true, shift } : { ctrl: true, shift }
      );
    },
    async dispose() {
      detach();
      await setup.dispose();
      workspace.dispose();
    },
  };
}
async function until(check: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out');
    await Bun.sleep(2);
  }
}

test.each(['darwin', 'win32'] as const)(
  '%s native shortcuts open, switch, create and automatically save on document close',
  async (platform) => {
    const f = await fixture(platform);
    try {
      f.primary('o');
      expect(f.surface.panel?.title).toBe('Open document');
      await f.setup.mockInput.typeText(f.second, 0);
      f.setup.mockInput.pressEnter();
      await until(() => f.workspace.files.length === 2);
      await f.setup.renderOnce();
      expect(f.workspace.active.title).toBe('Two');
      expect(f.setup.captureCharFrame()).toContain('Second');
      expect(f.surface.tool).toBe('hand');
      f.setup.mockInput.pressKey(KeyCodes.F2);
      await f.setup.mockInput.typeText('X', 0);
      const secondState = f.workspace.model.getSnapshot().interaction;
      f.setup.mockInput.pressKey(KeyCodes.F6);
      expect(f.workspace.active.title).toBe('One');
      expect(f.surface.tool).toBe('hand');
      f.setup.mockInput.pressKey(KeyCodes.F6, { shift: true });
      expect(f.workspace.active.title).toBe('Two');
      expect(f.surface.tool).toBe('edit');
      expect(f.workspace.model.getSnapshot().interaction).toEqual(secondState);
      f.primary('w');
      await until(() => f.workspace.files.length === 1);
      expect(await readFile(f.second, 'utf8')).toContain('Xecond');
      f.primary('n');
      f.setup.renderer.keyInput.processPaste(
        new TextEncoder().encode(join(f.root, 'three.chardesk'))
      );
      f.setup.mockInput.pressEnter();
      await until(() => f.workspace.files.length === 2);
      expect(f.workspace.active.title).toBe('three');
      f.primary('w');
      await until(() => f.workspace.files.length === 1);
      expect(await readFile(join(f.root, 'three.chardesk'), 'utf8')).toContain(
        'chardesk: document/v2'
      );
      expect(f.workspace.active.title).toBe('One');
    } finally {
      await f.dispose();
    }
  }
);

test('find supports Unicode, regex and paging; navigation preserves selection and history', async () => {
  const f = await fixture();
  try {
    const model = f.workspace.model;
    model.commands.pointAt({ x: 1, y: 0 });
    model.commands.navigate(2, 0, true);
    const interaction = structuredClone(model.getSnapshot().interaction),
      version = model.version;
    f.setup.mockInput.pressKey(KeyCodes.F8);
    await f.setup.mockInput.typeText('界', 0);
    f.setup.mockInput.pressEnter();
    expect(f.surface.panel?.items).toHaveLength(2);
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).toContain('Find on current page');
    f.setup.mockInput.pressEnter();
    expect(f.surface.panel).toBeNull();
    expect(f.surface.searchHighlights[0]?.width).toBe(2);
    expect(model.getSnapshot().interaction).toEqual(interaction);
    expect(model.version).toBe(version);
    f.primary('g');
    expect(f.surface.searchHighlights[0]?.y).toBe(1);
    f.setup.mockInput.pressKey(KeyCodes.F8);
    f.primary('a');
    await f.setup.mockInput.typeText('[', 0);
    f.setup.mockInput.pressKey(KeyCodes.F10);
    expect(f.surface.panel?.error).toContain('Invalid');
    expect(model.version).toBe(version);
    f.escape();
    model.commands.pointAt({ x: 0, y: 10 });
    model.commands.insert(Array.from({ length: 25 }, () => 'needle').join('\n'));
    f.setup.mockInput.pressKey(KeyCodes.F8);
    f.primary('a');
    await f.setup.mockInput.typeText('needle', 0);
    f.setup.mockInput.pressKey(KeyCodes.F10); // back to literal
    expect(f.surface.panel?.items).toHaveLength(21);
    for (let i = 0; i < 20; i++) f.setup.mockInput.pressArrow('down');
    f.setup.mockInput.pressEnter();
    expect(f.surface.panel?.items[0]).toContain('(0, 30)');
    expect(f.surface.panel?.items).toHaveLength(6);
    f.escape();
  } finally {
    await f.dispose();
  }
});

test('cancelled file prompts cannot activate a late open and save-copy keeps the original intact', async () => {
  const f = await fixture();
  try {
    f.primary('o');
    await f.setup.mockInput.typeText(f.second, 0);
    f.setup.mockInput.pressEnter();
    f.escape();
    await Bun.sleep(20);
    expect(f.workspace.files).toHaveLength(1);
    f.workspace.model.commands.insert('X');
    f.setup.mockInput.pressKey(KeyCodes.F7);
    f.surface.panel!.selected = f.surface.panel!.items.indexOf('Duplicate…');
    f.setup.mockInput.pressEnter();
    expect(f.surface.panel?.title).toBe('Duplicate document');
    const target = join(f.root, 'copy.chardesk');
    await f.setup.mockInput.typeText(target, 0);
    f.setup.mockInput.pressEnter();
    await until(() => f.workspace.active.path.endsWith('/copy.chardesk'));
    expect(await readFile(f.first, 'utf8')).toContain('Alpha');
    expect(await readFile(target, 'utf8')).toContain('Xlpha');
    expect(f.workspace.model.dirty).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('anchor panel creates, renames, jumps and deletes through shared undoable commands', async () => {
  const f = await fixture();
  try {
    const model = f.workspace.model;
    f.setup.mockInput.pressKey(KeyCodes.F9, { shift: true });
    await f.setup.mockInput.typeText('根锚点', 0);
    f.setup.mockInput.pressEnter();
    expect(model.anchors[0]?.label).toBe('根锚点');
    expect(f.surface.panel?.title).toBe('Anchors');
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).toContain('根锚点');
    await f.setup.mockInput.typeText('r', 0);
    f.primary('a');
    await f.setup.mockInput.typeText('重命名', 0);
    f.setup.mockInput.pressEnter();
    expect(model.anchors[0]?.label).toBe('重命名');
    const before = model.version,
      interaction = model.getSnapshot().interaction;
    f.setup.mockInput.pressEnter();
    expect(f.surface.panel).toBeNull();
    expect(model.version).toBe(before);
    expect(model.getSnapshot().interaction).toEqual(interaction);
    f.setup.mockInput.pressKey(KeyCodes.F9);
    f.setup.mockInput.pressKey(KeyCodes.DELETE);
    expect(model.anchors).toHaveLength(0);
    f.escape();
    f.primary('z');
    expect(model.anchors[0]?.label).toBe('重命名');
    await f.workspace.saveFile();
    expect(await readFile(f.first, 'utf8')).toContain('重命名');
  } finally {
    await f.dispose();
  }
});

test('modal input owns typing, clipboard and pointer events instead of editing canvas', async () => {
  const f = await fixture();
  try {
    const model = f.workspace.model,
      content = model.plane.materialize();
    f.setup.mockInput.pressKey(KeyCodes.F2);
    f.primary('o');
    await f.setup.mockInput.typeText('ihmIHM界', 0);
    f.primary('a');
    f.primary('c');
    await until(() => f.clipboard.length > 0);
    expect(f.clipboard).toBe('ihmIHM界');
    f.primary('x');
    await until(() => f.surface.panel?.input === '');
    f.primary('v');
    await until(() => f.surface.panel?.input === 'ihmIHM界');
    await f.setup.mockMouse.click(5, 20);
    expect(model.plane.materialize()).toEqual(content);
    f.setup.renderer.resize(20, 6);
    await f.setup.renderOnce();
    expect(f.surface.panel).not.toBeNull();
    f.setup.renderer.resize(110, 34);
    await f.setup.renderOnce();
    f.escape();
    expect(f.surface.tool).toBe('edit');
    expect(model.plane.materialize()).toEqual(content);
    f.setup.mockInput.pressKey(KeyCodes.F7);
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).toContain('Documents');
    const layout = f.surface.panelLayout;
    await f.setup.mockMouse.click(layout.x + 3, layout.itemsY);
    expect(f.surface.panel).toBeNull();
  } finally {
    await f.dispose();
  }
});

test('unconfirmed modal Cut preserves input and reports why it was retained', async () => {
  const f = await fixture('darwin', 'dispatched');
  try {
    f.primary('o');
    await f.setup.mockInput.typeText('界 input', 0);
    f.primary('a');
    f.primary('x');
    await until(() => f.surface.status.includes('selection kept'));
    expect(f.surface.panel?.input).toBe('界 input');
  } finally {
    await f.dispose();
  }
});

test('modal clipboard uses the same rebindable command and repeat policy as the canvas', async () => {
  const f = await fixture();
  try {
    f.primary('o');
    await f.setup.mockInput.typeText('界 input', 0);
    f.primary('a');
    f.workspace.model.editor.keymap.setUserBindings('terminal.copy', [['F11']]);
    f.primary('c');
    expect(f.writes).toBe(0);
    f.setup.mockInput.pressKey(KeyCodes.F11);
    await until(() => f.writes === 1);
    expect(f.clipboard).toBe('界 input');
    f.setup.renderer.keyInput.processParsedKey({
      name: 'f11',
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
      sequence: '',
      number: false,
      raw: '',
      eventType: 'repeat',
      source: 'kitty',
    });
    expect(f.writes).toBe(1);
    expect(f.surface.panel?.input).toBe('界 input');
    f.workspace.model.editor.keymap.setUserBindings('terminal.copy', [['F11', 'F12']]);
    f.setup.mockInput.pressKey(KeyCodes.F11);
    expect(f.writes).toBe(1);
    f.setup.mockInput.pressKey(KeyCodes.F12);
    await until(() => f.writes === 2);
  } finally {
    await f.dispose();
  }
});

test('document changes clear a pending shortcut sequence before it can target another document', async () => {
  const f = await fixture();
  try {
    await f.workspace.openFile(f.second);
    f.workspace.model.editor.keymap.setUserBindings('terminal.minimap', [['F11', 'F11']]);
    f.setup.mockInput.pressKey(KeyCodes.F11);
    expect(f.surface.minimapOpen).toBe(false);
    f.workspace.switchTo(0);
    f.setup.mockInput.pressKey(KeyCodes.F11);
    expect(f.surface.minimapOpen).toBe(false);
    f.setup.mockInput.pressKey(KeyCodes.F11);
    expect(f.surface.minimapOpen).toBe(true);
  } finally {
    await f.dispose();
  }
});

test('quit delegates automatic saving to the host; dirty document close saves without a choice', async () => {
  const f = await fixture();
  try {
    f.workspace.model.commands.insert('X');
    await f.workspace.openFile(f.second);
    f.setup.mockInput.pressKey('q', { ctrl: true });
    expect(f.quits).toBe(1);
    expect(f.surface.status).not.toContain('Unsaved');
    f.setup.mockInput.pressKey(KeyCodes.F6);
    f.primary('w');
    expect(f.surface.panel?.title).toContain('Closing document');
    expect(f.surface.panel?.items).toEqual([]);
    await until(() => f.workspace.files.length === 1);
    expect(await readFile(f.first, 'utf8')).toContain('Xlpha');
    expect(f.surface.panel).toBeNull();
    f.setup.mockInput.pressKey('q', { ctrl: true });
    expect(f.quits).toBe(2);
  } finally {
    await f.dispose();
  }
});

test.each(['darwin', 'win32'] as const)(
  '%s drawing panel configures a wide brush and native strokes cancel, commit, undo and save',
  async (platform) => {
    const f = await fixture(platform);
    try {
      const model = f.workspace.model,
        original = model.plane.materialize();
      f.setup.mockInput.pressKey('F2', { shift: true });
      expect(f.surface.panel?.title).toBe('Drawing tools');
      f.setup.mockInput.pressKey('c');
      await f.setup.mockInput.typeText('ab', 0);
      f.setup.mockInput.pressEnter();
      expect(f.surface.panel?.error).toContain('one printable grapheme');
      expect(model.drawingSettings.char).toBe('#');
      f.primary('a');
      await f.setup.mockInput.typeText('界', 0);
      f.setup.mockInput.pressEnter();
      expect(f.surface.panel?.title).toBe('Drawing tools');
      expect(model.plane.materialize()).toEqual(original);
      f.setup.mockInput.pressArrow('down');
      f.setup.mockInput.pressEnter();
      expect(model.currentTool).toBe('brush');
      expect(f.surface.panel).toBeNull();
      const x = 15 - model.viewport.x,
        y = 5 - model.viewport.y + CANVAS_TOP;
      await f.setup.mockMouse.pressDown(x, y);
      await f.setup.mockMouse.emitMouseEvent('drag', x + 6, y);
      await f.setup.renderOnce();
      expect(f.setup.captureCharFrame().split('\n')[y]).toContain('界');
      expect(model.plane.materialize()).toEqual(original);
      f.escape();
      await f.setup.mockMouse.release(x + 6, y);
      // A fresh frame restores the hit map before starting the next native gesture.
      await f.setup.renderOnce();
      expect(model.plane.materialize()).toEqual(original);
      expect(model.canUndo).toBe(false);
      await f.setup.mockMouse.drag(x, y, x + 6, y);
      await f.setup.renderOnce();
      expect(
        [...model.plane.materialize().entries()].filter(([key]) => key.endsWith(',5'))
      ).toEqual([0, 2, 4, 6].map((dx) => [`${15 + dx},5`, { char: '界', color: '#000000' }]));
      for (const dx of [0, 2, 4, 6]) expect(model.plane.get({ x: 15 + dx, y: 5 })?.char).toBe('界');
      f.primary('z');
      expect(model.plane.materialize()).toEqual(original);
      if (platform === 'darwin') f.primary('z', true);
      else f.primary('y');
      await f.workspace.saveFile();
      const { CanvasFile } = await import('./document.ts');
      const reopened = await CanvasFile.open(f.first);
      try {
        expect(reopened.model.plane.get({ x: 21, y: 5 })?.char).toBe('界');
      } finally {
        reopened.model.dispose();
      }
      f.setup.mockInput.pressKey(KeyCodes.F2);
      expect(model.currentTool).toBe('select');
      f.setup.mockInput.pressKey('F2', { shift: true });
      await f.setup.resize(18, 5);
      await f.setup.renderOnce();
      await f.setup.mockInput.typeText('do not leak', 0);
      expect(model.plane.get({ x: 0, y: 0 })?.char).toBe('A');
      f.escape();
      expect(f.surface.panel).toBeNull();
    } finally {
      await f.dispose();
    }
  }
);

test('templates preview without mutation, accept a negative landing point, and persist one undoable insertion', async () => {
  const f = await fixture();
  try {
    const model = f.workspace.model,
      initial = model.plane.materialize(),
      version = model.version;
    const open = async () => {
      f.setup.mockInput.pressKey('F4', { shift: true });
      expect(f.surface.panel?.title).toBe('Templates and components');
      await f.setup.mockInput.typeText('button', 0);
      f.setup.mockInput.pressEnter();
      expect(f.surface.placement?.label).toBe('Button');
    };
    await open();
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).toContain('[BUTTON]');
    expect(model.version).toBe(version);
    await f.setup.mockInput.pasteBracketedText('must not paste');
    expect(model.plane.materialize()).toEqual(initial);
    f.escape();
    expect(f.surface.placement).toBeNull();
    expect(model.canUndo).toBe(false);
    await open();
    const camera = { ...model.viewport },
      landing = { ...f.surface.placement!.at };
    f.setup.mockInput.pressArrow('left', { meta: true });
    expect(model.viewport.x).toBe(camera.x - 10);
    expect(f.surface.placement?.at).toEqual(landing);
    f.setup.mockInput.pressArrow('right', { meta: true });
    f.setup.mockInput.pressArrow('left', { shift: true });
    f.setup.mockInput.pressArrow('up', { shift: true });
    expect(f.surface.placement?.at).toEqual({ x: -10, y: -10 });
    await f.setup.renderOnce();
    const confirm = f.surface.dockControls.find((item) => item.id === 'confirm-placement')!;
    await f.setup.mockMouse.click(confirm.x + 1, confirm.y);
    expect(f.surface.placement).toBeNull();
    expect(model.plane.get({ x: -10, y: -10 })?.char).toBe('[');
    expect(model.plane.get({ x: 0, y: 0 })?.char).toBe('A');
    f.primary('z');
    expect(model.plane.materialize()).toEqual(initial);
    expect(model.canUndo).toBe(false);
    f.primary('z', true);
    await f.workspace.saveFile();
    const { CanvasFile } = await import('./document.ts');
    const restored = await CanvasFile.open(f.first);
    try {
      expect(restored.model.plane.get({ x: -10, y: -10 })?.char).toBe('[');
    } finally {
      restored.model.dispose();
    }
    await open();
    model.commands.pointAt({ x: 5, y: 5 });
    expect(f.surface.placement).toBeNull();
  } finally {
    await f.dispose();
  }
});

test('dock focus navigates template placement actions before Enter commits one undoable insertion', async () => {
  const f = await fixture();
  try {
    const model = f.workspace.model,
      original = model.plane.materialize(),
      version = model.version;
    f.setup.mockInput.pressKey('F4', { shift: true });
    await f.setup.mockInput.typeText('button', 0);
    f.setup.mockInput.pressEnter();
    expect(f.surface.placement?.label).toBe('Button');
    f.setup.mockInput.pressTab();
    expect(f.surface.focusedDockControl?.id).toBe('confirm-placement');
    f.setup.mockInput.pressTab();
    expect(f.surface.focusedDockControl?.id).toBe('cancel-placement');
    f.escape();
    expect(f.surface.focusedDockControl).toBeNull();
    expect(f.surface.placement?.label).toBe('Button');
    expect(model.version).toBe(version);
    expect(model.plane.materialize()).toEqual(original);
    f.setup.mockInput.pressTab();
    f.setup.mockInput.pressEnter();
    expect(f.surface.placement).toBeNull();
    expect(model.plane.materialize()).not.toEqual(original);
    model.commands.undo();
    expect(model.plane.materialize()).toEqual(original);
  } finally {
    await f.dispose();
  }
});

test('character picker searches local data, fills selections literally, selects a brush and rejects stale targets', async () => {
  const f = await fixture();
  try {
    const model = f.workspace.model;
    const find = async (query: string) => {
      f.setup.mockInput.pressKey('F3', { shift: true });
      await until(() => !!f.surface.panel?.items.some((item) => item.includes('U+0020')));
      await f.setup.mockInput.typeText(query, 0);
      await until(() => !!f.surface.panel?.items.some((item) => item.includes(query)));
    };
    model.commands.pointAt({ x: -5, y: -4 });
    await find('U+2500');
    f.primary('x');
    await until(
      () => f.surface.panel?.input === '' && !!f.surface.panel?.items[0]?.includes('U+0020')
    );
    expect(f.clipboard).toBe('U+2500');
    f.primary('v');
    await until(() => !!f.surface.panel?.items[0]?.includes('U+2500'));
    const before = model.plane.materialize();
    f.setup.mockInput.pressEnter();
    expect(f.surface.panel?.title).toContain('BOX DRAWINGS');
    expect(model.plane.materialize()).toEqual(before);
    f.setup.mockInput.pressEnter();
    expect(model.plane.get({ x: -5, y: -4 })?.char).toBe('─');
    f.primary('z');
    expect(model.plane.materialize()).toEqual(before);
    model.commands.pointAt({ x: 0, y: 0 });
    model.commands.navigate(3, 0, true);
    await find('U+2500');
    f.setup.mockInput.pressEnter();
    f.setup.mockInput.pressEnter();
    for (const x of [0, 1, 2, 3]) expect(model.plane.get({ x, y: 0 })?.char).toBe('─');
    expect(model.plane.get({ x: 4, y: 0 })?.char).toBe('a');
    f.primary('z');
    expect(model.plane.materialize()).toEqual(before);
    await find('U+2500');
    f.setup.mockInput.pressEnter();
    f.setup.mockInput.pressArrow('down');
    f.setup.mockInput.pressEnter();
    expect(model.currentTool).toBe('brush');
    expect(model.drawingSettings.char).toBe('─');
    model.commands.pointAt({ x: -2, y: -2 });
    await find('U+2500');
    model.commands.pointAt({ x: 20, y: 20 });
    f.setup.mockInput.pressEnter();
    expect(f.surface.panel).toBeNull();
    expect(model.plane.get({ x: 20, y: 20 })).toBeUndefined();
    f.setup.mockInput.pressKey('F3', { shift: true });
    f.escape();
    await Bun.sleep(200);
    expect(f.surface.panel).toBeNull();
  } finally {
    await f.dispose();
  }
});

test('character picker pages, filters groups, accepts pointer selection and exposes Unicode controls as disabled', async () => {
  const f = await fixture();
  try {
    const model = f.workspace.model;
    f.setup.mockInput.pressKey('F3', { shift: true });
    await until(() => !!f.surface.panel?.items[0]?.includes('U+0020'));
    f.setup.mockInput.pressKey('F6');
    await until(() => !!f.surface.panel?.items[0]?.includes('U+0034'));
    f.setup.mockInput.pressKey('F5');
    await until(() => !!f.surface.panel?.items[0]?.includes('U+0020'));
    f.setup.mockInput.pressKey('F11');
    await until(() => !!f.surface.panel?.items.some((item) => item.includes('Lines')));
    await f.setup.mockInput.typeText('Lines', 0);
    f.setup.mockInput.pressEnter();
    await until(() => !!f.surface.panel?.items[0]?.includes('U+2500'));
    f.setup.mockInput.pressEnter();
    await f.setup.renderOnce();
    await f.setup.mockMouse.click(f.surface.panelLayout.x + 2, f.surface.panelLayout.itemsY + 1);
    expect(model.drawingSettings.char).toBe('─');
    expect(model.currentTool).toBe('brush');
    f.setup.mockInput.pressKey('F3', { shift: true });
    for (let i = 0; i < 3; i++) f.setup.mockInput.pressKey('F10');
    await f.setup.mockInput.typeText('U+0000', 0);
    await until(() => !!f.surface.panel?.items.some((item) => item.includes('U+0000')));
    f.setup.mockInput.pressEnter();
    expect(f.surface.panel?.error).toContain('cannot be inserted');
    expect(model.canUndo).toBe(false);
    expect(model.plane.get({ x: 0, y: 0 })?.char).toBe('A');
  } finally {
    await f.dispose();
  }
});

test('failed automatic close leaves the document open and its edits recoverable', async () => {
  const f = await fixture();
  try {
    f.workspace.model.commands.insert('X');
    await f.workspace.openFile(f.second);
    f.workspace.switchTo(0);
    await writeFile(f.first, 'EXTERNAL');
    f.primary('w');
    await until(() => Boolean(f.surface.panel?.error));
    expect(f.surface.panel?.error).toContain('changed on disk');
    expect(f.surface.panel?.items).toEqual([]);
    expect(f.workspace.files).toHaveLength(2);
    expect(f.workspace.active).toBe(f.workspace.files[0]);
    expect(f.workspace.dirty).toBe(true);
    expect(await readFile(f.first, 'utf8')).toBe('EXTERNAL');
  } finally {
    await f.dispose();
  }
});

test('cancelling a pending automatic close saves its content but keeps the document open', async () => {
  const f = await fixture();
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  const file = f.workspace.active,
    save = file.save.bind(file);
  file.save = async (model) => {
    entered.resolve();
    await release.promise;
    await save(model);
  };
  try {
    f.workspace.model.commands.insert('X');
    await f.workspace.openFile(f.second);
    f.workspace.switchTo(0);
    const content = f.workspace.model.plane.materialize();
    f.primary('w');
    await entered.promise;
    expect(f.surface.panel?.busy).toBe(true);
    await f.setup.mockInput.typeText('BLOCKED', 0);
    expect(f.workspace.model.plane.materialize()).toEqual(content);
    f.escape();
    release.resolve();
    await f.workspace.settleSaves();
    expect(f.surface.panel).toBeNull();
    expect(f.workspace.files).toHaveLength(2);
    expect(await readFile(f.first, 'utf8')).toContain('Xlpha');
  } finally {
    release.resolve();
    await f.workspace.settleSaves();
    await f.dispose();
  }
});
