import { expect, test } from 'bun:test';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAppPaths } from './appPaths.ts';
import { LocalSessions } from './sessions.ts';
import { TerminalWorkspace } from './workspace.ts';
import { CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';

async function until(check: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out');
    await Bun.sleep(2);
  }
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-session-ui-'));
  const sessions = await LocalSessions.open(
    resolveAppPaths({ environment: { CHARDESK_HOME: root } })
  );
  const workspace = TerminalWorkspace.empty();
  await sessions.attach(workspace);
  const clock = new ManualClock();
  const setup = await createTestRenderer({
    width: 110,
    height: 34,
    kittyKeyboard: true,
    screenMode: 'alternate-screen',
    clock,
  });
  const surface = new CanvasSurface(setup.renderer, workspace.model, '', 'darwin');
  setup.renderer.root.add(surface);
  let quits = 0;
  const detach = attachControls(
    surface,
    () => {
      quits++;
    },
    undefined,
    workspace,
    sessions
  );
  await setup.renderOnce();
  return {
    sessions,
    workspace,
    setup,
    surface,
    get quits() {
      return quits;
    },
    primary(key: string) {
      setup.mockInput.pressKey(key, { super: true });
    },
    escape() {
      setup.mockInput.pressEscape();
      clock.advance(40);
    },
    async dispose() {
      detach();
      await setup.dispose();
      await sessions.dispose();
      workspace.dispose();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('empty workspace blocks canvas edits but exposes sessions and creates a durable canvas without a path prompt', async () => {
  const f = await fixture();
  try {
    expect(f.surface.hasDocument).toBe(false);
    f.surface.activateDock('edit');
    await f.setup.mockInput.typeText('ghost', 0);
    await f.setup.mockInput.pasteBracketedText('ghost paste');
    f.primary('z');
    await f.setup.mockMouse.click(8, 8);
    expect(f.workspace.model.plane.materialize().size).toBe(0);
    expect(f.workspace.model.canUndo).toBe(false);
    f.surface.activateDock('documents');
    expect(f.surface.panel?.items).toEqual([]);
    expect(f.surface.panelFooterControls.map((control) => control.id)).toEqual(['new', 'open']);
    f.setup.mockInput.pressEnter();
    expect(f.workspace.files).toHaveLength(0);
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).toContain('Sessions');
    f.escape();
    f.primary('n');
    expect(f.surface.panel?.title).toBe('New canvas');
    expect(f.surface.panel?.dialog).toBe(true);
    expect(f.surface.panel?.input).toBeUndefined();
    await until(() => f.workspace.files.length === 1 && !f.surface.panel);
    expect(f.surface.hasDocument).toBe(true);
    expect(f.sessions.list()[0]?.status).toBe('ready');
    f.primary('w');
    await until(() => f.workspace.files.length === 0 && f.surface.panel?.title === 'Sessions');
    expect(f.quits).toBe(0);
    expect(f.surface.hasDocument).toBe(false);
    expect(f.sessions.list()).toHaveLength(1);
    f.setup.mockInput.pressEnter();
    await until(() => f.workspace.files.length === 1 && !f.surface.panel);
  } finally {
    await f.dispose();
  }
});

test('session panel renames, duplicates unsaved content, archives and restores through the service', async () => {
  const f = await fixture();
  try {
    f.primary('n');
    await until(() => f.workspace.files.length === 1 && !f.surface.panel);
    f.workspace.model.commands.insert('Hello 🦀');
    const original = f.workspace.active;
    f.surface.activateDock('documents');
    f.setup.mockInput.pressKey('r');
    expect(f.surface.panel?.dialog).toBe(true);
    await f.setup.mockInput.typeText('Project', 0);
    f.setup.mockInput.pressEnter();
    await until(() => f.surface.panel?.title === 'Sessions');
    expect(f.surface.panel?.items[0]).toContain('Project');
    f.setup.mockInput.pressKey('d');
    await until(() => f.workspace.files.length === 2 && !f.surface.panel);
    expect(f.workspace.model.plane.get({ x: 6, y: 0 })?.char).toBe('🦀');
    expect(f.workspace.active.address?.documentId).not.toBe(original.address?.documentId);
    const copy = f.sessions.forFile(f.workspace.active)!;
    f.surface.activateDock('documents');
    f.setup.mockInput.pressKey('a');
    await until(
      () =>
        f.sessions.list(true).length === 1 &&
        f.surface.panel?.title === 'Sessions' &&
        !f.surface.panel.busy
    );
    expect(f.workspace.files).toHaveLength(1);
    f.setup.mockInput.pressKey('F10');
    expect(f.surface.panel?.title).toBe('Sessions');
    expect(f.surface.panel?.selectedTab).toBe(1);
    expect(f.surface.panel?.items[0]).toContain('Project copy');
    f.setup.mockInput.pressEnter();
    await until(() => f.workspace.files.length === 2 && !f.surface.panel);
    expect(f.sessions.catalog.get(copy.id)?.archived).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('cancelling managed creation preserves its durable record without stealing the active editor', async () => {
  const f = await fixture();
  try {
    f.primary('n');
    f.escape();
    await until(() => f.sessions.list().some((record) => record.status === 'ready'));
    await Bun.sleep(10);
    expect(f.workspace.files).toHaveLength(0);
    expect(f.surface.panel).toBeNull();
    f.surface.activateDock('documents');
    f.setup.mockInput.pressEnter();
    await until(() => f.workspace.files.length === 1 && !f.surface.panel);
  } finally {
    await f.dispose();
  }
});

test('empty session lists keep New and Open in the clickable footer at narrow widths', async () => {
  const f = await fixture();
  try {
    await f.setup.resize(32, 24);
    f.surface.activateDock('documents');
    await f.setup.renderOnce();
    expect(f.surface.panel?.items).toEqual([]);
    expect(f.setup.captureCharFrame()).toContain('No sessions');
    f.setup.mockInput.pressTab();
    await f.setup.renderOnce();
    expect(f.surface.panel?.items).toEqual([]);
    expect(f.setup.captureCharFrame()).toContain('No archived sessions');
    const open = f.surface.panelFooterControls.find((control) => control.id === 'open')!;
    expect(open.x + open.width).toBeLessThanOrEqual(32);
    const list = f.surface.panel!;
    list.busy = true;
    await f.setup.mockMouse.click(open.x + 1, open.y);
    expect(f.surface.panel).toBe(list);
    list.busy = false;
    await f.setup.mockMouse.click(open.x + 1, open.y);
    expect(f.surface.panel?.title).toBe('Open document');
    expect(f.surface.panel?.input).toBe('');
    expect(f.workspace.files).toHaveLength(0);
    f.escape();
    f.surface.activateDock('documents');
    const create = f.surface.panelFooterControls.find((control) => control.id === 'new')!;
    await f.setup.mockMouse.click(create.x + 1, create.y);
    await until(() => f.workspace.files.length === 1 && !f.surface.panel);
    expect(f.sessions.list()).toHaveLength(1);
    expect(f.workspace.active.baselineSource).not.toBeNull();
    f.surface.activateDock('documents');
    f.setup.mockInput.pressTab();
    expect(f.surface.panel?.items).toHaveLength(1);
    expect(f.surface.panel?.items[0]).not.toContain('+ ');
  } finally {
    await f.dispose();
  }
});

test('Chinese session commands fit one footer row while errors stay inside the dialog', async () => {
  const f = await fixture();
  try {
    f.surface.settings.set('language', 'zh-CN');
    await f.setup.resize(80, 30);
    await f.sessions.create('当前画布');
    f.surface.activateDock('documents');
    await f.setup.renderOnce();
    const footer = '会话 · N 新建 · O 打开 · R 重命名 · D 复制 · A 归档 · Del 关闭 · F5 刷新';
    let frame = f.setup.captureCharFrame().split('\n');
    expect(frame[29]?.trim()).toBe(footer);
    expect(f.surface.panel?.tabs).toEqual(['画布', '已归档']);
    f.surface.panel!.error = '无法读取源文件';
    await f.setup.renderOnce();
    frame = f.setup.captureCharFrame().split('\n');
    expect(frame[29]?.trim()).toBe(footer);
    expect(frame.slice(f.surface.panelLayout.y, f.surface.footerBounds.y).join('\n')).toContain(
      '无法读取源文件'
    );
  } finally {
    await f.dispose();
  }
});

test('Sessions reuse the Settings dialog geometry, tabs, footer and outside dismissal without editing the canvas', async () => {
  const f = await fixture();
  try {
    const file = await f.sessions.create('Working');
    const archived = await f.sessions.createManaged('Archived canvas');
    await f.sessions.archive(archived.id, true, archived.revision);
    const model = f.workspace.model;
    model.commands.insert('Work 🦀');
    model.commands.pointAt({ x: 0, y: 0 });
    model.commands.navigate(3, 0, true);
    model.pan(12, -4);
    const content = model.plane.materialize(),
      interaction = structuredClone(model.getSnapshot().interaction),
      view = { ...model.viewport };
    f.surface.activateDock('settings');
    const settingsLayout = f.surface.panelLayout;
    f.escape();
    f.surface.activateDock('documents');
    expect(f.surface.panel?.dialog).toBe(true);
    expect(f.surface.panelLayout).toMatchObject({
      x: settingsLayout.x,
      y: settingsLayout.y,
      width: settingsLayout.width,
      height: settingsLayout.height,
    });
    await f.setup.renderOnce();
    const frame = f.setup.captureCharFrame().split('\n');
    const l = f.surface.panelLayout;
    expect(frame[l.y]).toContain('┌ Sessions');
    expect(frame[l.y]).not.toContain('×');
    expect(frame.slice(l.y, l.y + l.height).join('\n')).not.toContain('Tab list');
    expect(frame[f.setup.renderer.height - 1]?.trim()).toBe(
      'Sessions · N new · O open · R rename · D copy · A archive · Del close · F5 refresh'
    );
    const archivedTab = f.surface.panelTabControls[1]!;
    await f.setup.mockMouse.click(archivedTab.x + 1, archivedTab.y);
    expect(f.surface.panel?.selectedTab).toBe(1);
    expect(f.surface.panel?.items[0]).toBe('Archived canvas');
    expect(f.surface.statusBar.hint).toBe(
      'N new · O open · R rename · D copy · A restore · Del close · F5 refresh'
    );
    f.setup.mockInput.pressTab({ shift: true });
    expect(f.surface.panel?.selectedTab).toBe(0);
    expect(f.surface.panel?.items[0]).toContain('Working');
    await f.setup.mockInput.pasteBracketedText('must not edit');
    await f.setup.renderOnce();
    await f.setup.mockMouse.click(0, 0);
    expect(f.surface.panel).toBeNull();
    expect(f.workspace.active).toBe(file);
    expect(model.plane.materialize()).toEqual(content);
    expect(model.getSnapshot().interaction).toEqual(interaction);
    expect(model.viewport).toEqual(view);
    f.surface.activateDock('documents');
    f.setup.mockInput.pressKey('o');
    expect(f.surface.panel?.dialog).toBe(true);
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).toContain('Open document');
    f.escape();
  } finally {
    await f.dispose();
  }
});

test('Sessions suppress actions when the shared dialog cannot fit and recover on resize', async () => {
  const f = await fixture();
  try {
    f.surface.activateDock('documents');
    await f.setup.resize(22, 9);
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).toContain('Enlarge terminal');
    f.setup.mockInput.pressKey('n');
    f.setup.mockInput.pressEnter();
    f.setup.mockInput.pressTab();
    expect(f.sessions.list()).toHaveLength(0);
    expect(f.surface.panel?.selectedTab).toBe(0);
    await f.setup.resize(110, 34);
    await f.setup.renderOnce();
    f.setup.mockInput.pressTab();
    expect(f.surface.panel?.selectedTab).toBe(1);
    f.setup.mockInput.pressTab({ shift: true });
    expect(f.surface.panel?.selectedTab).toBe(0);
    f.escape();
    expect(f.surface.panel).toBeNull();
  } finally {
    await f.dispose();
  }
});

test('scrolling and pointer picking share dialog row geometry for long session lists', async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 18; i++) await f.sessions.createManaged(`Canvas ${i} — 🦀`);
    f.surface.activateDock('documents');
    const records = f.sessions.list();
    f.setup.mockInput.pressArrow('up');
    expect(f.surface.panel?.selected).toBe(records.length - 1);
    f.setup.mockInput.pressArrow('down');
    expect(f.surface.panel?.selected).toBe(0);
    for (let i = 0; i < 13; i++) f.setup.mockInput.pressArrow('down');
    await f.setup.renderOnce();
    const layout = f.surface.panelLayout;
    const firstVisible = 13 - layout.rows + 1;
    const frame = f.setup.captureCharFrame().split('\n');
    expect(frame[layout.itemsY]).toContain(records[firstVisible]!.name);
    expect(frame[layout.y + layout.height - 1]).toContain('└');
    await f.setup.mockMouse.click(layout.x + 3, layout.itemsY);
    await until(() => f.workspace.files.length === 1 && !f.surface.panel);
    expect(f.sessions.forFile(f.workspace.active)?.id).toBe(records[firstVisible]!.id);
  } finally {
    await f.dispose();
  }
});

