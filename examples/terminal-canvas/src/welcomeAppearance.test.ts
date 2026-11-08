import { expect, test } from 'bun:test';
import { RGBA, type TerminalColors } from '@opentui/core';
import { createTestRenderer, ManualClock } from '@opentui/core/testing';
import { serializeCanvasDocument } from '@chardesk/editor-core/documentText';
import { isIncrementalCanvasSurfaceReader } from '@chardesk/cell-plane';
import { captureCanvasExport } from '@chardesk/editor-core/exportPlan';
import { createWelcomeDocument } from '../../../packages/local-runtime/src/welcome.ts';
import { WelcomeAppearance } from '@chardesk/canvas-templates/welcome-appearance';
import { TerminalAppearanceRuntime } from './appearance.ts';
import { TerminalSettingsStore } from './settings.ts';
import { TerminalCanvas } from './model.ts';
import { CANVAS_TOP, CanvasSurface } from './surface.ts';
import { TerminalMinimap, minimapPanel } from './minimap.ts';
import { captureExportSnapshot } from './snapshot.ts';
import { localCapabilities } from '../../../packages/local-runtime/src/capabilities.ts';
import { LocalSessions } from '../../../packages/local-runtime/src/sessions.ts';
import { TerminalWorkspace } from './workspace.ts';
import { resolveAppPaths } from './appPaths.ts';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { attachControls } from './controller.ts';

const palette = (foreground: string, background: string): TerminalColors => ({
  defaultForeground: foreground,
  defaultBackground: background,
  palette: Array(16).fill(foreground),
  cursorColor: null,
  mouseForeground: null,
  mouseBackground: null,
  tekForeground: null,
  tekBackground: null,
  highlightForeground: null,
  highlightBackground: null,
});
const themes = [
  palette('#111111', '#ffffff'),
  palette('#eeeeee', '#111111'),
  palette('#d7e4d7', '#182820'),
];
const colorAt = (reader: ReturnType<WelcomeAppearance['project']>, x: number, y: number) =>
  reader.get({ x, y })!.color;

test('Welcome neutrals follow terminal colors while backgrounds, hues, source and history remain authored', () => {
  const model = new TerminalCanvas('', { document: createWelcomeDocument() });
  const appearance = new TerminalAppearanceRuntime(new TerminalSettingsStore());
  const presenter = new WelcomeAppearance(appearance.getSnapshot);
  const source = model.plane;
  const before = serializeCanvasDocument(model.documents.getDocumentDraft()!);
  const version = model.versionAt(model.documents.getActiveAddress());
  try {
    const view = presenter.project(source);
    expect(view).not.toBe(source);
    const neutrals: string[] = [];
    for (const theme of themes) {
      appearance.acceptPalette(theme, null);
      expect(colorAt(view, 37, 2)).toBe('#000000');
      neutrals.push(colorAt(view, 37, 3));
      expect(colorAt(view, 37, 3)).not.toBe('#767676');
      expect(colorAt(view, 35, 1)).not.toBe('#94a3b8');
      expect(view.get({ x: 1, y: 0 })).toEqual(source.get({ x: 1, y: 0 }));
      expect(view.get({ x: 112, y: 8 })).toEqual(source.get({ x: 112, y: 8 }));
      expect(view.get({ x: 111, y: 6 })?.href).toBe('https://github.com/Sayhi-bzb/CharDesk');
    }
    expect(new Set(neutrals).size).toBe(3);
    expect(serializeCanvasDocument(model.documents.getDocumentDraft()!)).toBe(before);
    expect(model.versionAt(model.documents.getActiveAddress())).toBe(version);
    expect(model.dirty).toBe(false);
    expect(model.canUndo).toBe(false);
  } finally {
    appearance.dispose();
    model.dispose();
  }
});

test('ordinary canvases keep literal grays; missing RGB still gives Welcome native foreground', () => {
  const appearance = new TerminalAppearanceRuntime(new TerminalSettingsStore());
  const presenter = new WelcomeAppearance(appearance.getSnapshot);
  const other = new TerminalCanvas('\x1b[38;2;15;23;42mText');
  const welcome = new TerminalCanvas('', { document: createWelcomeDocument() });
  try {
    expect(presenter.project(other.plane)).toBe(other.plane);
    const projected = presenter.project(welcome.plane);
    expect(colorAt(projected, 37, 3)).toBe('#000000');
    expect(projected.get({ x: 112, y: 8 })).toEqual(welcome.plane.get({ x: 112, y: 8 }));
  } finally {
    appearance.dispose();
    other.dispose();
    welcome.dispose();
  }
});

