import { expect, test, vi } from 'vitest';
import { createTestKeymapHost } from '@opentui/keymap/testing';
import { EditorKeymap } from '@chardesk/editor-core/editor/keymap';
import { createKeyInput } from '@chardesk/keyboard';
import { connectBindings, createInputKeymap } from './engine.js';
import { createInputSession } from './session.js';

test.each(['macos', 'windows'] as const)(
  'catalog commands, overrides and queries share the %s keymap',
  (platform) => {
    const mac = platform === 'macos';
    const host = createTestKeymapHost({
      metadata: { platform, primaryModifier: mac ? 'super' : 'ctrl' },
    });
    const keymap = createInputKeymap(host);
    const catalog = new EditorKeymap();
    catalog.register('editor', {
      id: 'copy',
      shortcuts: ['Mod+C'],
      target: { type: 'command', id: 'copy' },
    });
    const calls: string[] = [];
    const bridge = connectBindings(keymap, catalog, {
      context: () => undefined,
      execute: (entry) => {
        calls.push(entry.target.id);
      },
    });
    const input = createKeyInput({ key: 'c', modifiers: { meta: mac, ctrl: !mac } });
    expect(bridge.resolve(input)?.id).toBe('copy');
    host.press('c', { super: mac, ctrl: !mac });
    expect(calls).toEqual(['copy']);
    catalog.setUserBindings('copy', [['Mod+Y']]);
    expect(bridge.resolve(input)).toBeUndefined();
    host.press('c', { super: mac, ctrl: !mac });
    host.press('y', { super: mac, ctrl: !mac });
    expect(calls).toEqual(['copy', 'copy']);
    bridge.dispose();
    host.destroy();
  }
);

test('legacy explicit Command stays distinct from Option; sequences use the library', () => {
  const host = createTestKeymapHost({ metadata: { platform: 'macos', primaryModifier: 'super' } });
  const keymap = createInputKeymap(host);
  const catalog = new EditorKeymap();
  catalog.register('editor', {
    id: 'copy',
    shortcuts: ['Meta+C'],
    target: { type: 'command', id: 'copy' },
  });
  catalog.register('editor', {
    id: 'pan',
    shortcuts: ['Alt+Up'],
    target: { type: 'command', id: 'pan' },
  });
  catalog.register('editor', {
    id: 'quit',
    shortcuts: ['Ctrl+Q'],
    target: { type: 'command', id: 'quit' },
  });
  catalog.register('editor', {
    id: 'sequence',
    shortcuts: [['Mod+K', 'B']],
    target: { type: 'command', id: 'sequence' },
  });
  const calls: string[] = [];
  const bridge = connectBindings(keymap, catalog, {
    context: () => undefined,
    execute: (entry) => {
      calls.push(entry.id);
    },
  });
  host.press('c', { meta: true });
  expect(calls).toEqual([]);
  host.press('c', { super: true });
  host.press('up', { meta: true });
  expect(bridge.resolve(createKeyInput({ key: 'k', modifiers: { meta: true } }))).toBeUndefined();
  const prefix = host.createCommandEvent();
  prefix.name = 'k';
  prefix.super = true;
  expect(bridge.resolveEvent(prefix)?.id).toBe('sequence');
  host.press('k', { super: true });
  expect(keymap.hasPendingSequence()).toBe(true);
  host.press('b');
  expect(calls).toEqual(['copy', 'pan', 'sequence']);
  host.press('q', { super: true });
  expect(calls).toEqual(['copy', 'pan', 'sequence']);
  host.press('q', { ctrl: true });
  expect(calls.at(-1)).toBe('quit');
  bridge.dispose();
  host.destroy();
});

test('runtime conditions gate commands and higher priorities win without a second sorter', () => {
  const host = createTestKeymapHost();
  const keymap = createInputKeymap(host);
  const catalog = new EditorKeymap<{ editing: boolean }>();
  let editing = true;
  catalog.register('editor', {
    id: 'global',
    shortcuts: ['F2'],
    target: { type: 'command', id: 'global' },
  });
  catalog.register('editor', {
    id: 'edit',
    shortcuts: ['F2'],
    target: { type: 'command', id: 'edit' },
    weight: 10,
    when: (c) => c.editing,
  });
  const calls: string[] = [];
  const bridge = connectBindings(keymap, catalog, {
    context: () => ({ editing }),
    execute: (entry) => {
      calls.push(entry.id);
    },
  });
  host.press('f2');
  editing = false;
  host.press('f2');
  expect(calls).toEqual(['edit', 'global']);
  bridge.dispose();
  host.destroy();
});

test('detaching input releases keymap subscriptions while preserving the Host', () => {
  const host = createTestKeymapHost();
  const session = createInputSession(host);
  let calls = 0;
  session.keymap.registerLayer({
    bindings: [
      {
        key: 'x',
        cmd: () => {
          calls++;
        },
      },
    ],
  });
  host.press('x');
  expect(calls).toBe(1);
  session.dispose();
  session.dispose();
  host.press('x');
  expect(calls).toBe(1);
  expect(host.isDestroyed).toBe(false);
  host.destroy();
});

test('exact versus prefix ambiguity uses the configured library timeout', async () => {
  vi.useFakeTimers();
  const host = createTestKeymapHost();
  const keymap = createInputKeymap(host, { sequenceTimeoutMs: 25 });
  const calls: string[] = [];
  try {
    keymap.registerLayer({
      bindings: [
        {
          key: 'g',
          cmd: () => {
            calls.push('single');
          },
        },
        {
          key: 'gg',
          cmd: () => {
            calls.push('double');
          },
        },
      ],
    });
    host.press('g');
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(25);
    expect(calls).toEqual(['single']);
    host.press('g');
    host.press('g');
    await vi.advanceTimersByTimeAsync(25);
    expect(calls).toEqual(['single', 'double']);
  } finally {
    host.destroy();
    vi.useRealTimers();
  }
});