test('an empty workspace leaves Tab unfocused while New and Sessions remain clickable and the session dialog owns its tabs', async () => {
  const f = await fixture();
  try {
    f.setup.mockInput.pressTab();
    expect(f.surface.focusedDockControl).toBeNull();
    expect(f.surface.panel).toBeNull();
    const create = f.surface.dockControls.find((control) => control.id === 'new')!;
    await f.setup.mockMouse.click(create.x + 1, create.y);
    await until(() => f.workspace.files.length === 1 && !f.surface.panel);
    f.primary('w');
    await until(() => !f.workspace.files.length && f.surface.panel?.title === 'Sessions');
    f.escape();
    f.setup.mockInput.pressTab();
    f.setup.mockInput.pressTab({ shift: true });
    expect(f.surface.focusedDockControl).toBeNull();
    const sessions = f.surface.headerControls.find((control) => control.id === 'documents')!;
    await f.setup.mockMouse.click(sessions.x + 1, sessions.y);
    expect(f.surface.panel?.title).toBe('Sessions');
    f.setup.mockInput.pressTab();
    expect(f.surface.panel?.selectedTab).toBe(1);
    expect(f.surface.focusedDockControl).toBeNull();
  } finally {
    await f.dispose();
  }
});

test('Sessions removal dialog separates keeping a file from deleting a managed file and defaults to Cancel', async () => {
  const f = await fixture();
  const { readOptional } = await import('./document.ts');
  try {
    const file = await f.sessions.create(),
      record = f.sessions.forFile(file)!;
    f.workspace.model.commands.insert('🦀keep');
    const before = f.workspace.model.plane.materialize();
    const remove = async () => {
      f.surface.activateDock('documents');
      f.setup.mockInput.pressKey('x');
      await until(() =>
        Boolean(f.surface.panel?.items.includes('Remove session record — keep file'))
      );
    };
    await remove();
    await f.setup.renderOnce();
    expect(f.surface.panel?.selected).toBe(0);
    expect(f.setup.captureCharFrame()).toContain('Delete managed file');
    await f.setup.mockInput.typeText('ignored', 0);
    expect(f.workspace.model.plane.materialize()).toEqual(before);
    f.escape();
    expect(f.sessions.catalog.get(record.id)).not.toBeNull();
    await remove();
    f.surface.panel!.selected = 1;
    f.setup.mockInput.pressEnter();
    await until(
      () => f.sessions.catalog.get(record.id) === null && f.surface.panel?.title === 'Sessions'
    );
    expect(await readOptional(file.path)).not.toBeNull();
    expect(f.surface.hasDocument).toBe(false);
    f.escape();
    await f.sessions.openPath(file.path);
    await remove();
    expect(f.surface.panel?.items).not.toContain('Delete managed file and session record');
    f.escape();
    const managed = await f.sessions.create(),
      owned = f.sessions.forFile(managed)!;
    await remove();
    f.surface.panel!.selected = 2;
    f.setup.mockInput.pressEnter();
    await until(
      () => f.sessions.catalog.get(owned.id) === null && f.surface.panel?.title === 'Sessions'
    );
    expect(await readOptional(managed.path)).toBeNull();
    expect(f.quits).toBe(0);
  } finally {
    await f.dispose();
  }
});

