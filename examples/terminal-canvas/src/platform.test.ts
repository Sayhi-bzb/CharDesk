import { expect, test } from 'bun:test';
import { createTerminalShortcuts } from './shortcuts.ts';
import { helpLines, quitMessage } from './copy.ts';

for (const platform of ['darwin', 'win32'] as const) {
  test(`${platform} shortcut labels and help follow one native policy`, () => {
    const shortcuts = createTerminalShortcuts(platform);
    const help = helpLines(shortcuts).join('\n');
    expect(help).toContain(shortcuts.save.label);
    expect(help).toContain(shortcuts.redo.label);
    expect(quitMessage(shortcuts)).toContain(shortcuts.save.label);
    expect(shortcuts.edit.keys).toEqual(['F2']);
    expect(shortcuts.hand.keys).toEqual(['F3']);
    expect(shortcuts.minimap.keys).toEqual(['F4']);
    expect(shortcuts.copy.keys).toEqual(platform === 'darwin' ? ['Meta+C', 'Ctrl+Y'] : ['Ctrl+C']);
    if (platform === 'darwin') {
      for (const action of ['cut', 'paste', 'save', 'undo', 'redo', 'select-all'] as const)
        expect(shortcuts[action].keys.every((key) => key.startsWith('Meta+'))).toBe(true);
    }
    expect(shortcuts.quit.keys).not.toContain('Meta+Q');
  });
}
