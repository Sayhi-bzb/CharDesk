import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_TERMINAL_SETTINGS,
  TerminalSettingsStore,
  terminalSettingsPath,
} from './settings.ts';

test('settings persist the latest values atomically and preserve future fields', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-settings-'));
  const path = join(directory, 'preferences.json');
  try {
    await writeFile(path, JSON.stringify({ version: 1, values: { panStep: 20, future: 'keep' } }));
    const store = await TerminalSettingsStore.load(path);
    expect(store.values.panStep).toBe(20);
    store.set('panStep', 50);
    store.set('cursorStyle', 'line');
    store.set('panStep', 10);
    await store.flush();
    expect(store.status).toBe('saved');
    expect(JSON.parse(await readFile(path, 'utf8')).values).toMatchObject({
      panStep: 10,
      cursorStyle: 'line',
      future: 'keep',
    });
    const reopened = await TerminalSettingsStore.load(path);
    expect(reopened.values).toEqual(store.values);
    reopened.reset('appearance');
    expect(reopened.values.cursorStyle).toBe('block');
    await reopened.flush();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('CLI overrides remain session-only when an unrelated setting is saved', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-settings-'));
  const path = join(directory, 'new', 'preferences.json');
  try {
    const store = await TerminalSettingsStore.load(path, { pasteMode: 'plain' });
    expect(store.values.pasteMode).toBe('plain');
    store.set('panStep', 20);
    await store.flush();
    expect((await TerminalSettingsStore.load(path)).values.pasteMode).toBe('auto');
    store.set('pasteMode', 'markdown');
    await store.flush();
    expect((await TerminalSettingsStore.load(path)).values.pasteMode).toBe('markdown');
    store.reset('navigation');
    expect(store.values.panStep).toBe(10);
    expect(store.values.pasteMode).toBe('markdown');
    await store.flush();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('invalid files and unknown versions remain untouched while session changes still work', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-settings-'));
  const path = join(directory, 'preferences.json');
  try {
    for (const source of [
      '{broken',
      '{"version":2,"values":{}}',
      '{"version":1,"values":{"panStep":1}}',
    ]) {
      await writeFile(path, source);
      const store = await TerminalSettingsStore.load(path);
      expect(store.status).toBe('error');
      expect(store.values).toEqual(DEFAULT_TERMINAL_SETTINGS);
      store.set('panStep', 20);
      await store.flush();
      expect(store.values.panStep).toBe(20);
      expect(await readFile(path, 'utf8')).toBe(source);
      expect(store.error).toContain('preserved');
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failed writes report an error and a subsequent change can retry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-settings-'));
  const blocker = join(directory, 'parent');
  const path = join(blocker, 'preferences.json');
  try {
    const store = await TerminalSettingsStore.load(path);
    await writeFile(blocker, 'blocks mkdir');
    store.set('panStep', 20);
    await store.flush();
    expect(store.status).toBe('error');
    expect(store.error).not.toBe('');
    await rm(blocker);
    store.set('panStep', 50);
    await store.flush();
    expect(store.status).toBe('saved');
    expect(store.error).toBe('');
    expect((await TerminalSettingsStore.load(path)).values.panStep).toBe(50);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('settings use an absolute XDG directory and validate in-memory values', () => {
  expect(terminalSettingsPath({ XDG_CONFIG_HOME: '/tmp/chardesk-config' })).toBe(
    '/tmp/chardesk-config/chardesk/terminal.json'
  );
  expect(terminalSettingsPath({ XDG_CONFIG_HOME: 'relative' })).not.toContain('relative');
  const store = new TerminalSettingsStore();
  expect(store.status).toBe('session');
  // Runtime validation also protects callers outside TypeScript.
  expect(() => store.set('panStep', 1 as 10)).toThrow('Invalid setting');
  expect(store.values.panStep).toBe(10);
});
