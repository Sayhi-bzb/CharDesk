import type { EditorKeymap } from './core/keymap';
import { normalizeShortcut, type ShortcutSequence } from './core/shortcut';

export const EDITOR_KEYMAP_STORAGE_KEY = 'chardesk-editor-keymap-v3';
export const PREVIOUS_EDITOR_KEYMAP_STORAGE_KEY = 'chardesk-editor-keymap-v2';
export const LEGACY_EDITOR_KEYMAP_STORAGE_KEY = 'chardesk-editor-keymap-v1';

type PersistedV3 = { version: 3; bindings: Record<string, string[][]> };
type PersistedLegacy = { version: 1 | 2; bindings: Record<string, string[]> };

const decode = <Value extends { version: number; bindings: object }>(
  raw: string | null,
  version: Value['version']
): Value | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Value>;
    return value.version === version && value.bindings && typeof value.bindings === 'object'
      ? value as Value
      : null;
  } catch {
    return null;
  }
};

const repairLegacyShortcut = (shortcut: string) => shortcut.trim().split(/\s+/).filter(
  (stroke) => !/(?:^|\+)(?:code:)?(?:Meta|Control|Shift|Alt)(?:Left|Right)$/i.test(stroke)
);

const normalizeBindings = (bindings: Record<string, unknown[]>, legacy: boolean) =>
  Object.fromEntries(Object.entries(bindings).flatMap(([entryId, shortcuts]) => {
    if (!Array.isArray(shortcuts)) return [];
    const normalized = shortcuts.flatMap((shortcut) => {
      const input = legacy && typeof shortcut === 'string'
        ? repairLegacyShortcut(shortcut)
        : shortcut;
      if (typeof input !== 'string' &&
          (!Array.isArray(input) || !input.every((stroke) => typeof stroke === 'string'))) return [];
      const sequence = normalizeShortcut(input as string | string[]);
      return sequence ? [sequence] : [];
    });
    return shortcuts.length > 0 && normalized.length === 0 ? [] : [[entryId, normalized]];
  })) as Record<string, ShortcutSequence[]>;

export const hydrateEditorKeymap = <Context>(
  keymap: EditorKeymap<Context>,
  storage: Pick<Storage, 'getItem'>
) => {
  try {
    const v3 = decode<PersistedV3>(storage.getItem(EDITOR_KEYMAP_STORAGE_KEY), 3);
    if (v3) {
      keymap.hydrateUserBindings(normalizeBindings(v3.bindings, false));
      return 'v3' as const;
    }
    const v2 = decode<PersistedLegacy>(storage.getItem(PREVIOUS_EDITOR_KEYMAP_STORAGE_KEY), 2);
    const v1 = v2 ? null : decode<PersistedLegacy>(storage.getItem(LEGACY_EDITOR_KEYMAP_STORAGE_KEY), 1);
    const persisted = v2 ?? v1;
    if (!persisted) return null;
    keymap.hydrateUserBindings(normalizeBindings(persisted.bindings, true));
    return v2 ? 'v2' as const : 'v1' as const;
  } catch {
    return null;
  }
};

export const persistEditorKeymap = <Context>(
  keymap: EditorKeymap<Context>,
  storage: Pick<Storage, 'setItem'>
) => {
  const value: PersistedV3 = {
    version: 3,
    bindings: Object.fromEntries(Object.entries(keymap.getUserBindings()).map(([id, shortcuts]) => [
      id,
      shortcuts.map((sequence) => [...sequence]),
    ])),
  };
  try {
    storage.setItem(EDITOR_KEYMAP_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage is an optional device-local adapter.
  }
};

export const connectEditorKeymapPersistence = <Context>(
  keymap: EditorKeymap<Context>,
  storage: Pick<Storage, 'getItem' | 'setItem'>
) => {
  const source = hydrateEditorKeymap(keymap, storage);
  if (source === 'v1' || source === 'v2') persistEditorKeymap(keymap, storage);
  return keymap.subscribe(() => persistEditorKeymap(keymap, storage));
};
