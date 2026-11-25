import { expect, test } from 'bun:test';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TerminalCanvas } from './model.ts';
import { TerminalWorkspace } from './workspace.ts';
import { CanvasSurface } from './surface.ts';
import { attachControls } from './controller.ts';
import { resolveTerminalPolicy } from './terminalPolicy.ts';
import type { PreparedClipboardPaste } from '@chardesk/editor-core/clipboard/commands';

test('repeated full controller attachment releases listeners, commands and overlays', async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, clock: new ManualClock() });
  const model = new TerminalCanvas('界🦀');
  const surface = new CanvasSurface(setup.renderer, model, 'lifetime', 'win32', true, resolveTerminalPolicy({}));
  setup.renderer.root.add(surface);
  const counts = () => [
    ...['keypress', 'keyrelease', 'paste'].map((event) => setup.renderer.keyInput.listenerCount(event)),
    ...['focus', 'blur', 'resize', 'capabilities'].map((event) => setup.renderer.listenerCount(event)),
  ];
  const baseline = counts();
  const content = model.plane.materialize();
  let quits = 0;
  try {
    await setup.renderOnce();
    for (let cycle = 0; cycle < 25; cycle++) {
      const detach = attachControls(surface, () => { quits++; });
      try {
        surface.activateDock('settings');
        await setup.renderOnce();
        setup.mockInput.pressKey('q', { ctrl: true });
        expect(quits).toBe(cycle + 1);
      } finally {
        detach();
      }
      expect(counts(), `attachment ${cycle}`).toEqual(baseline);
      expect(surface.inspector).toBeNull();
      expect(surface.contextMenu).toBeNull();
      expect(surface.panel).toBeNull();
      setup.mockInput.pressKey('q', { ctrl: true });
      expect(quits).toBe(cycle + 1);
      expect(model.plane.materialize()).toEqual(content);
      expect(model.canUndo).toBe(false);
    }
  } finally {
    await setup.dispose();
    model.dispose();
  }
});

for (const interruption of ['switch', 'settings', 'menu', 'detach'] as const) {
  test(`host ${interruption} invalidates asynchronous preparation without changing either canvas`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'chardesk-host-lifetime-'));
    let resolve!: (value: PreparedClipboardPaste) => void;
    const gate = new Promise<PreparedClipboardPaste>((done) => { resolve = done; });
    const workspace = await TerminalWorkspace.open(join(root, 'one.chardesk'), 'FIRST', {
      prepareText: () => gate,
    });
    const setup = await createTestRenderer({ width: 80, height: 24, clock: new ManualClock() });
    const surface = new CanvasSurface(setup.renderer, workspace.model, 'async', 'win32', true, resolveTerminalPolicy({}));
    setup.renderer.root.add(surface);
    let detach = attachControls(surface, () => {}, undefined, workspace);
    const model = workspace.model;
    try {
      await workspace.openFile(join(root, 'two.chardesk'));
      model.commands.insert('SECOND');
      const second = model.plane.materialize();
      workspace.switchTo(0);
      surface.setTool('edit');
      const first = model.plane.materialize();
      const versions = workspace.files.map((file) => model.documents.getContentVersion(file.address!.documentId));
      await setup.renderOnce();
      const pending = model.commands.pasteProvided('slow');
      if (pending.status !== 'pending') throw new Error(`Expected pending, got ${pending.status}`);
      if (interruption === 'switch') {
        model.editor.commands.execute('terminal.next-document', undefined, 'test');
        expect(workspace.active).toBe(workspace.files[1]!);
      } else if (interruption === 'settings') {
        surface.activateDock('settings');
        expect(surface.panel).not.toBeNull();
      } else if (interruption === 'menu') {
        setup.mockInput.pressKey('F10', { shift: true });
        expect(surface.contextMenu?.isOpen).toBe(true);
      }
      else {
        detach();
        detach = () => {};
      }
      resolve({ plainText: 'MUST_NOT_APPLY' });
      expect(await pending.completion).toMatchObject({ succeeded: false, reason: 'stale-target' });
      expect(workspace.files.map((file) => model.documents.getContentVersion(file.address!.documentId))).toEqual(versions);
      workspace.switchTo(0);
      expect(model.plane.materialize()).toEqual(first);
      workspace.switchTo(1);
      expect(model.plane.materialize()).toEqual(second);
      await setup.renderOnce();
      expect(setup.captureCharFrame()).not.toContain('MUST_NOT_APPLY');
    } finally {
      detach();
      await setup.dispose();
      workspace.dispose();
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('sparse distant content keeps frame size bounded; records a repeatable render baseline', async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, clock: new ManualClock() });
  const model = new TerminalCanvas('A界🦀');
  const surface = new CanvasSurface(setup.renderer, model, 'baseline', 'win32', true, resolveTerminalPolicy({}));
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {});
  try {
    model.apply({ rows: Array.from({ length: 1000 }, (_, i) => ({
      y: i * 1000, erase: [], spans: [{ x: i * 1000, text: '遠', color: '#abcdef' }],
    })) });
    model.documents.clearHistory();
    const content = model.plane.materialize();
    const version = model.documents.getContentVersion();
    const samples: number[] = [];
    await setup.renderOnce();
    for (let i = 0; i < 30; i++) {
      model.pan(i % 2 ? 10 : -10, i % 2 ? -10 : 10);
      const start = performance.now();
      await setup.renderOnce();
      samples.push(performance.now() - start);
      const frame = model.frame();
      expect(frame.viewport.width * frame.viewport.height).toBeLessThanOrEqual(80 * 24);
      let visited = 0;
      frame.source.visit(frame.viewport, () => { visited++; });
      expect(visited).toBeLessThanOrEqual(80 * 24);
      setup.renderer.currentRenderBuffer.withBuffers((cells) => {
        expect(cells.width).toBe(80);
        expect(cells.height).toBe(24);
      });
    }
    expect(model.plane.materialize()).toEqual(content);
    expect(model.documents.getContentVersion()).toBe(version);
    expect(model.canUndo).toBe(false);
    samples.sort((a, b) => a - b);
    console.info(JSON.stringify({ benchmark: 'tui-sparse-pan', runtime: Bun.version,
      platform: process.platform, arch: process.arch, viewport: [80, 24], distantAnchors: 1000,
      frames: samples.length, p50Ms: samples[15], p95Ms: samples[28], rssBytes: process.memoryUsage().rss }));
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
  }
});
