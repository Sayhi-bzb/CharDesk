import { expect, test } from 'bun:test';
import { createClipboard, type ClipboardService, type HostClipboardService } from '@opentui/core';
import { CellPlaneIndex } from '@chardesk/cell-plane';
import { adaptTerminalClipboard } from './clipboard.ts';
import { buildRichClipboardHtml } from '@chardesk/editor-core/clipboard/rich';

const imageTestService: ClipboardService = {
  read: async () => ({ status: 'empty' }),
  writeText: async () => {
    throw new Error('Image must not use text transport');
  },
  clear: async () => {
    throw new Error('Unexpected clear');
  },
  dispose: async () => {},
};

function fixture(remote = false, supported = true) {
  const calls: string[] = [];
  const text = '界👩🏽‍💻\r\n$() ` " quotation';
  const host: HostClipboardService = {
    maxWriteBytes: 1024,
    async read() {
      calls.push('read-host');
      return {
        status: 'read',
        representation: { mimeType: 'text/plain', bytes: new TextEncoder().encode(text) },
      };
    },
    async writeText(value) {
      expect(value).toBe(text);
      calls.push('write-host');
      return { status: supported ? 'written' : 'unsupported' };
    },
    async clear() {
      return { status: 'cleared' };
    },
    async dispose() {
      calls.push('dispose');
    },
  };
  const service = createClipboard({
    host,
    terminal: {
      remote,
      writeText(value) {
        expect(value).toBe(text);
        calls.push('write-terminal');
        return { status: 'attempted', capability: 'unknown' };
      },
      clear() {
        return { status: 'attempted', capability: 'unknown' };
      },
    },
  });
  const port = adaptTerminalClipboard(service, () => remote);
  return { port, calls, text };
}
const state = {
  target: 'clipboard-test',
  reader: new CellPlaneIndex(),
  selections: [],
  cursor: null,
  foreground: '#000000',
  selectResult: true,
};

test('native clipboard reads and confirmed writes preserve Unicode', async () => {
  const f = fixture();
  expect(await f.port.read(state)).toEqual({ plainText: f.text });
  expect(await f.port.write({ plain: f.text, rich: null }, { rich: false, ansi: false })).toEqual({
    status: 'written',
  });
  await f.port.dispose();
  expect(f.calls).toEqual(['read-host', 'write-host', 'dispose']);
});

test('unavailable native clipboard falls back to an unconfirmed terminal dispatch', async () => {
  const f = fixture(false, false);
  expect(await f.port.write({ plain: f.text, rich: null }, { rich: false, ansi: false })).toEqual({
    status: 'dispatched',
  });
  expect(f.calls).toEqual(['write-host', 'write-terminal']);
  await f.port.dispose();
});

test('remote clipboard writes target the client; reads never target the server', async () => {
  const f = fixture(true);
  expect(await f.port.read(state)).toEqual({ error: 'unsupported-data' });
  expect(await f.port.write({ plain: f.text, rich: null }, { rich: false, ansi: false })).toEqual({
    status: 'dispatched',
  });
  expect(f.calls).toEqual(['write-terminal']);
  await f.port.dispose();
});

test('native image writes use raw RGBA and never fall back to text OSC 52', async () => {
  for (const remote of [false, true]) {
    let loads = 0,
      writes = 0;
    const image = { width: 1, height: 1, rgba: Buffer.from([2, 4, 6, 255]) };
    const port = adaptTerminalClipboard(imageTestService, () => remote, {
      supported: () => true,
      load: async () => {
        loads++;
        return {
          setImage(width, height, rgba) {
            expect([width, height]).toEqual([1, 1]);
            expect(rgba).toBe(image.rgba);
            writes++;
          },
        };
      },
    });
    try {
      expect(port.canWriteImage!()).toBe(!remote);
      expect(await port.writeImage!(image)).toEqual({ status: remote ? 'unavailable' : 'written' });
      expect([loads, writes]).toEqual(remote ? [0, 0] : [1, 1]);
    } finally {
      await port.dispose();
    }
    expect(port.canWriteImage!()).toBe(false);
    expect(await port.writeImage!(image)).toEqual({ status: 'unavailable' });
  }
});

test('image backend failure, pending cancellation, and disposal cannot report a confirmed image write', async () => {
  for (const mode of ['failed', 'stale', 'disposed', 'unsupported'] as const) {
    const pending = Promise.withResolvers<{ setImage(): void }>();
    let current = true,
      writes = 0;
    const port = adaptTerminalClipboard(imageTestService, () => false, {
      supported: () => mode !== 'unsupported',
      load: () => pending.promise,
    });
    const result = port.writeImage!({ width: 1, height: 1, rgba: Buffer.alloc(4) }, () => current);
    if (mode === 'stale') current = false;
    if (mode === 'disposed') await port.dispose();
    pending.resolve({
      setImage() {
        if (mode === 'failed') throw new Error('no clipboard');
        writes++;
      },
    });
    expect(await result).toEqual({ status: mode === 'failed' ? 'failed' : 'unavailable' });
    expect(writes).toBe(0);
    await port.dispose();
  }
});

