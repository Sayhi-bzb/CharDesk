import { describe, expect, it, vi } from 'vitest';
import {
  formatShortcutLabel,
  getEditorCommandShortcutLabel,
  getShortcutDisplayStrokes,
} from './shortcuts';
import { createEditorCommandsExtension } from './runtime';
import { getCanvasState, testingCanvasRuntime } from '@/domains/canvas/testing';
import { createCanvasEditorRuntime } from '@/domains/editor/public';

describe('editor command shortcut labels', () => {
  it('combines one key stroke into one platform display label', () => {
    expect(getShortcutDisplayStrokes('mod+shift+z', 'mac')).toEqual([
      { label: '⌘ ⇧ Z', accessibleLabel: 'Command+Shift+Z' },
    ]);
    expect(getShortcutDisplayStrokes('mod+shift+z', 'other')).toEqual([
      { label: 'Ctrl Shift Z', accessibleLabel: 'Control+Shift+Z' },
    ]);
  });

  it('maps named and physical keys without exposing storage tokens', () => {
    const labels = [
      'arrowup',
      'arrowdown',
      'code:Digit6',
      'code:KeyK',
      'code:BracketLeft',
    ].flatMap((shortcut) =>
      getShortcutDisplayStrokes(shortcut, 'mac').map((stroke) => stroke.label)
    );

    expect(labels).toEqual(['↑', '↓', '6', 'K', '[']);
    expect(labels.join(' ')).not.toMatch(/arrow|code:/i);
  });

  it('keeps a key sequence as separate strokes and formats an accessible label', () => {
    expect(getShortcutDisplayStrokes('mod+k mod+c', 'mac')).toEqual([
      { label: '⌘ K', accessibleLabel: 'Command+K' },
      { label: '⌘ C', accessibleLabel: 'Command+C' },
    ]);
    expect(formatShortcutLabel('mod+k mod+c', 'mac')).toBe('Command+K, then Command+C');
  });

  it('formats labels from the registered keymap', () => {
    const editor = createCanvasEditorRuntime({
      state: { get: getCanvasState, subscribe: () => () => undefined },
      history: {
        undo: () => false,
        redo: () => false,
        beginCheckpoint: () => ({ commit: vi.fn(), cancel: vi.fn() }),
        finishCapture: vi.fn(),
      },
      transactions: { run: (fn) => fn() },
    });
    editor.registerExtension(createEditorCommandsExtension(testingCanvasRuntime as never));

    expect(getEditorCommandShortcutLabel(editor.keymap, 'undo', 'mac')).toBe('⌘Z');
    expect(getEditorCommandShortcutLabel(editor.keymap, 'undo', 'other')).toBe('Ctrl+Z');
    expect(getEditorCommandShortcutLabel(editor.keymap, 'redo', 'mac')).toBe('⌘⇧Z / ⌘Y');
    expect(getEditorCommandShortcutLabel(editor.keymap, 'delete-selection', 'other'))
      .toBeUndefined();
  });
});
