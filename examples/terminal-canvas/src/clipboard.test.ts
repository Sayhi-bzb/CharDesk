import { expect, test } from 'bun:test';
import { createClipboard, type ClipboardService, type HostClipboardService } from '@opentui/core';
import { CellPlaneIndex } from '@chardesk/cell-plane';
import { adaptTerminalClipboard } from './clipboard.ts';

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