test('Tab cycles only footer tools while header actions remain clickable and configurable', async () => {
  const f = await fixture();
  try {
    f.primary('n');
    await until(() => f.workspace.files.length === 1 && !f.surface.panel);
    await f.setup.renderOnce();
    const model = f.workspace.model;
    const content = model.plane.materialize();
    expect(f.surface.headerControls.map((control) => control.label)).toEqual([
      '[Settings]',
      '[Minimap]',
      '[Sessions]',
    ]);
    expect(f.surface.dockControls.map((control) => control.label)).toEqual([
      '[Edit]',
      '[Hand]',
      '[Style]',
    ]);
    for (const key of ['F4', 'F7', 'F11']) f.setup.mockInput.pressKey(key);
    expect(f.surface.panel).toBeNull();
    expect(f.surface.minimapOpen).toBe(false);
    for (let i = 0; i < 9; i++) {
      f.setup.mockInput.pressTab();
      expect(['edit', 'hand', 'inspector']).toContain(f.surface.focusedDockControl!.id);
      expect(f.surface.focusedDockControl?.y).toBe(f.surface.footerBounds.y);
    }
    const settings = f.surface.headerControls.find((control) => control.id === 'settings')!;
    await f.setup.mockMouse.click(settings.x + 1, settings.y);
    expect(f.surface.panel?.title).toBe('Settings');
    expect(f.surface.focusedDockControl).toBeNull();
    f.escape();
    for (const id of ['minimap', 'documents'] as const) {
      const control = f.surface.headerControls.find((control) => control.id === id)!;
      await f.setup.mockMouse.click(control.x + 1, control.y);
      if (id === 'minimap') expect(f.surface.minimapOpen).toBe(true);
      else expect(f.surface.panel?.title).toBe('Sessions');
    }
    f.escape();
    model.editor.keymap.setUserBindings('terminal.documents', [['F7']]);
    f.setup.mockInput.pressKey('F7');
    expect(f.surface.panel?.title).toBe('Sessions');
    f.escape();
    model.editor.keymap.setUserBindings('terminal.documents', null);
    f.setup.mockInput.pressKey('F7');
    expect(f.surface.panel).toBeNull();
    expect(model.plane.materialize()).toEqual(content);
    expect(model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});
