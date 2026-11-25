import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { LocalSessions } from './sessions.ts';
import { TerminalWorkspace } from './workspace.ts';
import { resolveAppPaths } from './appPaths.ts';
import { startLocalEndpoint, callRunningSession } from '../../../packages/local-runtime/src/ipc.ts';
import { CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';
import { agentSetupText } from '../../../packages/terminal/src/agentSetup.ts';

test('live agent identities cross IPC, remain per Canvas, and never change the human view', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-agents-ipc-'));
  const paths = resolveAppPaths({ environment: { CHARDESK_HOME: root } });
  const sessions = await LocalSessions.open(paths),
    workspace = TerminalWorkspace.empty();
  let endpoint: Awaited<ReturnType<typeof startLocalEndpoint>> | undefined;
  try {
    await sessions.attach(workspace);
    const shared = await sessions.create('Shared'),
      id = sessions.forFile(shared)!.id;
    const other = await sessions.create('Human');
    const humanId = sessions.forFile(other)!.id;
    workspace.model.commands.insert('HUMAN界');
    workspace.model.commands.selectAll();
    const view = structuredClone({
      viewport: workspace.model.viewport,
      cursor: workspace.model.cursor,
      selection: workspace.model.selection,
      tool: workspace.model.currentTool,
    });
    const running: string[] = [];
    const detach = sessions.agents.subscribe(() => {
      running.push(
        ...sessions.agents
          .list(id)
          .filter((row) => row.status === 'working')
          .map((row) => row.agentId)
      );
    });
    endpoint = await startLocalEndpoint(paths, workspace, sessions);
    const call = (
      name: string,
      input: Record<string, unknown>,
      agent?: { id: string; name: string }
    ) => callRunningSession(paths, { file: shared.path }, name, input, agent);
    const [read, write] = await Promise.all([
      call('canvas_read', { viewport: [0, 0, 10, 1] }, { id: 'reader', name: 'Reader' }),
      call('canvas_write', { at: [0, 0], content: 'AGENT' }, { id: 'writer', name: 'Writer' }),
    ]);
    expect(read.found && write.found).toBe(true);
    expect(write.result).toMatchObject({ persistence: 'saved' });
    expect(
      sessions.agents
        .list(id)
        .map((row) => row.agentId)
        .sort()
    ).toEqual(['reader', 'writer']);
    expect(sessions.agents.list(id).every((row) => row.status === 'completed')).toBe(true);
    expect(sessions.agents.list(humanId)).toEqual([]);
    expect(running).toContain('reader');
    expect(running).toContain('writer');
    await call('canvas_read', { viewport: [0, 0, 10, 1] });
    await call(
      'canvas_read',
      { viewport: [0, 0, 10, 1] },
      { id: 'reader', name: 'Reader renamed' }
    );
    expect(sessions.agents.list(id)).toHaveLength(3);
    expect(sessions.agents.list(id).find((row) => row.agentId === 'reader')?.name).toBe(
      'Reader renamed'
    );
    const invalid = await call(
      'canvas_write',
      { at: [0, 0], content: 'NO' },
      { id: 'spoof', name: '\x1b[31m' }
    );
    expect(invalid.result).toMatchObject({ ok: false, code: 'invalid_request' });
    const after = await call('canvas_read', { viewport: [0, 0, 10, 1] });
    expect((after.result as { content: string }).content).toContain('AGENT');
    expect(sessions.agents.list(id)).toHaveLength(3);
    expect({
      viewport: workspace.model.viewport,
      cursor: workspace.model.cursor,
      selection: workspace.model.selection,
      tool: workspace.model.currentTool,
    }).toEqual(view);
    detach();
  } finally {
    await endpoint?.();
    await sessions.dispose();
    workspace.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('footer agent list is a read-only dialog and follows the active Canvas without stealing selection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-agents-ui-'));
  const sessions = await LocalSessions.open(
    resolveAppPaths({ environment: { CHARDESK_HOME: root } })
  );
  const workspace = TerminalWorkspace.empty(),
    clock = new ManualClock();
  const setup = await createTestRenderer({ width: 100, height: 24, clock, kittyKeyboard: true });
  let detach = () => {};
  try {
    await sessions.attach(workspace);
    const file = await sessions.create('Shared'),
      id = sessions.forFile(file)!.id;
    workspace.model.commands.insert('人类 🦀');
    workspace.model.commands.selectAll();
    const surface = new CanvasSurface(setup.renderer, workspace.model, 'Agents', 'darwin');
    setup.renderer.root.add(surface);
    let copied = 0;
    detach = attachControls(
      surface,
      () => {},
      {
        read: async () => ({}),
        write: async () => {
          copied++;
          return { status: 'written' };
        },
      },
      workspace,
      sessions
    );
    const finish = sessions.agents.begin(id, { id: 'one', name: 'Layout' }, 'canvas_write');
    sessions.agents.begin(id, { id: 'two', name: 'Review' }, 'canvas_read')();
    const selection = structuredClone(workspace.model.selection),
      version = workspace.model.documents.getContentVersion();
    await setup.renderOnce();
    const row = () => setup.captureCharFrame().split('\n')[surface.footerBounds.y]!;
    expect(setup.captureCharFrame().split('\n')[surface.footerBounds.y + 1]).toContain(
      'F1 for shortcuts'
    );
    expect(row()).toContain('Agents 2');
    const entry = surface.viewStatusControls.find((control) => control.id === 'agents')!;
    await setup.mockMouse.click(entry.x, entry.y);
    await setup.renderOnce();
    expect(surface.panel).toMatchObject({ dialog: true, title: 'Agents' });
    expect(surface.panel!.items.some((text) => text === 'Layout · Writing')).toBe(true);
    expect(surface.panel!.items.some((text) => text === 'Review · Read canvas')).toBe(true);
    setup.mockInput.pressKey('x');
    setup.mockInput.pressKey('y', { ctrl: true });
    expect(copied).toBe(0);
    expect(workspace.model.documents.getContentVersion()).toBe(version);
    finish();
    await setup.renderOnce();
    expect(surface.panel!.items.every((text) => !text.includes('Writing'))).toBe(true);
    setup.mockInput.pressEscape();
    clock.advance(40);
    expect(surface.panel).toBeNull();
    expect(workspace.model.selection).toEqual(selection);
    const other = await sessions.create('Other');
    await setup.renderOnce();
    expect(row()).toContain('Agents');
    expect(row()).not.toContain('Agents 0');
    sessions.agents.begin(id, { id: 'one', name: 'Layout' }, 'canvas_read')();
    workspace.switchTo(workspace.files.indexOf(file));
    await setup.renderOnce();
    expect(row()).toContain('Agents 1');
    surface.model.editor.commands.execute('terminal.agents', undefined, 'test');
    workspace.switchTo(workspace.files.indexOf(other));
    expect(surface.panel).toBeNull();
    await setup.resize(40, 12);
    await setup.renderOnce();
    const controls = surface.viewStatusControls.sort((a, b) => a.x - b.x);
    expect(controls[0]!.x + controls[0]!.width).toBeLessThan(controls[1]!.x);
    detach();
    detach = () => {};
    expect(surface.viewStatusControls).toEqual([]);
  } finally {
    detach();
    await setup.dispose();
    await sessions.dispose();
    workspace.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

async function inboxFixture(width = 90, height = 24) {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-inbox-ui-'));
  const sessions = await LocalSessions.open(
    resolveAppPaths({ environment: { CHARDESK_HOME: root } })
  );
  const workspace = TerminalWorkspace.empty(),
    clock = new ManualClock();
  await sessions.attach(workspace);
  const file = await sessions.create('Inbox'),
    id = sessions.forFile(file)!.id;
  const setup = await createTestRenderer({ width, height, clock, kittyKeyboard: true });
  const surface = new CanvasSurface(setup.renderer, workspace.model, 'Inbox', 'darwin');
  setup.renderer.root.add(surface);
  const copied: string[] = [];
  const detach = attachControls(
    surface,
    () => {},
    {
      read: async () => ({}),
      write: async (data) => {
        copied.push(data.plain);
        return { status: 'written' };
      },
    },
    workspace,
    sessions
  );
  await setup.renderOnce();
  return {
    setup,
    surface,
    sessions,
    workspace,
    id,
    clock,
    copied,
    queue(name = 'One') {
      const finish = sessions.agents.begin(id, { id: 'one', name }, 'canvas_read');
      finish();
    },
    row() {
      return setup.captureCharFrame().split('\n')[surface.footerBounds.y]!.trim();
    },
    async open() {
      const entry = surface.viewStatusControls.find((item) => item.id === 'agents')!;
      await setup.mockMouse.click(entry.x, entry.y);
      await setup.renderOnce();
    },
    close() {
      surface.panel!.onClose!();
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

test('Agent setup defaults without unread, scrolls as text, and copies the original complete handoff', async () => {
  const f = await inboxFixture(40, 18);
  try {
    const version = f.workspace.model.documents.getContentVersion();
    await f.open();
    const panel = f.surface.panel!;
    expect(panel.selectedTab).toBe(2);
    expect(panel.items).toEqual([]);
    expect(panel.onPick).toBeUndefined();
    expect(panel.actions?.map((action) => action.label)).toEqual(['Copy']);
    const text = agentSetupText(f.surface.t);
    expect(panel.scrollArea!.lines.join('\n')).not.toBe(text);
    expect(panel.scrollArea!.lines.join('')).toBe(text.replaceAll('\n', ''));
    for (const part of [
      'Skill:',
      'CLI:',
      'MCP:',
      'More:',
      'npx skills add https://github.com/sayhi-bzb/chardesk --skill chardesk',
      'bun add -g @chardesk/cli',
      'npx -y @chardesk/mcp',
      'https://docs.chardesk.com/llms.txt',
    ])
      expect(text).toContain(part);
    f.setup.mockInput.pressArrow('down');
    expect(panel.scrollArea!.scrollTop).toBe(1);
    expect(panel.selected).toBe(0);
    f.setup.mockInput.pressEnter();
    await Promise.resolve();
    expect(f.copied).toEqual([text]);
    f.surface.settings.set('language', 'zh-CN');
    await f.setup.renderOnce();
    expect(panel.actions?.[0]?.label).toBe('复制');
    const copy = f.surface.panelFooterControls.find((action) => action.id === 'agent-copy-setup')!;
    await f.setup.mockMouse.click(copy.x, copy.y);
    expect(f.copied[1]).toBe(agentSetupText(f.surface.t));
    expect(f.copied[1]).toContain('请为当前 coding agent');
    expect(f.workspace.model.documents.getContentVersion()).toBe(version);
  } finally {
    await f.dispose();
  }
});

test('Agent navigation cycles all views; setup never marks new activities as read', async () => {
  const f = await inboxFixture();
  try {
    await f.open();
    f.queue('Arrived while reading setup');
    await f.setup.renderOnce();
    expect(f.surface.panel?.selectedTab).toBe(2);
    f.close();
    expect(f.sessions.agents.count(f.id)).toBe(1);
    await f.open();
    expect(f.surface.panel?.selectedTab).toBe(0);
    f.setup.mockInput.pressTab();
    expect(f.surface.panel?.selectedTab).toBe(1);
    f.setup.mockInput.pressTab();
    expect(f.surface.panel?.selectedTab).toBe(2);
    f.setup.mockInput.pressTab();
    expect(f.surface.panel?.selectedTab).toBe(0);
    f.setup.mockInput.pressTab({ shift: true });
    expect(f.surface.panel?.selectedTab).toBe(2);
    f.setup.mockInput.pressArrow('down');
    expect(f.surface.panel?.scrollArea?.scrollTop).toBe(1);
    f.setup.mockInput.pressTab();
    expect(f.surface.panel?.scrollArea).toBeUndefined();
    const agentTab = f.surface.panelTabControls.find((tab) => tab.index === 2)!;
    await f.setup.mockMouse.click(agentTab.x, agentTab.y);
    expect(f.surface.panel?.selectedTab).toBe(2);
    expect(f.surface.panel?.scrollArea?.scrollTop).toBe(0);
    f.close();
    expect(f.sessions.agents.count(f.id)).toBe(0);
  } finally {
    await f.dispose();
  }
});

test('Agent Copy has a fixed dialog footer, separate from scrolling text and application feedback', async () => {
  const f = await inboxFixture();
  try {
    await f.open();
    for (const language of ['en', 'zh-CN'] as const) {
      f.surface.settings.set('language', language);
      for (const width of [90, 40, 24]) {
        await f.setup.resize(width, 18);
        f.surface.feedback.show('Clipboard feedback');
        f.setup.mockInput.pressKey('END');
        await f.setup.renderOnce();
        const layout = f.surface.panelLayout;
        const copy = f.surface.panelFooterControls.find(
          (action) => action.id === 'agent-copy-setup'
        )!;
        expect(copy.y).toBe(layout.y + layout.height - 2);
        expect(copy.y).toBeLessThan(f.surface.footerBounds.y);
        expect(copy.x + copy.width).toBe(layout.x + layout.width - 2);
        expect(layout.itemsY + layout.rows).toBeLessThan(copy.y);
        const row = f.setup.captureCharFrame().split('\n')[copy.y]!;
        expect(row).toContain(language === 'en' ? '[ Copy ]' : '[ 复制 ]');
        const count = f.copied.length;
        await f.setup.mockMouse.click(copy.x, copy.y);
        await Promise.resolve();
        expect(f.copied.length).toBe(count + 1);
        expect(f.copied.at(-1)).toBe(agentSetupText(f.surface.t));
        expect(f.surface.panel?.selectedTab).toBe(2);
        f.setup.mockInput.pressKey('HOME');
        await f.setup.renderOnce();
        expect(f.surface.panelFooterControls.find((action) => action.id === copy.id)).toMatchObject(
          {
            x: copy.x,
            y: copy.y,
            width: copy.width,
          }
        );
      }
    }
    f.surface.panel!.onTab!(0);
    await f.setup.renderOnce();
    expect(f.surface.panel?.actionPlacement).toBe('dialog-footer');
    expect(f.surface.panelFooterControls.some((action) => action.id === 'agent-copy-setup')).toBe(
      false
    );
    f.surface.panel!.onTab!(2);
    await f.setup.resize(18, 7);
    await f.setup.renderOnce();
    expect(f.surface.panelFooterControls).toEqual([]);
    expect(f.setup.captureCharFrame()).toContain('Enlarge terminal');
    await f.setup.resize(90, 24);
    await f.setup.renderOnce();
    expect(f.surface.panelFooterControls.map((action) => action.id)).toEqual(['agent-copy-setup']);
  } finally {
    await f.dispose();
  }
});

test('Agent tab stays right aligned at narrow widths, including while the Read tab is selected', async () => {
  const f = await inboxFixture();
  try {
    await f.open();
    for (const width of [90, 40, 24]) {
      await f.setup.resize(width, 18);
      for (const selected of [0, 1, 2]) {
        f.surface.panel!.onTab!(selected);
        await f.setup.renderOnce();
        const tabs = f.surface.panelTabControls;
        const agent = tabs.find((tab) => tab.index === 2)!;
        const layout = f.surface.panelLayout;
        expect(agent.x + agent.width).toBe(layout.x + layout.width - 2);
        expect(tabs.some((tab) => tab.index === selected)).toBe(true);
        for (const tab of tabs.filter((tab) => tab.index !== 2))
          expect(tab.x + tab.width).toBeLessThan(agent.x);
      }
    }
  } finally {
    await f.dispose();
  }
});

test('Agents hides zero and counts unread calls; the dialog separates unread/read records', async () => {
  const f = await inboxFixture();
  try {
    expect(f.row()).toContain('Agents');
    expect(f.row()).not.toContain('Agents 0');
    expect(f.setup.captureCharFrame().split('\n')[f.surface.footerBounds.y + 1]!.trim()).toBe(
      'F1 for shortcuts'
    );
    f.queue();
    f.queue();
    await f.setup.renderOnce();
    expect(f.row()).toContain('Agents 2');
    const version = f.workspace.model.documents.getContentVersion();
    await f.open();
    expect(f.surface.panel?.tabs).toEqual(['Unread', 'Read', 'Agent']);
    expect(f.surface.panel?.selectedTab).toBe(0);
    expect(f.surface.panel?.items).toHaveLength(2);
    f.setup.mockInput.pressTab();
    await f.setup.renderOnce();
    expect(f.surface.panel?.selectedTab).toBe(1);
    expect(f.surface.panel?.items).toEqual([]);
    f.setup.mockInput.pressTab({ shift: true });
    await f.setup.renderOnce();
    expect(f.surface.panel?.selectedTab).toBe(0);
    f.close();
    await f.setup.renderOnce();
    expect(f.sessions.agents.count(f.id)).toBe(0);
    expect(f.row()).toContain('Agents');
    expect(f.row()).not.toContain('Agents 0');
    expect(f.setup.captureCharFrame().split('\n')[f.surface.footerBounds.y + 1]!.trim()).toBe(
      'F1 for shortcuts'
    );
    await f.open();
    expect(f.surface.panel?.selectedTab).toBe(2);
    expect(f.surface.panel?.items).toEqual([]);
    const readTab = f.surface.panelTabControls[1]!;
    await f.setup.mockMouse.click(readTab.x, readTab.y);
    await f.setup.renderOnce();
    expect(f.surface.panel?.items).toHaveLength(2);
    expect(f.surface.panel?.items.every((item) => item === 'One · Read canvas')).toBe(true);
    expect(f.workspace.model.documents.getContentVersion()).toBe(version);
    f.surface.settings.set('language', 'zh-CN');
    await f.setup.renderOnce();
    expect(f.surface.panel?.tabs).toEqual(['未读', '已读', 'Agent']);
  } finally {
    await f.dispose();
  }
});

test('Read all shares the dialog footer with pagination and acknowledges offscreen pages without changing Canvas state', async () => {
  const f = await inboxFixture();
  try {
    for (let i = 0; i < 105; i++) f.queue(`Activity ${i}`);
    const finish = f.sessions.agents.begin(f.id, { id: 'working', name: 'Working' }, 'canvas_code');
    f.sessions.agents.begin('other', { id: 'one', name: 'Other' }, 'canvas_read')();
    const before = structuredClone({
      cursor: f.workspace.model.cursor,
      selection: f.workspace.model.selection,
      viewport: f.workspace.model.viewport,
      version: f.workspace.model.documents.getContentVersion(),
    });
    await f.open();
    const button = f.surface.panelFooterControls.find((action) => action.id === 'agent-read-all')!;
    expect(button).toBeDefined();
    expect(button.x + button.width).toBe(f.surface.panelLayout.x + f.surface.panelLayout.width - 2);
    expect(button.y).toBe(f.surface.panelLayout.y + f.surface.panelLayout.height - 2);
    expect(f.setup.captureCharFrame().split('\n')[button.y]).toContain('1–50 of 106 activities');
    expect(f.surface.panelFooterControls.map((action) => action.id)).toEqual(['agent-read-all']);
    expect(f.surface.panel?.items).toHaveLength(50);
    f.setup.mockInput.pressArrow('right');
    await f.setup.renderOnce();
    expect(f.surface.panel?.footerStatus).toBe('51–100 of 106 activities');
    await f.setup.mockMouse.click(button.x, button.y);
    await f.setup.renderOnce();
    expect(f.sessions.agents.count(f.id)).toBe(0);
    expect(f.sessions.agents.count(f.id, true)).toBe(106);
    expect(f.sessions.agents.count('other')).toBe(1);
    expect(f.surface.panel?.selectedTab).toBe(0);
    expect(f.surface.panel?.items).toEqual([]);
    expect(f.row()).not.toContain('Agents 106');
    expect({
      cursor: f.workspace.model.cursor,
      selection: f.workspace.model.selection,
      viewport: f.workspace.model.viewport,
      version: f.workspace.model.documents.getContentVersion(),
    }).toEqual(before);
    finish();
    f.queue('Arrived after read all');
    f.close();
    expect(f.sessions.agents.count(f.id)).toBe(2);
  } finally {
    await f.dispose();
  }
});

test('Read all stays right aligned and preserves original footer text without pagination buttons', async () => {
  const f = await inboxFixture();
  try {
    for (let i = 0; i < 60; i++) f.queue();
    await f.open();
    for (const language of ['en', 'zh-CN'] as const) {
      f.surface.settings.set('language', language);
      for (const width of [90, 40, 24]) {
        await f.setup.resize(width, 18);
        await f.setup.renderOnce();
        const layout = f.surface.panelLayout;
        const button = f.surface.panelFooterControls.find(
          (action) => action.id === 'agent-read-all'
        )!;
        expect(button.y).toBe(layout.y + layout.height - 2);
        expect(button.x + button.width).toBe(layout.x + layout.width - 2);
        expect(layout.itemsY + layout.rows).toBeLessThan(button.y);
        const row = f.setup.captureCharFrame().split('\n')[button.y]!;
        expect(row).toContain(language === 'en' ? '[ Read all ]' : '[ 全读 ]');
        expect(f.surface.panel?.footerStatus).toBe(
          language === 'en' ? '1–50 of 60 activities' : '第 1–50 条，共 60 条活动'
        );
        expect(f.surface.panelFooterControls.map((action) => action.id)).toEqual([
          'agent-read-all',
        ]);
        if (width === 90) expect(row).toContain(f.surface.panel!.footerStatus!);
      }
    }
    f.surface.panel!.onTab!(2);
    await f.setup.renderOnce();
    const copy = f.surface.panelFooterControls.find((action) => action.id === 'agent-copy-setup')!;
    expect(copy.x + copy.width).toBe(f.surface.panelLayout.x + f.surface.panelLayout.width - 2);
    expect(f.surface.panel?.footerStatus).toBeUndefined();
    expect(f.surface.panelFooterControls.some((action) => action.id === 'agent-read-all')).toBe(
      false
    );
  } finally {
    await f.dispose();
  }
});

test('Read all failure keeps unread entries and reports the error without leaving the dialog', async () => {
  const f = await inboxFixture();
  try {
    f.queue();
    await f.open();
    f.sessions.agents.markAllRead = () => false;
    const button = f.surface.panelFooterControls.find((action) => action.id === 'agent-read-all')!;
    await f.setup.mockMouse.click(button.x, button.y);
    await f.setup.renderOnce();
    expect(f.sessions.agents.count(f.id)).toBe(1);
    expect(f.surface.panel?.selectedTab).toBe(0);
    expect(f.surface.feedbackControl?.message).toContain('Could not mark activity as read');
  } finally {
    await f.dispose();
  }
});

test('only painted rows are read; new arrivals before close and offscreen rows stay unread', async () => {
  const f = await inboxFixture(80, 16);
  try {
    for (let i = 0; i < 20; i++) f.queue(`Activity ${i}`);
    await f.open();
    const painted = Math.min(f.surface.panelLayout.rows, 20);
    expect(painted).toBeLessThan(20);
    f.queue('New arrival');
    f.close();
    expect(f.sessions.agents.count(f.id, true)).toBe(painted);
    expect(f.sessions.agents.count(f.id)).toBe(21 - painted);
    expect(f.sessions.agents.list(f.id).some((entry) => entry.name === 'New arrival')).toBe(true);
    await f.open();
    const unread = f.sessions.agents.list(f.id);
    const seen = new Set(unread.slice(0, f.surface.panelLayout.rows).map((entry) => entry.id));
    for (let i = 0; i < unread.length; i++) f.setup.mockInput.pressArrow('down');
    await f.setup.renderOnce();
    const start = Math.max(0, f.surface.panel!.selected - f.surface.panelLayout.rows + 1);
    for (const entry of unread.slice(start, start + f.surface.panelLayout.rows)) seen.add(entry.id);
    f.close();
    expect(f.sessions.agents.count(f.id, true)).toBe(painted + seen.size);
  } finally {
    await f.dispose();
  }
});

test('a completion not yet painted remains unread; replacing the dialog acknowledges viewed revisions', async () => {
  const f = await inboxFixture();
  try {
    const finish = f.sessions.agents.begin(f.id, { id: 'one', name: 'One' }, 'canvas_code');
    await f.open();
    expect(f.surface.panel?.items[0]).toContain('Running code');
    finish();
    f.close();
    expect(f.sessions.agents.count(f.id)).toBe(1);
    expect(f.sessions.agents.list(f.id)[0]).toMatchObject({ revision: 2, readRevision: 1 });
    await f.open();
    expect(f.surface.panel?.items[0]).toContain('Code');
    f.setup.mockInput.pressKey('F1');
    expect(f.surface.help).toBe(true);
    expect(f.sessions.agents.count(f.id)).toBe(0);
    expect(f.sessions.agents.count(f.id, true)).toBe(1);
  } finally {
    await f.dispose();
  }
});

test('a panel too small to display records never consumes unread activity', async () => {
  const f = await inboxFixture(18, 7);
  try {
    f.queue();
    f.surface.model.editor.commands.execute('terminal.agents', undefined, 'test');
    await f.setup.renderOnce();
    f.close();
    expect(f.sessions.agents.count(f.id)).toBe(1);
    await f.setup.resize(90, 24);
    await f.setup.renderOnce();
    await f.open();
    f.close();
    expect(f.sessions.agents.count(f.id)).toBe(0);
  } finally {
    await f.dispose();
  }
});

test('unread badge uses terminal red while activity rows keep only name, action and relative time', async () => {
  const { RGBA } = await import('@opentui/core');
  const f = await inboxFixture();
  try {
    f.queue('Builder');
    await f.setup.renderOnce();
    const control = f.surface.viewStatusControls.find((item) => item.id === 'agents')!;
    expect(control.badge).toEqual({ text: '1', offset: 7 });
    f.setup.renderer.currentRenderBuffer.withBuffers((cells) => {
      const badge = control.y * cells.width + control.x + control.badge!.offset;
      const label = control.y * cells.width + control.x;
      expect(RGBA.fromArray(cells.fg.slice(badge * 4, badge * 4 + 4)).slot).toBe(1);
      expect(
        RGBA.fromArray(cells.fg.slice(label * 4, label * 4 + 4)).equals(f.surface.colors.foreground)
      ).toBe(true);
    });
    await f.open();
    expect(f.surface.panel?.items).toEqual(['Builder · Read canvas']);
    expect(f.surface.panel?.itemHints).toEqual(['Just now']);
    f.close();
    await f.setup.renderOnce();
    expect(
      f.surface.viewStatusControls.find((item) => item.id === 'agents')?.badge
    ).toBeUndefined();
  } finally {
    await f.dispose();
  }
});

test('Enter and pointer picking open exact call details; copy actions and Esc preserve list position', async () => {
  const f = await inboxFixture();
  const argv = [
    'chardesk',
    'canvas',
    'write',
    '--file',
    'two words.chardesk',
    '--agent',
    'one',
    '--json',
  ];
  const input = { at: [2, 3], content: '🦀\ntext $literal' };
  try {
    f.sessions.agents.begin(f.id, { id: 'one', name: 'Writer' }, 'canvas_write', { argv, input })();
    f.queue('Newer');
    const version = f.workspace.model.documents.getContentVersion();
    await f.open();
    f.setup.mockInput.pressArrow('down');
    expect(f.surface.panel?.selected).toBe(1);
    f.setup.mockInput.pressEnter();
    await f.setup.renderOnce();
    expect(f.surface.panel?.title).toBe('Call details');
    expect(f.surface.panel?.tabs).toBeUndefined();
    expect(f.surface.panel?.scrollArea?.lines.join('\n')).toContain('chardesk canvas write');
    expect(f.surface.panel?.scrollArea?.lines.join('\n')).toContain('Input JSON');
    f.setup.mockInput.pressTab();
    f.setup.mockInput.pressEnter();
    await Promise.resolve();
    expect(f.copied[0]).toContain("--file 'two words.chardesk'");
    f.setup.mockInput.pressTab();
    f.setup.mockInput.pressEnter();
    await Promise.resolve();
    expect(JSON.parse(f.copied[1]!)).toEqual(input);
    expect(f.sessions.agents.count(f.id)).toBe(2);
    f.setup.mockInput.pressEscape();
    f.clock.advance(40);
    await f.setup.renderOnce();
    expect(f.surface.panel?.title).toBe('Agents');
    expect(f.surface.panel?.selected).toBe(1);
    const layout = f.surface.panelLayout;
    await f.setup.mockMouse.click(layout.x + 3, layout.itemsY + 1);
    await f.setup.renderOnce();
    expect(f.surface.panel?.title).toBe('Call details');
    const original = f.surface.panel!.scrollArea!.lines.join('');
    await f.setup.resize(40, 18);
    await f.setup.renderOnce();
    expect(f.surface.panel?.scrollArea?.lines.join('')).toBe(original);
    expect(f.workspace.model.documents.getContentVersion()).toBe(version);
    f.close();
    expect(f.sessions.agents.count(f.id)).toBe(0);
  } finally {
    await f.dispose();
  }
});

test('legacy activity opens a clear empty detail view without fabricating commands', async () => {
  const f = await inboxFixture();
  try {
    f.queue();
    await f.open();
    f.setup.mockInput.pressEnter();
    await f.setup.renderOnce();
    expect(f.surface.panel?.scrollArea?.lines.join(' ')).toBe(
      'No call details recorded for this activity'
    );
    expect(f.surface.panel?.actions?.map((action) => action.id)).toEqual(['agent-back']);
    f.setup.mockInput.pressEscape();
    f.clock.advance(40);
    expect(f.surface.panel?.tabs).toEqual(['Unread', 'Read', 'Agent']);
  } finally {
    await f.dispose();
  }
});

test('CLI routing stores original argv and sourceRef JSON while applying the resolved content', async () => {
  const { executeLocal } = await import('../../../packages/local-runtime/src/command.ts');
  const { writeFile } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'chardesk-argv-routing-'));
  const previous = process.env.CHARDESK_HOME;
  process.env.CHARDESK_HOME = root;
  const sessions = await LocalSessions.open(resolveAppPaths()),
    workspace = TerminalWorkspace.empty();
  let endpoint: Awaited<ReturnType<typeof startLocalEndpoint>> | undefined;
  try {
    await sessions.attach(workspace);
    const file = await sessions.create('Original input'),
      id = sessions.forFile(file)!.id;
    const sourceRef = join(root, 'two words.txt');
    await writeFile(sourceRef, 'resolved 🦀');
    const input = { at: [2, 3], sourceRef };
    const argv = ['chardesk', 'canvas', 'write', '--session', id, '--agent', 'one', '--json'];
    endpoint = await startLocalEndpoint(resolveAppPaths(), workspace, sessions);
    const result = await executeLocal('canvas_write', input, {
      session: id,
      agent: { id: 'one', name: 'Writer' },
      invocation: { argv },
    });
    expect(result).toMatchObject({ persistence: 'saved' });
    const entry = sessions.agents.list(id)[0]!;
    expect(sessions.agents.details(id, entry.id)).toEqual({ argv, input: JSON.stringify(input) });
    expect(workspace.model.plane.get({ x: 2, y: 3 })?.char).toBe('r');
  } finally {
    await endpoint?.();
    await sessions.dispose();
    workspace.dispose();
    if (previous === undefined) delete process.env.CHARDESK_HOME;
    else process.env.CHARDESK_HOME = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('call details are a read-only scroll viewport, with wheel and keyboard scrolling independent of selection', async () => {
  const { RGBA } = await import('@opentui/core');
  const f = await inboxFixture();
  try {
    f.sessions.agents.begin(f.id, { id: 'one', name: 'Reader' }, 'canvas_read', {
      argv: ['chardesk', 'canvas', 'read', '--session', f.id, '--json'],
      input: { lines: Array.from({ length: 60 }, (_, i) => `line_${i}`) },
    })();
    f.queue('Newer');
    const version = f.workspace.model.documents.getContentVersion();
    await f.open();
    f.setup.mockInput.pressArrow('down');
    f.setup.mockInput.pressEnter();
    await f.setup.renderOnce();
    const panel = f.surface.panel!,
      area = panel.scrollArea!;
    expect(panel.items).toEqual([]);
    expect(area.scrollTop).toBe(0);
    expect(panel.selected).toBe(0);
    let layout = f.surface.panelLayout;
    let body = f.setup
      .captureCharFrame()
      .split('\n')
      .slice(layout.itemsY, layout.itemsY + layout.rows)
      .join('\n');
    expect(body).not.toContain('›');
    expect(body).toContain('┃');
    f.setup.renderer.currentRenderBuffer.withBuffers((cells) => {
      const at = layout.itemsY * cells.width + layout.x + 2;
      expect(RGBA.fromArray(cells.bg.slice(at * 4, at * 4 + 4)).intent).toBe('default');
    });
    f.setup.mockInput.pressArrow('down');
    expect(panel.scrollArea!.scrollTop).toBe(1);
    expect(panel.selected).toBe(0);
    await f.setup.mockMouse.click(layout.x + 3, layout.itemsY + 2);
    expect(panel.scrollArea!.scrollTop).toBe(1);
    expect(panel.selected).toBe(0);
    await f.setup.mockMouse.scroll(layout.x + 3, layout.itemsY + 2, 'down');
    const beforePage = panel.scrollArea!.scrollTop;
    expect(beforePage).toBeGreaterThan(1);
    f.setup.mockInput.pressKey('\x1b[6~');
    expect(panel.scrollArea!.scrollTop).toBe(beforePage + layout.rows);
    f.setup.mockInput.pressKey('END');
    expect(panel.scrollArea!.scrollTop).toBe(panel.scrollArea!.lines.length - layout.rows);
    f.setup.mockInput.pressArrow('down');
    expect(panel.scrollArea!.scrollTop).toBe(panel.scrollArea!.lines.length - layout.rows);
    await f.setup.resize(40, 18);
    await f.setup.renderOnce();
    f.setup.mockInput.pressKey('END');
    await f.setup.resize(90, 24);
    await f.setup.renderOnce();
    layout = f.surface.panelLayout;
    expect(panel.scrollArea!.scrollTop).toBeLessThanOrEqual(
      Math.max(0, panel.scrollArea!.lines.length - layout.rows)
    );
    f.setup.mockInput.pressKey('HOME');
    expect(panel.scrollArea!.scrollTop).toBe(0);
    await f.setup.renderOnce();
    body = f.setup
      .captureCharFrame()
      .split('\n')
      .slice(layout.itemsY, layout.itemsY + layout.rows)
      .join('\n');
    expect(body).toContain('Command');
    expect(body).not.toContain('›');
    expect(panel.selected).toBe(0);
    f.setup.mockInput.pressEscape();
    f.clock.advance(40);
    expect(f.surface.panel?.scrollArea).toBeUndefined();
    expect(f.surface.panel?.selected).toBe(1);
    expect(f.workspace.model.documents.getContentVersion()).toBe(version);
  } finally {
    await f.dispose();
  }
});

test('Agents occupies the right side of footer row one and shares space with feedback and dialog actions', async () => {
  const f = await inboxFixture();
  try {
    f.queue();
    for (const width of [90, 40, 32]) {
      await f.setup.resize(width, 24);
      await f.setup.renderOnce();
      let entry = f.surface.viewStatusControls.find((item) => item.id === 'agents')!;
      expect(entry.y).toBe(f.surface.footerBounds.y);
      expect(entry.x + entry.width).toBe(width - 1);
      const frame = f.setup.captureCharFrame().split('\n');
      expect(frame[entry.y]).toContain('Agents 1');
      expect(frame[entry.y + 1]).toContain('F1 for shortcuts');
      expect(frame[entry.y + 1]).not.toContain('Agents');
      for (const dock of f.surface.dockControls) expect(dock.x + dock.width).toBeLessThan(entry.x);
      f.surface.feedback.show('Unsaved', 'error', 'Save needs attention');
      await f.setup.renderOnce();
      entry = f.surface.viewStatusControls.find((item) => item.id === 'agents')!;
      const feedback = f.surface.feedbackControl!;
      expect(feedback.x + feedback.width).toBeLessThan(entry.x);
      expect(feedback.action).not.toBeNull();
      expect(f.setup.captureCharFrame().split('\n')[entry.y]).toContain('Agents 1');
      f.surface.feedback.clear();
    }
    await f.setup.resize(90, 24);
    await f.setup.renderOnce();
    await f.open();
    f.setup.mockInput.pressEnter();
    await f.setup.renderOnce();
    const entry = f.surface.viewStatusControls.find((item) => item.id === 'agents')!;
    for (const action of f.surface.panelFooterControls)
      expect(action.x + action.width).toBeLessThan(entry.x);
    expect(entry.x + entry.width).toBe(89);
  } finally {
    await f.dispose();
  }
});
