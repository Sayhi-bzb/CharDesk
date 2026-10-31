import { expect, test } from 'vitest';
import { createSelectionCommandFactory } from '@/domains/actions/public';
import type { CompactTextRenderResult } from '@/domains/document/public';
import { createCanvasRuntime } from '../runtime';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const transfer = (text: string) =>
  ({ getData: (type: string) => (type === 'text/plain' ? text : '') }) as DataTransfer;
const rendered = (text: string): CompactTextRenderResult => ({
  kind: 'spans',
  renderer: 'raw',
  pipeline: [],
  rows: [{ y: 0, spans: [{ x: 0, text, color: '#000000', width: text.length }] }],
  width: text.length,
  height: 1,
  diagnostics: [],
});

for (const resolveOlderFirst of [false, true]) {
  test(`Web event adapters share clipboard request ordering (older resolves first: ${resolveOlderFirst})`, async () => {
    const old = deferred<CompactTextRenderResult>(),
      newer = deferred<CompactTextRenderResult>();
    const runtime = createCanvasRuntime({
      persistence: false,
      selectionCommands: createSelectionCommandFactory({
        renderClipboardText: (text) => (text === 'old' ? old.promise : newer.promise),
      }),
      parseSessionSource: async () => ({ mode: 'freeform', grid: [] }),
      initialSessions: [{ id: 'clipboard-probe', name: 'Test', mode: 'freeform', grid: [] }],
    });
    try {
      const first = runtime.commands.selection.paste({ eventDataTransfer: transfer('old') });
      const second = runtime.commands.selection.paste({ eventDataTransfer: transfer('N') });
      if (resolveOlderFirst) {
        old.resolve(rendered('old'));
        expect(await first).toMatchObject({ status: 'failed', reason: 'stale-target' });
      }
      newer.resolve(rendered('N'));
      expect(await second).toMatchObject({ status: 'applied' });
      if (!resolveOlderFirst) {
        old.resolve(rendered('old'));
        expect(await first).toMatchObject({ status: 'failed', reason: 'stale-target' });
      }
      expect(runtime.getState().contentSurface.reader.materialize().size).toBe(1);
      expect(runtime.getState().contentSurface.reader.get({ x: 0, y: 0 })?.char).toBe('N');
    } finally {
      runtime.dispose();
    }
  });
}

test('disposing Web runtime during text rendering cancels pending paste', async () => {
  const pending = deferred<CompactTextRenderResult>();
  const runtime = createCanvasRuntime({
    persistence: false,
    selectionCommands: createSelectionCommandFactory({
      renderClipboardText: () => pending.promise,
    }),
    parseSessionSource: async () => ({ mode: 'freeform', grid: [] }),
    initialSessions: [{ id: 'clipboard-lifetime-probe', name: 'Test', mode: 'freeform', grid: [] }],
  });
  const pasting = runtime.commands.selection.paste({ eventDataTransfer: transfer('pending') });
  runtime.dispose();
  pending.resolve(rendered('late'));
  expect(await pasting).toMatchObject({ status: 'failed', reason: 'stale-target' });
});
