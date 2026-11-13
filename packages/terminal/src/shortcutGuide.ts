import { english, type Translate } from './i18n.ts';
import { terminalActionLabels } from './actionLabels.ts';
import type { TerminalAction, TerminalShortcuts } from './shortcuts.ts';
import type { TerminalInputPolicy } from './terminalPolicy.ts';

export type ShortcutGuideRow = { label: string; keys: string; detail?: string };
export type ShortcutGuideSection = { label: string; rows: ShortcutGuideRow[] };

/** One guide model for the dialog and text readers; bindings remain owned by the keymap. */
export function shortcutSections(
  s: TerminalShortcuts,
  policy?: TerminalInputPolicy,
  hyperlinks?: boolean,
  panStep = 10,
  t: Translate = english
): ShortcutGuideSection[] {
  const action = (id: TerminalAction, detail?: string, fallback = '—'): ShortcutGuideRow => ({
    label: t(terminalActionLabels[id] ?? id),
    keys: s[id].keys.length ? s[id].label : t(fallback),
    detail,
  });
  const row = (label: string, keys: string, detail?: string): ShortcutGuideRow => ({
    label: t(label),
    keys,
    detail,
  });
  const rangeClick =
    policy?.terminal === 'warp'
      ? t('Option(Alt)+click')
      : policy?.shiftClick === 'requested'
        ? t('Shift+click / Option(Alt)+click')
        : t('Option(Alt)+click / Shift+click (if forwarded)');
  const terminalNotes =
    policy?.terminal === 'warp'
      ? [
          t('Warp: Shift+click selects terminal text; Option+click extends the canvas range.'),
          t`Warp: ⌘C forwarding issue; use ${s.copy.label} or context-menu Copy.`,
        ]
      : policy?.shiftClick === 'requested'
        ? [
            t('Ghostty: Shift+click requested; terminal overrides can block it.'),
            t('Ghostty: ⌘C needs terminal forwarding; context-menu Copy also works.'),
          ]
        : [t('Key/click forwarding depends on the terminal and multiplexer.')];
  return [
    {
      label: t('Edit'),
      rows: [
        action('copy'),
        action('cut'),
        action('paste', t('Paste detects format by default; --paste-mode plain preserves source')),
        action('select-all'),
        action('undo'),
        action('redo'),
        row('Select a range', t('Drag'), t('Edit: click and type; drag to select a rectangle')),
        row(
          'Extend selection',
          rangeClick,
          t`${rangeClick}: extend selection · Ctrl+click: append selection`
        ),
        row('Move selection', t('Drag'), t('Drag selection: preview movement; release to commit')),
        row('Fill selection', t('Type'), t('Type one character in a selection: fill')),
        row('Newline', 'Enter', t('Enter: newline')),
        row('Delete', 'Delete / Backspace', t('Delete / Backspace: erase grapheme or selection')),
        action('format-bold'),
        action('format-italic'),
        action('format-underline'),
        action('format-strike'),
      ],
    },
    {
      label: t('Canvas'),
      rows: [
        action('edit', t('Edit: click and type; drag to select a rectangle'), 'Dock'),
        action('hand', t('Hand: left-drag to pan the canvas'), 'Dock'),
        action('tools'),
        action('inspector'),
        action('characters'),
        action('templates'),
        action('search'),
        action('next-match'),
        action('anchors'),
        action('add-anchor'),
        action('navigation'),
        row(
          'Pan',
          `${s['pan-left'].label} / ${s['pan-right'].label} / ${s['pan-up'].label} / ${s['pan-down'].label}`,
          t`${s['pan-left'].label} / ${s['pan-right'].label} / ${s['pan-up'].label} / ${s['pan-down'].label}: pan ${panStep} cells`
        ),
        row('Move cursor', '← ↑ ↓ →', t('Arrows: move cursor · Ctrl+arrows: move selection')),
        row('Extend selection', 'Shift+← ↑ ↓ →', t('Shift+arrows: extend selection')),
        row('Select current row', s['select-row'].label),
        row('Select current column', s['select-column'].label),
        row('Page up', s['page-up'].label),
        row('Page down', s['page-down'].label),
        action('origin'),
        action('focus'),
        action('context-menu'),
      ],
    },
    {
      label: t('App'),
      rows: [
        action('view-shortcuts'),
        action('settings', undefined, 'Header'),
        action('documents', undefined, 'Header'),
        action('new'),
        action('open'),
        action('close-document'),
        action('next-document'),
        action('previous-document'),
        action('minimap', undefined, 'Header'),
        action('export'),
        action('sources'),
        action('feedback-details'),
        action('quit', t('Changes save automatically; closing and quitting wait for saving.')),
        row(
          'Links',
          '—',
          hyperlinks === false
            ? t('Link opening is not enabled in this terminal')
            : t(
                'Links: use the terminal open-link gesture (Warp macOS: ⌘+click); plain clicks edit'
              )
        ),
        ...terminalNotes.map((detail) => row('Terminal', policy?.terminal ?? '—', detail)),
      ],
    },
  ];
}
