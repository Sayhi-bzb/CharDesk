export type TerminalAction =
  | 'dock-next'
  | 'dock-previous'
  | 'dock-activate'
  | 'confirm-placement'
  | 'cancel-placement'
  | 'characters'
  | 'templates'
  | 'tools'
  | 'edit'
  | 'hand'
  | 'minimap'
  | 'help'
  | 'settings'
  | 'context-menu'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'undo'
  | 'redo'
  | 'select-all'
  | 'save-copy'
  | 'open'
  | 'new'
  | 'documents'
  | 'next-document'
  | 'previous-document'
  | 'search'
  | 'next-match'
  | 'anchors'
  | 'add-anchor'
  | 'close-document'
  | 'quit'
  | 'focus'
  | 'origin'
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down';
export type TerminalShortcut = { keys: readonly string[]; label: string; repeatable: boolean };
import type { TerminalInputPolicy } from './terminalPolicy.ts';

/** Native labels and bindings come from the same per-Host platform policy. */
export function createTerminalShortcuts(platform: NodeJS.Platform, policy?: TerminalInputPolicy) {
  const mac = platform === 'darwin';
  const key = (keys: string[], label = keys.join(' / '), repeatable = false): TerminalShortcut => ({
    keys,
    label,
    repeatable,
  });
  const primary = (letter: string, repeatable = false) =>
    key(
      mac ? [`Meta+${letter}`] : [`Ctrl+${letter}`],
      mac ? `⌘${letter}` : `Ctrl+${letter}`,
      repeatable
    );
  return {
    'dock-next': key(['Tab'], 'Tab', true),
    'dock-previous': key(['Shift+Tab'], 'Shift+Tab', true),
    'dock-activate': key(['Enter', 'Space']),
    edit: key(['F2']),
    tools: key(['Shift+F2']),
    templates: key(['Shift+F4']),
    characters: key(['Shift+F3']),
    'confirm-placement': key([], 'Enter'),
    'cancel-placement': key([], 'Esc'),
    hand: key(['F3']),
    minimap: key(['F4']),
    help: key(['F1']),
    'context-menu': key(['Shift+F10']),
    settings: key(['F11']),
    // Ctrl+Y is Vibe's documented macOS copy fallback; it needs no Super encoding.
    // Keep Command available when forwarded, but do not advertise it on Warp.
    copy: mac
      ? key(['Meta+C', 'Ctrl+Y'], policy?.terminal === 'warp' ? 'Ctrl+Y' : '⌘C / Ctrl+Y')
      : primary('C'),
    cut: primary('X'),
    paste: primary('V'),
    undo: primary('Z', true),
    redo: mac
      ? key(['Meta+Shift+Z'], '⌘⇧Z', true)
      : key(['Ctrl+Y', 'Ctrl+Shift+Z'], 'Ctrl+Y / Ctrl+Shift+Z', true),
    'select-all': primary('A'),
    'save-copy': key([]),
    open: key([...primary('O').keys, 'F10'], `${primary('O').label} / F10`),
    new: primary('N'),
    documents: key(['F7']),
    'next-document': key(['F6']),
    'previous-document': key(['Shift+F6']),
    search: key([...primary('F').keys, 'F8'], `${primary('F').label} / F8`),
    'next-match': primary('G', true),
    anchors: key(['F9']),
    'add-anchor': key(['Shift+F9']),
    'close-document': primary('W'),
    // Command+Q belongs to the terminal application on macOS.
    quit: key(['Ctrl+Q']),
    focus: key(['F5']),
    origin: key(['Home']),
    'pan-left': key(['Alt+Left'], mac ? '⌥←' : 'Alt+←', true),
    'pan-right': key(['Alt+Right'], mac ? '⌥→' : 'Alt+→', true),
    'pan-up': key(['Alt+Up'], mac ? '⌥↑' : 'Alt+↑', true),
    'pan-down': key(['Alt+Down'], mac ? '⌥↓' : 'Alt+↓', true),
  } satisfies Record<TerminalAction, TerminalShortcut>;
}
export type TerminalShortcuts = ReturnType<typeof createTerminalShortcuts>;
import type { EditorKeymapSnapshot } from '@chardesk/editor-core/editor/keymap';
import { formatShortcutSequence } from '@chardesk/editor-core/editor/shortcut';

/** Present the same effective catalog that the input engine consumes. */
export function effectiveTerminalShortcuts(
  defaults: TerminalShortcuts,
  snapshot: EditorKeymapSnapshot,
  platform: NodeJS.Platform
): TerminalShortcuts {
  const result = { ...defaults };
  for (const entry of snapshot.entries) {
    if (!entry.userDefined || !entry.id.startsWith('terminal.')) continue;
    const action = entry.id.slice('terminal.'.length) as TerminalAction;
    if (!(action in result)) continue;
    result[action] = {
      ...result[action],
      keys: entry.shortcuts.map((sequence) => sequence.join(' ')),
      label:
        entry.shortcuts
          .map((sequence) =>
            formatShortcutSequence(
              sequence,
              platform === 'darwin' ? 'mac' : 'windows',
              platform === 'darwin'
            ).join(' ')
          )
          .join(' / ') || '—',
    };
  }
  return result;
}