test('local rich clipboard writes text and HTML atomically and reads cells ahead of text preparation', async () => {
  const cells = [
    {
      x: 0,
      y: 0,
      char: '🦀',
      color: '#123456',
      attrs: { bold: true as const },
      href: 'https://example.com',
    },
  ];
  const payload = { plain: '🦀', rich: JSON.stringify({ cells }) };
  let html = '',
    writes = 0;
  const port = adaptTerminalClipboard(imageTestService, () => false, undefined, {
    supported: () => true,
    load: async () => ({
      getHtml: () => html,
      setContents(contents) {
        expect(contents.text).toBe('🦀');
        html = contents.html;
        writes++;
      },
    }),
  });
  try {
    expect(await port.write(payload, { rich: true, ansi: false })).toEqual({ status: 'written' });
    expect(writes).toBe(1);
    expect(await port.read(state)).toEqual({ richCells: cells, plainText: null });
  } finally {
    await port.dispose();
  }
});

test('unsupported rich backend explicitly falls back; remote and disposed adapters never load a native rich clipboard', async () => {
  const payload = {
    plain: 'plain',
    rich: JSON.stringify({ cells: [{ x: 0, y: 0, char: 'A', color: '#000000' }] }),
  };
  for (const mode of ['remote', 'failed', 'disposed'] as const) {
    let loads = 0,
      writes = 0;
    const host = {
      ...imageTestService,
      async writeText() {
        writes++;
        return {
          host: { status: 'written' as const },
          terminal: { status: 'not-attempted' as const, capability: 'unknown' as const },
        };
      },
    } satisfies ClipboardService;
    const pending = Promise.withResolvers<import('./clipboard.ts').RichClipboardBackend>();
    const port = adaptTerminalClipboard(host, () => mode === 'remote', undefined, {
      supported: () => true,
      load: async () => {
        loads++;
        if (mode === 'failed') throw new Error('no backend');
        return pending.promise;
      },
    });
    const write = port.write(payload, { rich: true, ansi: false });
    if (mode === 'disposed') await port.dispose();
    pending.resolve({
      getHtml: () => buildRichClipboardHtml(payload)!,
      setContents() {
        throw new Error('must not write');
      },
    });
    const result = await write;
    expect(result).toEqual(
      mode === 'disposed'
        ? { status: 'unavailable' }
        : { status: 'written', warning: 'plain-fallback' }
    );
    expect(loads).toBe(mode === 'remote' ? 0 : 1);
    expect(writes).toBe(mode === 'disposed' ? 0 : 1);
    await port.dispose();
  }
});

test('native rich transport passes Cut/Paste through shared commands, preserving complete glyph style and one undo', async () => {
  const { TerminalCanvas } = await import('./model.ts');
  const source = new TerminalCanvas('🦀界'),
    destination = new TerminalCanvas('');
  let html = '';
  const port = adaptTerminalClipboard(imageTestService, () => false, undefined, {
    supported: () => true,
    load: async () => ({
      getHtml: () => html,
      setContents(value) {
        html = value.html;
      },
    }),
  });
  try {
    source.configureClipboard(port);
    destination.configureClipboard(port);
    source.setTool('select');
    source.selection = { anchor: { x: 1, y: 0 }, focus: { x: 1, y: 0 } };
    source.commands.style({ kind: 'attributes', attributes: { bold: true, underline: true } });
    source.commands.style({ kind: 'background', color: '#123456' });
    source.documents.clearHistory();
    const cut = source.commands.cut();
    expect(cut.status).toBe('pending');
    if (cut.status !== 'pending') throw new Error('Expected async Cut');
    expect((await cut.completion).succeeded).toBe(true);
    expect(source.plane.get({ x: 0, y: 0 })).toBeUndefined();
    expect(source.plane.get({ x: 2, y: 0 })?.char).toBe('界');
    const paste = destination.commands.paste();
    if (paste.status !== 'pending') throw new Error('Expected async Paste');
    expect((await paste.completion).succeeded).toBe(true);
    expect(destination.plane.get({ x: 0, y: 0 })).toMatchObject({
      char: '🦀',
      attrs: { bold: true, underline: true },
      bgColor: '#123456',
    });
    expect(destination.plane.get({ x: 1, y: 0 })).toBeUndefined();
    destination.commands.undo();
    expect(destination.plane.materialize().size).toBe(0);
    expect(destination.canUndo).toBe(false);
    source.commands.undo();
    expect(source.plane.get({ x: 0, y: 0 })?.char).toBe('🦀');
  } finally {
    source.dispose();
    destination.dispose();
    await port.dispose();
  }
});
