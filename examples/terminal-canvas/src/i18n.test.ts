import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { getTextCellWidth } from '@chardesk/protocol';
import { TerminalI18n, systemLanguage } from './i18n.ts';
import { TerminalSettingsStore } from './settings.ts';
import { localizedMessages, messages } from './copy.ts';
import { zhCN } from './translations.ts';
import { TerminalCanvas } from './model.ts';
import { CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';
import { TerminalWorkspace } from './workspace.ts';

for (const [environment, fallback, expected] of [
  [{ LANG: 'zh_CN.UTF-8' }, 'en-US', 'zh-CN'],
  [{ LANG: 'en_US.UTF-8', LC_MESSAGES: 'zh-Hans' }, 'en', 'zh-CN'],
  [{ LC_ALL: 'C', LC_MESSAGES: 'zh_CN', LANG: 'zh_CN' }, 'zh-CN', 'en'],
  [{ LC_ALL: '  ', LANG: 'ZH_TW.UTF-8' }, 'en', 'zh-CN'],
  [{ LANG: 'ja_JP.UTF-8' }, 'zh-CN', 'en'],
  [{}, 'zh-Hans-CN', 'zh-CN'],
  [{}, 'en-GB', 'en'],
] as const) {
  test(`system language resolves ${JSON.stringify(environment)} with ${fallback}`, () => {
    expect(systemLanguage(environment, fallback)).toBe(expected);
  });
}

test('translation is isolated per host and interpolates user content only once', () => {
  const chinese = new TerminalSettingsStore({}, 'zh-CN');
  const english = new TerminalSettingsStore({}, 'en');
  const copy = localizedMessages(chinese.i18n.t);
  const t = chinese.i18n.t;
  expect(copy.settings).toBe('设置');
  expect(english.i18n.t('Settings')).toBe('Settings');
  expect(t`Remove ${'Settings {1} $& 🦀'}`).toBe('移除 Settings {1} $& 🦀');
  expect(t('Settings {0}')).toBe('Settings {0}');
  expect(t`Unknown ${'Settings'}`).toBe('Unknown Settings');
  chinese.set('language', 'en');
  expect(copy.settings).toBe('Settings');
  chinese.set('language', 'zh-CN');
  expect(copy.settings).toBe('设置');
  expect(english.values.language).toBe('system');
  expect(new TerminalI18n(() => 'en', 'zh-CN').t`Remove ${'Settings'}`).toBe('Remove Settings');
});

test('translated templates preserve placeholders and shared status messages have Chinese copy', () => {
  for (const value of Object.values(messages)) expect(zhCN[value]).toBeDefined();
  for (const [key, value] of Object.entries(zhCN)) {
    const tokens = (text: string) => [...text.matchAll(/\{\d+\}/g)].map((match) => match[0]).sort();
    expect(tokens(value)).toEqual(tokens(key));
  }
});

test('language preferences migrate old settings, survive restart and preserve unrelated data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-language-'));
  const path = join(directory, 'preferences.json');
  try {
    await writeFile(path, JSON.stringify({ version: 1, values: { panStep: 20, future: 'keep' } }));
    const store = await TerminalSettingsStore.load(path);
    expect(store.values.language).toBe('system');
    store.set('language', 'zh-CN');
    await store.flush();
    const reopened = await TerminalSettingsStore.load(path);
    expect(reopened.values.language).toBe('zh-CN');
    expect(reopened.i18n.t('Settings')).toBe('设置');
    expect(JSON.parse(await readFile(path, 'utf8')).values).toMatchObject({
      language: 'zh-CN',
      panStep: 20,
      future: 'keep',
    });
    reopened.reset('appearance');
    expect(reopened.values.language).toBe('system');
    expect(reopened.values.panStep).toBe(20);
    await reopened.flush();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function fixture() {
  const clock = new ManualClock();
  const setup = await createTestRenderer({ width: 100, height: 28, kittyKeyboard: true, clock });
  const settings = new TerminalSettingsStore({}, 'en');
  const model = new TerminalCanvas('Settings 🦀 中文');
  const surface = new CanvasSurface(
    setup.renderer,
    model,
    'Settings',
    'darwin',
    true,
    undefined,
    settings
  );
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {});
  await setup.renderOnce();
  const escape = async () => {
    setup.mockInput.pressEscape();
    clock.advance(40);
    await setup.renderOnce();
  };
  return {
    setup,
    settings,
    model,
    surface,
    escape,
    async dispose() {
      detach();
      await setup.dispose();
      model.dispose();
    },
  };
}