test('native Welcome foreground and minimap update on palette changes, including same-mode palettes', async () => {
  const setup = await createTestRenderer({ width: 110, height: 26, clock: new ManualClock() });
  const model = new TerminalCanvas('', { document: createWelcomeDocument() });
  const surface = new CanvasSurface(setup.renderer, model, 'Welcome');
  setup.renderer.root.add(surface);
  model.viewport = { ...model.viewport, x: 0, y: 0 };
  const minimap = new TerminalMinimap();
  try {
    const view = surface.contentReader;
    if (!isIncrementalCanvasSurfaceReader(view))
      throw new Error('Welcome must retain incremental changes');
    let previous: number | undefined;
    for (const theme of themes) {
      surface.appearance.acceptPalette(theme, 'dark');
      await setup.renderOnce();
      const revision = view.getRevision();
      if (previous !== undefined) expect(view.getChangesSince(previous).full).toBe(true);
      previous = revision;
      setup.renderer.currentRenderBuffer.withBuffers((cells) => {
        const at = (CANVAS_TOP + 2) * cells.width + 37;
        expect(RGBA.fromArray(cells.fg.slice(at * 4, at * 4 + 4)).intent).toBe('default');
        const caption = (CANVAS_TOP + 3) * cells.width + 37;
        const rendered = RGBA.fromArray(cells.fg.slice(caption * 4, caption * 4 + 4));
        expect(rendered.toInts().slice(0, 3)).toEqual(
          RGBA.fromHex(colorAt(view, 37, 3))
            .toInts()
            .slice(0, 3)
        );
      });
      const frame = minimap.frame(view, revision, model.viewport, minimapPanel(110, 26)!);
      expect(frame.hasContent).toBe(true);
    }
    const revision = view.getRevision();
    model.apply({ rows: [{ y: 2, erase: [], spans: [{ x: 40, text: 'X', color: '#0f172a' }] }] });
    expect(view.getChangesSince(revision).full).toBe(false);
    expect(surface.contentReader).toBe(view);
  } finally {
    await setup.dispose();
    model.dispose();
  }
});

test('PNG captures use the projected Welcome while native/text snapshots keep original colors', () => {
  const model = new TerminalCanvas('', { document: createWelcomeDocument() });
  const appearance = new TerminalAppearanceRuntime(new TerminalSettingsStore());
  const presenter = new WelcomeAppearance(appearance.getSnapshot);
  try {
    const snapshot = captureCanvasExport(model.plane, [
      { start: { x: 37, y: 2 }, end: { x: 50, y: 3 } },
    ]);
    const projectCell = presenter.cellProjector(model.plane);
    appearance.acceptPalette(themes[1]!, 'dark');
    const image = captureExportSnapshot(snapshot, projectCell);
    expect(
      image.entries.some(
        (entry) => entry.cell.color === colorAt(presenter.project(model.plane), 37, 3)
      )
    ).toBe(true);
    expect(snapshot.cells.get('37,2')?.color).toBe('#0f172a');
  } finally {
    appearance.dispose();
    model.dispose();
  }
});

test('live local reads consume the TUI projection without modifying native file colors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'chardesk-welcome-read-'));
  const sessions = await LocalSessions.open(
    resolveAppPaths({ environment: { CHARDESK_HOME: join(root, 'home') } })
  );
  const path = join(root, 'welcome.chardesk');
  const workspace = await TerminalWorkspace.open(path, '', { document: createWelcomeDocument() });
  const appearance = new TerminalAppearanceRuntime(new TerminalSettingsStore());
  const presenter = new WelcomeAppearance(appearance.getSnapshot);
  try {
    await sessions.attach(workspace);
    const before = await readFile(path, 'utf8');
    appearance.acceptPalette(themes[1]!, 'dark');
    const capabilities = localCapabilities(
      workspace,
      sessions,
      false,
      () => ({ theme: 'dark', palette: { color: '#eeeeee', background: '#111111' } }),
      presenter.project
    );
    const reply = (await capabilities.execute('canvas_read', {
      viewport: [37, 2, 15, 2],
      representation: 'cells',
    })) as {
      cells: Array<{ x: number; y: number; color: string }>;
    };
    expect(reply.cells.find((cell) => cell.x === 37 && cell.y === 2)?.color).toBe('#000000');
    expect(reply.cells.find((cell) => cell.x === 37 && cell.y === 3)?.color).toBe('#a1a1a1');
    const headless = localCapabilities(workspace, sessions, false,
      () => ({ theme: 'dark', palette: { color: '#eeeeee', background: '#111111' } }));
    const sharedReply = await headless.execute('canvas_read', {
      viewport: [37, 2, 15, 2], representation: 'cells',
    }) as { cells: typeof reply.cells };
    expect(sharedReply.cells).toEqual(reply.cells);
    expect(await readFile(path, 'utf8')).toBe(before);
    expect(workspace.dirty).toBe(false);
  } finally {
    appearance.dispose();
    await sessions.dispose();
    workspace.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('Welcome range movement keeps the shared preview and does not recolor the source', async () => {
  const setup = await createTestRenderer({ width: 130, height: 26, clock: new ManualClock() });
  const model = new TerminalCanvas('', { document: createWelcomeDocument() });
  const surface = new CanvasSurface(setup.renderer, model, 'Welcome');
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, () => {});
  try {
    surface.appearance.acceptPalette(themes[1]!, 'dark');
    surface.setTool('edit');
    model.viewport = { ...model.viewport, x: 0, y: 0 };
    model.selection = { anchor: { x: 37, y: 2 }, focus: { x: 54, y: 2 } };
    await setup.renderOnce();
    const original = model.plane.materialize();
    await setup.mockMouse.pressDown(40, CANVAS_TOP + 2);
    await setup.mockMouse.emitMouseEvent('drag', 45, CANVAS_TOP + 4);
    await setup.renderOnce();
    expect(model.gestureState.type).toBe('movingRange');
    expect(model.frame().source.get({ x: 42, y: 4 })?.char).toBe(original.get('37,2')?.char);
    setup.renderer.currentRenderBuffer.withBuffers((cells) => {
      const at = (CANVAS_TOP + 4) * cells.width + 42;
      expect(RGBA.fromArray(cells.fg.slice(at * 4, at * 4 + 4)).intent).toBe('default');
    });
    expect(model.plane.materialize()).toEqual(original);
  } finally {
    detach();
    await setup.dispose();
    model.dispose();
  }
});
