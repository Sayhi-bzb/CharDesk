import { expect, test } from 'bun:test';
import { Socket } from 'node:net';
import { createTextAttributes } from '@opentui/core';
import { createTestRenderer, KeyCodes, setRendererCapabilities } from '@opentui/core/testing';
import { attachControls } from './controller.ts';
import { CanvasFile } from './document.ts';
import { TerminalCanvas } from './model.ts';
import { CANVAS_TOP, CanvasSurface } from './surface.ts';
import { terminalRendererEnvironment } from './terminalPolicy.ts';

class TerminalOutput extends Socket {
  readonly isTTY = true;
  columns = 70;
  rows = 20;
  chunks: Buffer[] = [];
  override _write(
    bytes: Uint8Array,
    _encoding: BufferEncoding,
    complete: (error?: Error | null) => void
  ) {
    this.chunks.push(Buffer.from(bytes));
    complete();
  }
  getColorDepth() {
    return 24;
  }
  hasColors() {
    return true;
  }
  getWindowSize(): [number, number] {
    return [this.columns, this.rows];
  }
  clearLine() {
    return true;
  }
  clearScreenDown() {
    return true;
  }
  cursorTo() {
    return true;
  }
  moveCursor() {
    return true;
  }
}

for (const disabled of [false, true]) {
  test(`Warp startup emits the actual HTTP target only when native hyperlink output is enabled (disabled ${disabled})`, async () => {
    const output = new TerminalOutput();
    const environment = {
      TERM: 'xterm-256color',
      TERM_PROGRAM: 'WarpTerminal',
      ...(disabled ? { FORCE_HYPERLINK: '0' } : {}),
    };
    const setup = await createTestRenderer({
      width: 70,
      height: 20,
      stdout: output,
      bufferedOutput: 'stdout',
      remote: false,
      environment: { ...environment, ...terminalRendererEnvironment(environment) },
      screenMode: 'alternate-screen',
    });
    const href = 'http://localhost:5195/unicode-airport';
    const model = new TerminalCanvas(link('Airport', href));
    try {
      const surface = new CanvasSurface(setup.renderer, model, 'native-link-output', 'darwin');
      setup.renderer.root.add(surface);
      model.viewport = { ...model.viewport, x: 0, y: 0 };
      await setup.renderer.setupTerminal();
      await setup.renderOnce();
      await setup.renderer.nativeScene.driver.idle();
      const wire = Buffer.concat(output.chunks).toString('utf8');
      expect(wire.includes(href)).toBe(!disabled);
      expect(setup.captureCharFrame()).toContain('Airport');
      if (!disabled) expect(wire).toContain('\x1b]8;');
    } finally {
      await setup.dispose();
      model.dispose();
      output.destroy();
    }
  });
}

const url = 'https://example.com/docs?lang=zh#canvas';
const link = (text: string, href = url) => `\x1b]8;;${href}\x1b\\${text}\x1b]8;;\x1b\\`;
async function fixture(source = `A ${link('界🦀')}B`, hyperlinks = true) {
  const setup = await createTestRenderer({ width: 70, height: 20, kittyKeyboard: true });
  setRendererCapabilities(setup.renderer, { hyperlinks });
  const model = new TerminalCanvas(source);
  const surface = new CanvasSurface(setup.renderer, model, 'links', 'darwin');
  setup.renderer.root.add(surface);
  const detach = attachControls(surface, new CanvasFile('/unused', 'links', null), () => {});
  surface.setTool('edit');
  model.viewport = { ...model.viewport, x: 0, y: 0 };
  await setup.renderOnce();
  return {
    setup,
    model,
    surface,
    at: (x: number, y = 0) => setup.renderer.getLinkAt(x, CANVAS_TOP + y),
    async dispose() {
      detach();
      await setup.dispose();
      model.dispose();
    },
  };
}

