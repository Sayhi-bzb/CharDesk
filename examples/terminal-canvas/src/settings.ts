import { mkdir, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { atomicWrite } from './storage.ts';
import type { PasteMode } from './text.ts';

export type TerminalSettings = {
  cursorStyle: 'block' | 'line';
  cursorBlink: boolean;
  selectionColor: 8 | 4 | 6;
  panStep: 10 | 20 | 50;
  pasteMode: PasteMode;
};
export const DEFAULT_TERMINAL_SETTINGS: Readonly<TerminalSettings> = {
  cursorStyle: 'block',
  cursorBlink: true,
  selectionColor: 8,
  panStep: 10,
  pasteMode: 'auto',
};
export type SettingsSection = 'appearance' | 'navigation' | 'paste';
type SettingKey = keyof TerminalSettings;
type SettingDefinition = {
  [K in SettingKey]: {
    id: K;
    section: SettingsSection;
    label: string;
    choices: readonly { value: TerminalSettings[K]; label: string }[];
  };
}[SettingKey];
export const TERMINAL_SETTING_DEFINITIONS: readonly SettingDefinition[] = [
  {
    id: 'cursorStyle',
    section: 'appearance',
    label: 'Cursor',
    choices: [
      { value: 'block', label: 'Block' },
      { value: 'line', label: 'Bar' },
    ],
  },
  {
    id: 'cursorBlink',
    section: 'appearance',
    label: 'Blink cursor',
    choices: [
      { value: true, label: 'On' },
      { value: false, label: 'Off' },
    ],
  },
  {
    id: 'selectionColor',
    section: 'appearance',
    label: 'Selection background',
    choices: [
      { value: 8, label: 'Theme gray' },
      { value: 4, label: 'Theme blue' },
      { value: 6, label: 'Theme cyan' },
    ],
  },
  {
    id: 'panStep',
    section: 'navigation',
    label: 'Pan step',
    choices: [
      { value: 10, label: '10 cells' },
      { value: 20, label: '20 cells' },
      { value: 50, label: '50 cells' },
    ],
  },
  {
    id: 'pasteMode',
    section: 'paste',
    label: 'Paste format',
    choices: [
      { value: 'auto', label: 'Auto detect' },
      { value: 'plain', label: 'Plain text' },
      { value: 'ansi', label: 'ANSI' },
      { value: 'markdown', label: 'Markdown' },
    ],
  },
];
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function readSettings(raw: unknown): TerminalSettings {
  if (!object(raw)) throw new Error('Invalid settings values');
  const result = { ...DEFAULT_TERMINAL_SETTINGS };
  for (const definition of TERMINAL_SETTING_DEFINITIONS) {
    if (!(definition.id in raw)) continue;
    const value = raw[definition.id];
    if (!definition.choices.some((choice) => choice.value === value))
      throw new Error(`Invalid setting: ${definition.id}`);
    Object.assign(result, { [definition.id]: value });
  }
  return result;
}
export function terminalSettingsPath(environment: NodeJS.ProcessEnv = process.env) {
  const directory =
    environment.XDG_CONFIG_HOME ?? (process.platform === 'win32' ? environment.APPDATA : undefined);
  return join(
    directory && isAbsolute(directory) ? directory : join(homedir(), '.config'),
    'chardesk',
    'terminal.json'
  );
}

// Resolve existing ancestors too, since the preferences directory may not exist yet.
async function settingsPath(input: string) {
  let path = resolve(input);
  const suffix: string[] = [];
  for (;;) {
    try {
      return join(await realpath(path), ...suffix);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      suffix.unshift(basename(path));
      path = dirname(path);
    }
  }
}

/** Host preferences are independent of documents and undo history. */
export class TerminalSettingsStore {
  #values: TerminalSettings;
  #persisted: TerminalSettings;
  #extra: Record<string, unknown> = {};
  #listeners = new Set<() => void>();
  #writes: Promise<void> = Promise.resolve();
  #revision = 0;
  #readError = false;
  path?: string;
  error = '';
  status: 'session' | 'saving' | 'saved' | 'error' = 'session';
  constructor(values: Partial<TerminalSettings> = {}) {
    this.#values = readSettings(values);
    this.#persisted = { ...this.#values };
  }
  static async load(path: string, overrides: Partial<TerminalSettings> = {}) {
    const store = new TerminalSettingsStore();
    store.path = resolve(path);
    store.status = 'saved';
    try {
      store.path = await settingsPath(path);
      const raw: unknown = JSON.parse(await readFile(store.path, 'utf8'));
      if (!object(raw) || raw.version !== 1 || !object(raw.values))
        throw new Error('Invalid settings file');
      store.#persisted = readSettings(raw.values);
      store.#extra = raw.values;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        store.#readError = true;
        store.status = 'error';
        store.error = `Settings file preserved: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    store.#values = readSettings({ ...store.#persisted, ...overrides });
    return store;
  }
  get values(): Readonly<TerminalSettings> {
    return this.#values;
  }
  subscribe(listener: () => void) {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
  #notify() {
    for (const listener of this.#listeners) listener();
  }
  set<K extends SettingKey>(key: K, value: TerminalSettings[K]) {
    const next = readSettings({ ...this.#values, [key]: value });
    if (next[key] === this.#values[key]) return;
    this.#values = next;
    Object.assign(this.#persisted, { [key]: value });
    this.#notify();
    this.#save();
  }
  reset(section: SettingsSection) {
    const patch = Object.fromEntries(
      TERMINAL_SETTING_DEFINITIONS.filter((def) => def.section === section).map((def) => [
        def.id,
        DEFAULT_TERMINAL_SETTINGS[def.id],
      ])
    );
    this.#values = readSettings({ ...this.#values, ...patch });
    Object.assign(this.#persisted, patch);
    this.#notify();
    this.#save();
  }
  #save() {
    if (!this.path || this.#readError) return;
    const path = this.path,
      revision = ++this.#revision;
    const source =
      JSON.stringify({ version: 1, values: { ...this.#extra, ...this.#persisted } }, null, 2) +
      '\n';
    this.status = 'saving';
    this.error = '';
    this.#notify();
    this.#writes = this.#writes.then(async () => {
      try {
        await mkdir(dirname(path), { recursive: true });
        await atomicWrite(path, source);
        if (revision === this.#revision) this.status = 'saved';
      } catch (error) {
        if (revision === this.#revision) {
          this.status = 'error';
          this.error = error instanceof Error ? error.message : String(error);
        }
      }
      this.#notify();
    });
  }
  flush() {
    return this.#writes;
  }
}
