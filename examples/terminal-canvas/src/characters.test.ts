import { english } from './i18n.ts';
import { expect, test } from 'bun:test';
import type { KeyEvent } from '@opentui/core';
import { CharacterLibrary } from '@chardesk/character-library';
import {
  CharacterPicker,
  type CharacterPickerHost,
  createLocalCharacterLibrary,
} from './characters.ts';
import { TerminalCanvas } from './model.ts';
import type { CanvasSurface, TerminalPanel } from './surface.ts';
const data = {
  schemaVersion: 1,
  groups: [
    {
      id: 'letters',
      label: 'Letters',
      entries: [
        { id: 'U+0041', grapheme: 'A', name: 'old' },
        { id: 'U+0042', grapheme: 'B', name: 'latest' },
      ],
    },
  ],
};
function fixture(read: (path: string) => Promise<unknown>) {
  const model = new TerminalCanvas('safe');
  let enter = () => {},
    special: (key: KeyEvent) => boolean = () => false;
  const surface = {
    t: english,
    model,
    panel: null as TerminalPanel | null,
    requestRender: () => {},
  } as unknown as CanvasSurface;
  const host: CharacterPickerHost = {
    surface,
    show: (panel, pick, keys) => {
      surface.panel = panel;
      enter = pick;
      special = keys ?? (() => false);
    },
    dismiss: () => {
      surface.panel = null;
      picker.close();
    },
    target: () =>
      JSON.stringify([
        model.documents.getActiveAddress(),
        model.getSnapshot().interaction,
        model.currentTool,
        model.version,
      ]),
  };
  const library = new CharacterLibrary({ readJson: <T>(path: string) => read(path) as Promise<T> });
  const picker = new CharacterPicker(host, library);
  return {
    model,
    surface,
    picker,
    enter: () => enter(),
    key: (name: string) => special({ name } as KeyEvent),
    dispose: () => {
      picker.dispose();
      model.dispose();
    },
  };
}
async function until(check: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out');
    await Bun.sleep(2);
  }
}
const manifest = { schemaVersion: 1, packs: { essentials: 'pack' }, unicodeManifest: 'unicode' };
test('late character loads use the latest query and changed targets cannot receive an insertion', async () => {
  let resolve!: (value: unknown) => void;
  const gate = new Promise((res) => {
    resolve = res;
  });
  const f = fixture(async (path) => (path === 'manifest.json' ? manifest : gate));
  try {
    f.picker.open();
    const panel = f.surface.panel!;
    panel.input = 'old';
    panel.onInput?.('old');
    await Bun.sleep(140);
    panel.input = 'latest';
    panel.onInput?.('latest');
    await Bun.sleep(140);
    resolve(data);
    await until(() => !!f.surface.panel?.items.some((item) => item.includes('latest')));
    expect(f.surface.panel?.items.some((item) => item.includes('old'))).toBe(false);
    f.model.commands.pointAt({ x: 20, y: 20 });
    f.enter();
    expect(f.surface.panel).toBeNull();
    expect(f.model.plane.get({ x: 20, y: 20 })).toBeUndefined();
  } finally {
    f.dispose();
  }
});
test('failed character resources retry explicitly and closing prevents late UI completion', async () => {
  let attempts = 0;
  const f = fixture(async (path) => {
    if (path === 'manifest.json') return manifest;
    if (attempts++ === 0) throw new Error('offline');
    return data;
  });
  try {
    f.picker.open();
    await until(() => !!f.surface.panel?.error);
    expect(f.surface.panel?.error).toContain('F9');
    f.key('f9');
    await until(() => !!f.surface.panel?.items.some((item) => item.includes('U+0041')));
    expect(attempts).toBe(2);
    f.picker.open();
    f.picker.cancel();
    f.surface.panel = null;
    await Bun.sleep(20);
    expect(f.surface.panel).toBeNull();
    expect(f.model.canUndo).toBe(false);
  } finally {
    f.dispose();
  }
});
test('distributed local Unicode data retains non-insertable controls and rejects resource path escapes', async () => {
  const library = createLocalCharacterLibrary();
  const control = (await library.searchUnicode('U+0000')).records[0];
  expect(control?.insertable).toBe(false);
  expect(control?.grapheme).toBe('\u0000');
  await expect(library.port.readJson('../outside.json')).rejects.toThrow(
    'Invalid character resource path'
  );
});

test('non-insertable catalog entries cannot change text or brush settings', async () => {
  const f = fixture(async (path) =>
    path === 'manifest.json'
      ? manifest
      : {
          schemaVersion: 1,
          groups: [
            {
              id: 'controls',
              label: 'Controls',
              entries: [{ id: 'U+0000', grapheme: '\u0000', name: 'NULL', insertable: false }],
            },
          ],
        }
  );
  try {
    const before = f.model.plane.materialize();
    for (const mode of ['insert', 'brush'] as const) {
      f.picker.open(mode);
      await until(() => !!f.surface.panel?.items.some((item) => item.includes('U+0000')));
      f.enter();
      expect(f.surface.panel?.error).toContain('cannot be inserted');
      expect(f.model.plane.materialize()).toEqual(before);
      expect(f.model.drawingSettings.char).toBe('#');
      expect(f.model.canUndo).toBe(false);
    }
  } finally {
    f.dispose();
  }
});