test('native hyperlinks cover CJK/emoji followers, preserve selection appearance and keep plain clicks editable', async () => {
  const f = await fixture();
  try {
    for (const x of [2, 3, 4, 5]) expect(f.at(x)).toBe(url);
    expect(f.at(1)).toBeNull();
    expect(f.at(6)).toBeNull();
    const linkedSpan = f.setup
      .captureSpans()
      .lines[CANVAS_TOP]!.spans.find((span) => span.text.includes('🦀'))!;
    expect(linkedSpan.attributes & createTextAttributes({ underline: true })).not.toBe(0);
    const original = f.model.plane.materialize();
    await f.setup.mockMouse.click(2, CANVAS_TOP);
    expect(f.model.cursor).toEqual({ x: 2, y: 0 });
    await f.setup.mockMouse.click(5, CANVAS_TOP, 0, { modifiers: { alt: true } });
    await f.setup.renderOnce();
    expect(f.model.selection).not.toBeNull();
    for (const x of [2, 3, 4, 5]) expect(f.at(x)).toBe(url);
    const selectedSpan = f.setup
      .captureSpans()
      .lines[CANVAS_TOP]!.spans.find((span) => span.text.includes('🦀'))!;
    expect(selectedSpan.bg.intent).toBe('indexed');
    expect(selectedSpan.bg.slot).toBe(8);
    expect(selectedSpan.attributes & createTextAttributes({ inverse: true })).toBe(0);
    expect(f.model.plane.materialize()).toEqual(original);
    expect(f.model.canUndo).toBe(false);
  } finally {
    await f.dispose();
  }
});

test('local Web canvas URLs keep their complete target behind a linked label', async () => {
  const href = 'http://localhost:5195/unicode-airport';
  const f = await fixture(link('Airport', href));
  try {
    expect(f.setup.captureCharFrame()).toContain('Airport');
    for (const x of [0, 1, 2, 3, 4, 5, 6]) expect(f.at(x)).toBe(href);
    expect(f.at(7)).toBeNull();
  } finally {
    await f.dispose();
  }
});

test('links survive clipped wide anchors and resizing without leaking onto neighboring cells', async () => {
  const f = await fixture();
  try {
    f.model.viewport.x = 3;
    await f.setup.renderOnce();
    for (const x of [0, 1, 2]) expect(f.at(x)).toBe(url);
    expect(f.at(3)).toBeNull();
    f.setup.resize(8, 10);
    f.model.viewport.x = -3;
    await f.setup.renderOnce();
    // The crab's leading cell is visible at the right edge; only its clipped footprint is painted.
    expect(f.at(7)).toBe(url);
    expect(f.at(4)).toBeNull();
    f.model.viewport.x = 0;
    await f.setup.renderOnce();
    expect(f.at(4)).toBe(url);
    expect(f.at(6)).toBeNull();
  } finally {
    await f.dispose();
  }
});

test('deleting and undoing links replaces native metadata without stale or disposed URL resources', async () => {
  const f = await fixture(`${link('One')} ${link('Two', 'https://example.org')}`);
  try {
    expect(f.at(0)).toBe(url);
    expect(f.at(4)).toBe('https://example.org');
    f.model.commands.selectAll();
    f.setup.mockInput.pressKey(KeyCodes.DELETE);
    await f.setup.renderOnce();
    for (const x of [0, 1, 2, 3, 4, 5, 6]) expect(f.at(x)).toBeNull();
    f.model.commands.undo();
    await f.setup.renderOnce();
    expect(f.at(0)).toBe(url);
    expect(f.at(4)).toBe('https://example.org');
    f.surface.help = true;
    await f.setup.renderOnce();
    expect(f.at(0)).toBeNull();
    f.surface.help = false;
    await f.setup.renderOnce();
    expect(f.at(0)).toBe(url);
  } finally {
    await f.dispose();
  }
});

test('placement preview owns its hyperlinks above document links and restores the document on cancellation', async () => {
  const f = await fixture();
  const plain = new TerminalCanvas('MASK');
  const linked = new TerminalCanvas(link('GO', 'https://example.org'));
  try {
    f.surface.placement = {
      at: { x: 2, y: 0 },
      source: plain.plane,
      width: 4,
      height: 1,
      label: 'preview',
    };
    await f.setup.renderOnce();
    for (const x of [2, 3, 4, 5]) expect(f.at(x)).toBeNull();
    f.surface.placement.source = linked.plane;
    await f.setup.renderOnce();
    expect(f.at(2)).toBe('https://example.org');
    expect(f.at(3)).toBe('https://example.org');
    f.surface.placement = null;
    await f.setup.renderOnce();
    for (const x of [2, 3, 4, 5]) expect(f.at(x)).toBe(url);
  } finally {
    await f.dispose();
    plain.dispose();
    linked.dispose();
  }
});

test('terminals without OSC 8 retain readable labels; oversized URLs do not fail rendering', async () => {
  for (const href of [url, `https://example.com/${'x'.repeat(600)}`]) {
    const f = await fixture(link('Readable', href), false);
    try {
      expect(f.setup.captureCharFrame()).toContain('Readable');
      expect(f.model.plane.get({ x: 0, y: 0 })?.href).toBe(href);
    } finally {
      await f.dispose();
    }
  }
});