test('Settings changes language immediately and keeps selection, document, tool and appearance intact', async () => {
  const f = await fixture();
  try {
    f.surface.setTool('edit');
    f.model.commands.selectAll();
    const before = {
      source: f.model.plane.materialize(),
      selection: structuredClone(f.model.selection),
      viewport: { ...f.model.viewport },
      tool: f.model.currentTool,
      appearance: f.surface.appearance.getSnapshot().revision,
    };
    f.surface.feedback.show(() => f.surface.messages.copied);
    f.surface.activateDock('settings');
    const language = f.surface.panel!.items.findIndex((item) => item.startsWith('Language'));
    expect(language).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < language; i++) f.setup.mockInput.pressArrow('down');
    f.setup.mockInput.pressEnter();
    await f.setup.renderOnce();
    expect(f.settings.values.language).toBe('zh-CN');
    expect(f.surface.panel!.title).toBe('设置');
    expect(f.surface.panel!.selected).toBe(language);
    expect(f.surface.panel!.items[language]).toContain('简体中文');
    expect(f.surface.panel!.tabs).toEqual(['外观', '导航', '粘贴', '快捷键', '渲染']);
    expect(f.setup.captureCharFrame()).toContain('设置 · Tab 分区 · Enter 更改');
    expect(f.setup.captureCharFrame()).toContain('Tab 分区');
    await f.escape();
    const frame = f.setup.captureCharFrame();
    expect(frame).toContain('[设置] [小地图] [会话]');
    expect(frame).toContain('[编辑] [抓手] [样式]');
    expect(frame).toContain('┌ 样式 ');
    expect(frame).toContain('[文字] [填充] [清除]');
    expect(frame).toContain('已复制');
    expect(f.model.plane.materialize()).toEqual(before.source);
    expect(f.model.selection).toEqual(before.selection);
    expect(f.model.viewport).toEqual(before.viewport);
    expect(f.model.currentTool).toBe(before.tool);
    expect(f.model.canUndo).toBe(false);
    expect(f.surface.appearance.getSnapshot().revision).toBe(before.appearance);
    for (const control of f.surface.chromeControls)
      expect(control.width).toBe(getTextCellWidth(control.label));
    const button = f.surface.headerControls.find((control) => control.id === 'settings')!;
    await f.setup.mockMouse.click(button.x + button.width - 2, button.y);
    expect(f.surface.panel!.title).toBe('设置');
    // Reopening starts at the first row; English is the next language choice.
    for (let i = 0; i < language; i++) f.setup.mockInput.pressArrow('down');
    f.setup.mockInput.pressEnter();
    await f.setup.renderOnce();
    expect(f.settings.values.language).toBe('en');
    expect(f.surface.panel!.title).toBe('Settings');
    expect(f.surface.panel!.selected).toBe(language);
  } finally {
    await f.dispose();
  }
});

test('Chinese Style, help, context menu and nested Settings remain operable', async () => {
  const f = await fixture();
  try {
    f.settings.set('language', 'zh-CN');
    f.surface.setTool('edit');
    f.model.commands.selectAll();
    await f.setup.renderOnce();
    const foreground = f.surface.inspector!.controls[5]!;
    expect(foreground.label).toBe('文字');
    expect(foreground.width).toBe(6);
    await f.setup.mockMouse.click(foreground.x + foreground.width - 2, foreground.y);
    await f.setup.renderOnce();
    expect(f.setup.captureCharFrame()).toContain('[16] [预设]');
    for (const control of f.surface.inspector!.paletteControls)
      expect(control.width).toBe(getTextCellWidth(control.label));
    await f.escape();
    f.surface.model.editor.commands.execute('terminal.context-menu', undefined);
    await f.setup.renderOnce();
    expect(f.surface.contextMenu!.items[0]!.label).toBe('复制为文本');
    expect(f.surface.statusBar.context).toBe('操作菜单');
    await f.escape();
    f.surface.model.editor.commands.execute('terminal.help', undefined);
    await f.setup.renderOnce();
    expect(f.surface.helpLines.join('\n')).toContain('更改自动保存');
    await f.escape();
    f.surface.activateDock('settings');
    for (let i = 0; i < 3; i++) f.setup.mockInput.pressTab();
    expect(f.surface.panel!.status).toBeUndefined();
    expect(f.surface.statusBar).toMatchObject({ context: '设置', hint: 'Enter 编辑 · Esc 关闭' });
    expect(f.surface.panel!.items.some((item) => item.startsWith('复制 '))).toBe(true);
    f.setup.mockInput.pressTab();
    expect(f.surface.panel!.items[0]).toContain('Markdown 正文自动换行');
    const content = f.model.plane.materialize();
    await f.escape();
    expect(f.model.plane.materialize()).toEqual(content);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('workspace panels localize actions while saved document names and export source stay literal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-language-panels-'));
  const setup = await createTestRenderer({ width: 100, height: 28, clock: new ManualClock() });
  const workspace = await TerminalWorkspace.open(
    join(directory, 'Settings.chardesk'),
    'Settings 🦀'
  );
  let detach = () => {};
  try {
    const settings = new TerminalSettingsStore({ language: 'zh-CN' }, 'en');
    const surface = new CanvasSurface(
      setup.renderer,
      workspace.model,
      '',
      'darwin',
      true,
      undefined,
      settings
    );
    setup.renderer.root.add(surface);
    detach = attachControls(surface, () => {}, undefined, workspace);
    await setup.renderOnce();
    surface.activateDock('documents');
    expect(surface.panel!.title).toBe('文档');
    expect(surface.panel!.items.join('\n')).toContain('Settings');
    setup.mockInput.pressEscape();
    (setup.renderer.clock as ManualClock).advance(40);
    workspace.model.editor.commands.execute('terminal.tools', undefined);
    expect(surface.panel!.title).toBe('绘图工具');
    expect(surface.panel!.items[0]).toContain('文字与选区');
    setup.mockInput.pressEscape();
    (setup.renderer.clock as ManualClock).advance(40);
    workspace.model.editor.commands.execute('terminal.export', undefined);
    expect(surface.panel!.title).toBe('导出');
    expect(surface.panel!.items[0]).toContain('画布');
  } finally {
    detach();
    await setup.dispose();
    workspace.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
