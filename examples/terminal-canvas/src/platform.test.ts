import { expect, test } from 'bun:test';
import { createTerminalShortcuts } from './shortcuts.ts';
import { helpLines } from './copy.ts';

for (const platform of ['darwin', 'win32'] as const) {
  test(`${platform} shortcut labels and help follow one native policy`, () => {
    const shortcuts = createTerminalShortcuts(platform);
    const help = helpLines(shortcuts).join('\n');
    expect(help).toContain('Changes save automatically');
    expect(shortcuts).not.toHaveProperty('save');
    expect(shortcuts).not.toHaveProperty('save-all');
    expect(Object.values(shortcuts).flatMap((action) => action.keys)).not.toContain(
      platform === 'darwin' ? 'Meta+S' : 'Ctrl+S'
    );
    expect(help).toContain(shortcuts.redo.label);
    expect(shortcuts.edit.keys).toEqual([]);
    expect(shortcuts.hand.keys).toEqual([]);
    expect(shortcuts.minimap.keys).toEqual([]);
    expect(shortcuts.settings.keys).toEqual([]);
    expect(shortcuts.documents.keys).toEqual([]);
    expect(shortcuts.search.keys).toEqual(
      platform === 'darwin' ? ['Meta+F', 'F8'] : ['Ctrl+F', 'F8']
    );
    expect(shortcuts.search.label).toBe(platform === 'darwin' ? '⌘F' : 'Ctrl+F');
    expect(shortcuts.copy.keys).toEqual(platform === 'darwin' ? ['Meta+C', 'Ctrl+Y'] : ['Ctrl+C']);
    if (platform === 'darwin') {
      for (const action of ['cut', 'paste', 'undo', 'redo', 'select-all'] as const)
        expect(shortcuts[action].keys.every((key) => key.startsWith('Meta+'))).toBe(true);
    }
    expect(shortcuts.quit.keys).not.toContain('Meta+Q');
  });
}
