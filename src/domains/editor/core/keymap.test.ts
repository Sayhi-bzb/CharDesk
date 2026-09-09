import { describe, expect, it } from 'vitest';
import {
  EditorKeymap,
  findShortcutConflicts,
  getShortcutConflictKind,
  shortcutScopesOverlap,
} from './keymap';

describe('shortcut conflicts', () => {
  const entries = [
    { id: 'sidebar', scope: 'application' as const, shortcuts: [['Mod+K', 'B']] },
    { id: 'inspector', scope: 'canvas' as const, shortcuts: [['Mod+K', 'P']] },
    { id: 'grid-up', scope: 'grid' as const, shortcuts: [['Alt+P']] },
    { id: 'slide-up', scope: 'presentation' as const, shortcuts: [['Alt+P']] },
  ];

  it('distinguishes exact conflicts from chord-prefix ambiguity', () => {
    expect(getShortcutConflictKind(['Mod+K'], ['Mod+K', 'B'])).toBe('prefix');
    expect(getShortcutConflictKind(['Mod+B'], ['Mod+B'])).toBe('exact');
    expect(getShortcutConflictKind(['Mod+K', 'B'], ['Mod+K', 'P'])).toBeNull();
  });

  it('only compares shortcuts whose scopes can be active together', () => {
    expect(shortcutScopesOverlap('application', 'canvas')).toBe(true);
    expect(shortcutScopesOverlap('canvas', 'presentation')).toBe(true);
    expect(shortcutScopesOverlap('grid', 'presentation')).toBe(false);
    expect(findShortcutConflicts(entries, 'grid-up', ['Alt+P'])).toEqual([]);
    expect(findShortcutConflicts(entries, 'inspector', ['Mod+K'])).toEqual([
      expect.objectContaining({ kind: 'prefix', conflictingEntryId: 'sidebar' }),
      expect.objectContaining({ kind: 'prefix', conflictingEntryId: 'inspector' }),
    ]);
  });
});

describe('EditorKeymap', () => {
  it('applies overrides and orders contextual matches by priority', () => {
    const keymap = new EditorKeymap<{ editing: boolean }>();
    keymap.register('test', {
      id: 'global.undo',
      shortcuts: ['mod+z'],
      target: { type: 'command', id: 'undo' },
    });
    keymap.register('test', {
      id: 'text.undo',
      shortcuts: ['mod+z'],
      target: { type: 'command', id: 'text.undo' },
      priority: 10,
      when: ({ editing }) => editing,
    });

    expect(keymap.resolve(['mod+z'], { editing: true }).map((entry) => entry.id)).toEqual([
      'text.undo',
      'global.undo',
    ]);
    expect(keymap.getConflicts({ editing: true })).toEqual([
      { shortcut: ['Mod+Z'], entryIds: ['global.undo', 'text.undo'] },
    ]);
    expect(keymap.resolveBest(['mod+z'], { editing: true })).toMatchObject({
      type: 'match',
      entry: { id: 'text.undo', owner: 'test' },
    });

    keymap.setUserBindings('global.undo', [['mod+u']]);
    expect(keymap.resolve(['mod+z'], { editing: false })).toEqual([]);
    expect(keymap.resolve(['mod+u'], { editing: false })[0]?.target).toEqual({
      type: 'command',
      id: 'undo',
    });
  });

  it('uses registration order for equal-weight bindings and reports shadowing', () => {
    const keymap = new EditorKeymap();
    keymap.register('one', {
      id: 'one',
      shortcuts: ['mod+k'],
      target: { type: 'command', id: 'one' },
    });
    keymap.register('two', {
      id: 'two',
      shortcuts: ['mod+k'],
      target: { type: 'command', id: 'two' },
    });
    expect(keymap.resolveBest(['mod+k'], undefined)).toMatchObject({
      type: 'match',
      entry: { id: 'two' },
    });
    expect(keymap.diagnose(['mod+k'], undefined)).toMatchObject({
      winner: { id: 'two' },
      shadowed: [{ id: 'one' }],
    });
  });

  it('publishes stable snapshots and applies multi-entry overrides atomically', () => {
    const keymap = new EditorKeymap();
    keymap.register('test', {
      id: 'command:undo',
      scope: 'canvas',
      shortcuts: ['mod+z'],
      target: { type: 'command', id: 'undo' },
    });
    keymap.register('test', {
      id: 'command:copy',
      shortcuts: ['mod+c'],
      target: { type: 'command', id: 'copy' },
    });
    const initial = keymap.getSnapshot();
    expect(keymap.getSnapshot()).toBe(initial);
    expect(initial.entries[0]).toMatchObject({
      id: 'command:undo',
      scope: 'canvas',
      defaultShortcuts: [['Mod+Z']],
      shortcuts: [['Mod+Z']],
      userDefined: false,
    });

    let notifications = 0;
    keymap.subscribe(() => notifications++);
    keymap.updateUserBindings({
      'command:undo': [],
      'command:copy': [['Shift+Mod+Z']],
    });

    expect(notifications).toBe(1);
    expect(keymap.getSnapshot()).not.toBe(initial);
    expect(keymap.getSnapshot().entries).toEqual([
      expect.objectContaining({
        id: 'command:undo',
        shortcuts: [],
        userDefined: true,
      }),
      expect.objectContaining({
        id: 'command:copy',
        shortcuts: [['Mod+Shift+Z']],
        userDefined: true,
      }),
    ]);

    keymap.updateUserBindings({
      'command:undo': [],
      'command:copy': [['mod+shift+z']],
    });
    expect(notifications).toBe(1);
  });

  it('validates an atomic update before changing any entry', () => {
    const keymap = new EditorKeymap();
    keymap.register('test', {
      id: 'command:undo',
      shortcuts: ['mod+z'],
      target: { type: 'command', id: 'undo' },
    });
    keymap.register('test', {
      id: 'command:copy',
      shortcuts: ['mod+c'],
      target: { type: 'command', id: 'copy' },
    });

    expect(() =>
      keymap.updateUserBindings({
        'command:undo': [['mod+u']],
        'command:copy': [['mod']],
      })
    ).toThrow('Invalid shortcut mod');
    expect(keymap.getUserBindings()).toEqual({});
  });

  it('resolves declarative context expressions and chord prefixes', () => {
    const keymap = new EditorKeymap<{ canvas: { mode: string }; grid: { hasRange: boolean } }>();
    keymap.register('test', {
      id: 'contextual',
      shortcuts: ['mod+k mod+c'],
      target: { type: 'command', id: 'contextual' },
      when: {
        all: [
          { key: 'canvas.mode', equals: 'freeform' },
          { not: { key: 'grid.hasRange', equals: false } },
        ],
      },
    });
    const active = { canvas: { mode: 'freeform' }, grid: { hasRange: true } };
    expect(keymap.resolveBest(['mod+k', 'mod+c'], active)).toMatchObject({ type: 'match' });
    expect(
      keymap.resolveBest(['mod+k', 'mod+c'], {
        canvas: { mode: 'slide' },
        grid: { hasRange: true },
      })
    ).toEqual({ type: 'none' });
  });
});
