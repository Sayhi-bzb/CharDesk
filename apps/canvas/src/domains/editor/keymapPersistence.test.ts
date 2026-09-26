import { describe, expect, it, vi } from 'vitest';
import { EditorKeymap } from './core/keymap';
import {
  connectEditorKeymapPersistence,
  EDITOR_KEYMAP_STORAGE_KEY,
  LEGACY_EDITOR_KEYMAP_STORAGE_KEY,
  PREVIOUS_EDITOR_KEYMAP_STORAGE_KEY,
  hydrateEditorKeymap,
} from './keymapPersistence';

const createKeymap = () => {
  const keymap = new EditorKeymap();
  keymap.register('test', {
    id: 'command:undo', shortcuts: ['mod+z'], target: { type: 'command', id: 'undo' },
  });
  return keymap;
};

describe('editor keymap persistence', () => {
  it('hydrates v3 sequence arrays', () => {
    const keymap = createKeymap();
    expect(hydrateEditorKeymap(keymap, {
      getItem: (key) => key === EDITOR_KEYMAP_STORAGE_KEY
        ? JSON.stringify({ version: 3, bindings: { 'command:undo': [['Mod+Shift+U']] } })
        : null,
    })).toBe('v3');
    expect(keymap.getBindings('command:undo')).toEqual([['Mod+Shift+U']]);
  });

  it('repairs polluted modifier strokes while migrating v2', () => {
    const keymap = createKeymap();
    hydrateEditorKeymap(keymap, {
      getItem: (key) => key === PREVIOUS_EDITOR_KEYMAP_STORAGE_KEY
        ? JSON.stringify({
            version: 2,
            bindings: { 'command:undo': ['mod+code:MetaLeft mod+r'] },
          })
        : null,
    });
    expect(keymap.getBindings('command:undo')).toEqual([['Mod+R']]);
  });

  it('drops invalid non-empty overrides so defaults are restored', () => {
    const keymap = createKeymap();
    hydrateEditorKeymap(keymap, {
      getItem: (key) => key === LEGACY_EDITOR_KEYMAP_STORAGE_KEY
        ? JSON.stringify({ version: 1, bindings: { 'command:undo': ['mod'] } })
        : null,
    });
    expect(keymap.getBindings('command:undo')).toEqual([['Mod+Z']]);
  });

  it('persists v3 and tolerates unavailable storage', () => {
    const keymap = createKeymap();
    const setItem = vi.fn();
    const disconnect = connectEditorKeymapPersistence(keymap, { getItem: () => null, setItem });
    keymap.setUserBindings('command:undo', [['mod+u']]);
    expect(setItem).toHaveBeenCalledWith(
      EDITOR_KEYMAP_STORAGE_KEY,
      JSON.stringify({ version: 3, bindings: { 'command:undo': [['Mod+U']] } })
    );
    disconnect();
    expect(() => hydrateEditorKeymap(keymap, { getItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });

  it('writes migrated v1 values to v3 without deleting legacy storage', () => {
    const keymap = createKeymap();
    const setItem = vi.fn();
    connectEditorKeymapPersistence(keymap, {
      getItem: (key) => key === LEGACY_EDITOR_KEYMAP_STORAGE_KEY
        ? JSON.stringify({ version: 1, bindings: { 'command:undo': [] } })
        : null,
      setItem,
    });
    expect(setItem).toHaveBeenCalledWith(
      EDITOR_KEYMAP_STORAGE_KEY,
      JSON.stringify({ version: 3, bindings: { 'command:undo': [] } })
    );
  });
});
