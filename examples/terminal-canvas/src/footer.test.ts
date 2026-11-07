import { expect, test } from 'bun:test';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TerminalFeedback, noticeText } from '../../../packages/terminal/src/feedback.ts';
import { TerminalWorkspace } from './workspace.ts';
import { CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';

test('feedback has one lifecycle: delayed progress, expiring results, persistent issues and cancelled timers', () => {
  const clock = new ManualClock();
  const feedback = new TerminalFeedback(clock, () => {});
  feedback.issue('source', { text: 'Changed', kind: 'warning' });
  feedback.show('Clipboard…', 'progress');
  expect(noticeText(feedback.current!)).toBe('Changed');
  clock.advance(399);
  expect(noticeText(feedback.current!)).toBe('Changed');
  clock.advance(1);
  expect(noticeText(feedback.current!)).toBe('Clipboard…');
  feedback.show('Copied');
  clock.advance(2199);
  expect(noticeText(feedback.current!)).toBe('Copied');
  clock.advance(1);
  expect(noticeText(feedback.current!)).toBe('Changed');
  feedback.show('Copied');
  feedback.issue('save', { text: 'Unsaved', kind: 'error', detail: 'Disk full' });
  feedback.clear();
  clock.advance(60_000);
  expect(noticeText(feedback.current!)).toBe('Unsaved');
  feedback.issue('save');
  expect(noticeText(feedback.current!)).toBe('Changed');
  feedback.issue('source');
  feedback.show('Clipboard…', 'progress');
  clock.advance(100);
  feedback.show('Copied');
  clock.advance(300);
  expect(noticeText(feedback.current!)).toBe('Copied');
  feedback.dispose();
  clock.advance(60_000);
  expect(feedback.current).toBeUndefined();
});

test('a failed document stays visible across other saves and Source targets the file that needs recovery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-save-feedback-'));
  const workspace = await TerminalWorkspace.open(join(root, 'first.chardesk'), 'First');
  const setup = await createTestRenderer({
    width: 80,
    height: 24,
    kittyKeyboard: true,
    clock: new ManualClock(),
  });
  const surface = new CanvasSurface(setup.renderer, workspace.model, 'Save', 'darwin');
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {}, undefined, workspace);
  try {
    const first = workspace.active;
    await workspace.saveFile(first);
    const baseline = await readFile(first.path, 'utf8');
    await workspace.openFile(join(root, 'second.chardesk'));
    const second = workspace.active;
    workspace.switchTo(0);
    workspace.model.commands.insert('X');
    await writeFile(first.path, 'External edit');
    await expect(workspace.saveFile(first)).rejects.toThrow('changed on disk');
    workspace.switchTo(1);
    workspace.model.commands.insert('Other document');
    await workspace.saveFile(second);
    await setup.renderOnce();
    expect(surface.statusBar.status).toBe('Unsaved');
    const action = surface.feedbackControl!.action!;
    expect(action.label).toBe('Source');
    await setup.mockMouse.click(action.x, action.y);
    expect(workspace.active).toBe(first);
    expect(surface.panel?.title).toBe('Source');
    expect(surface.panel?.items).toContain('Retry saving local changes');
    await writeFile(first.path, baseline);
    await workspace.saveFile(first);
    expect(surface.statusBar.status).toBeUndefined();
  } finally {
    detach();
    await setup.dispose();
    workspace.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

for (const width of [40, 80]) {
  test(`one-row footer keeps the canvas stable, preserves unconfirmed Cut, and opens details (${width} columns)`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'chardesk-footer-'));
    const workspace = await TerminalWorkspace.open(join(root, 'canvas.chardesk'), 'A🦀界');
    const clock = new ManualClock();
    const setup = await createTestRenderer({ width, height: 26, kittyKeyboard: true, clock });
    const surface = new CanvasSurface(setup.renderer, workspace.model, 'Footer', 'darwin');
    setup.renderer.root.add(surface);
    const detach = attachControls(
      surface,
      () => {},
      {
        read: async () => ({}),
        write: async () => ({ status: 'dispatched' }),
      },
      workspace
    );
    try {
      surface.setTool('edit');
      workspace.model.commands.selectAll();
      await setup.renderOnce();
      const viewport = { ...workspace.model.viewport },
        selection = structuredClone(workspace.model.selection),
        content = workspace.model.plane.materialize();
      expect(surface.footerBounds).toMatchObject({ y: 25, height: 1 });
      expect(surface.canvasBounds.height).toBe(24);
      expect(surface.statusBar.status).toBeUndefined();
      setup.mockInput.pressKey('x', { super: true });
      await Bun.sleep(5);
      await setup.renderOnce();
      const footer = () => setup.captureCharFrame().split('\n')[surface.footerBounds.y];
      expect(footer()).toContain('[Edit] [Hand] [Style]');
      expect(footer()).toContain('Not cut');
      expect(footer()).toContain('Details');
      const details = surface.feedbackControl!.action!;
      await setup.mockMouse.click(details.x, details.y);
      expect(surface.panel?.title).toBe('Not cut');
      expect(surface.panel?.items.join('')).toContain('selection kept');
      setup.mockInput.pressEscape();
      clock.advance(40);
      surface.feedback.issue('save', {
        text: 'Unsaved',
        kind: 'error',
        detail: 'Permission denied',
      });
      setup.mockInput.pressTab();
      await setup.renderOnce();
      expect(footer()).toContain('Unsaved');
      surface.activateDock('settings');
      await setup.renderOnce();
      expect(footer()).toContain('Unsaved');
      expect(footer()).not.toContain('Permission denied');
      const errorDetails = surface.feedbackControl!.action!;
      await setup.mockMouse.click(errorDetails.x, errorDetails.y);
      expect(surface.panel?.title).toBe('Unsaved');
      expect(surface.panel?.items).toContain('Permission denied');
      setup.mockInput.pressEscape();
      clock.advance(40);
      surface.activateDock('settings');
      setup.mockInput.pressKey('F1', { shift: true });
      expect(surface.panel?.title).toBe('Unsaved');
      setup.mockInput.pressEscape();
      clock.advance(40);
      surface.feedback.issue('save');
      clock.advance(7000);
      await setup.renderOnce();
      expect(surface.statusBar.status).toBeUndefined();
      expect(workspace.model.viewport).toEqual(viewport);
      expect(workspace.model.selection).toEqual(selection);
      expect(workspace.model.plane.materialize()).toEqual(content);
      expect(workspace.model.canUndo).toBe(false);
    } finally {
      detach();
      await setup.dispose();
      workspace.dispose();
      await rm(root, { recursive: true, force: true });
    }
  });
}
