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
  | 'export'
  | 'sources'
  | 'inspector'
  | 'navigation'
  | 'select-row'
  | 'select-column'
  | 'edge-left'
  | 'edge-right'
  | 'edge-start'
  | 'edge-end'
  | 'extend-edge-left'
  | 'extend-edge-right'
  | 'extend-edge-start'
  | 'extend-edge-end'
  | 'page-up'
  | 'page-down'
  | 'extend-page-up'
  | 'extend-page-down'
  | 'boundary-left'
  | 'boundary-right'
  | 'boundary-up'
  | 'boundary-down'
  | 'extend-boundary-left'
  | 'extend-boundary-right'
  | 'extend-boundary-up'
  | 'extend-boundary-down'
  | 'format-bold'
  | 'format-italic'
  | 'format-underline'
  | 'format-strike'
  | 'format-inverse'
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
import { messages } from './copy.ts';
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
    edit: key([]),
    tools: key(['Shift+F2']),
    templates: key(['Shift+F4']),
    characters: key(['Shift+F3']),
    'confirm-placement': key([], 'Enter'),
    'cancel-placement': key([], 'Esc'),
    hand: key([]),
    minimap: key([]),
    help: key(['F1']),
    'context-menu': key(['Shift+F10']),
    settings: key([]),
    export: key(['Shift+F7']),
    sources: key(['Shift+F12']),
    inspector: key(['Shift+F11']),
    navigation: key(['Shift+F8']),
    'select-row': key(['Shift+Space']),
    'select-column': key(['Ctrl+Space']),
    // Home remains Go to origin; every navigation action is available in the panel.
    'edge-left': key(['Ctrl+Home'], 'Ctrl+Home', true),
    'edge-right': key(['End'], 'End', true),
    'edge-start': key([], '—'),
    'edge-end': key(['Ctrl+End'], 'Ctrl+End', true),
    'extend-edge-left': key(['Shift+Home'], 'Shift+Home', true),
    'extend-edge-right': key(['Shift+End'], 'Shift+End', true),
    'extend-edge-start': key(['Ctrl+Shift+Home'], 'Ctrl+Shift+Home', true),
    'extend-edge-end': key(['Ctrl+Shift+End'], 'Ctrl+Shift+End', true),
    'page-up': key(['PageUp'], 'PageUp', true),
    'page-down': key(['PageDown'], 'PageDown', true),
    'extend-page-up': key(['Shift+PageUp'], 'Shift+PageUp', true),
    'extend-page-down': key(['Shift+PageDown'], 'Shift+PageDown', true),
    ...(Object.fromEntries(
      ['left', 'right', 'up', 'down'].flatMap((direction) =>
        [false, true].map((extend) => {
          const modifier = mac ? 'Meta+' : 'Ctrl+Alt+';
          const arrow = direction[0]!.toUpperCase() + direction.slice(1);
          return [
            `${extend ? 'extend-' : ''}boundary-${direction}`,
            key(
              [`${modifier}${extend ? 'Shift+' : ''}${arrow}`],
              `${mac ? '⌘' : 'Ctrl+Alt+'}${extend ? 'Shift+' : ''}${arrow}`,
              true
            ),
          ];
        })
      )
    ) as Record<`${'' | 'extend-'}boundary-${'left' | 'right' | 'up' | 'down'}`, TerminalShortcut>),
    'format-bold': primary('B'),
    'format-italic': primary('I'),
    'format-underline': primary('U'),
    'format-strike': key(mac ? ['Meta+Shift+X'] : ['Ctrl+Shift+X']),
    'format-inverse': key([], messages.inspector),
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
    documents: key([]),
    'next-document': key(['F6']),
    'previous-document': key(['Shift+F6']),
    search: key([...primary('F').keys, 'F8'], primary('F').label),
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
