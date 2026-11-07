import { english, type Translate } from './i18n.ts';
import type { TerminalShortcuts } from './shortcuts.ts';
import type { TerminalInputPolicy } from './terminalPolicy.ts';

export const messages = {
  settings: 'Settings',
  inspector: 'Style',
  export: 'Export',
  title: 'CharDesk · Terminal Canvas',
  edit: 'Edit',
  hand: 'Hand',
  minimap: 'Minimap',
  minimapEmpty: 'No content',
  minimapSmall: 'Minimap needs at least 60 columns × 18 rows.',
  clipboardWorking: 'Clipboard…',
  copyDispatched: 'Copy unconfirmed',
  cutDispatched: 'Not cut',
  copied: 'Copied',
  pngCopied: 'Image copied',
  pngFailed: 'Image unavailable',
  pngTooLarge: 'Image too large',
  pngPaletteUnavailable: 'Colors unavailable',
  cut: 'Cut complete',
  pasted: 'Pasted',
  clipboardEmpty: 'No content',
  clipboardFailed: 'Clipboard error',
  pasteFailed: 'Not pasted',
  clipboardStale: 'Cancelled',
  help: 'Help',
  closeHelp: 'F1 / Esc close help',
  closing: 'Closing…',
  recoveryConflict: 'Recovered copy opened',
  width: 'Some glyphs use a width fallback; saved text is unchanged.',
  handHint: 'Left-drag to pan',
  editHint: 'Click and type · Drag to select',
  copy: 'Copy',
  paste: 'Paste',
} as const;

export function localizedMessages(t: Translate): { readonly [K in keyof typeof messages]: string } {
  return Object.defineProperties(
    {},
    Object.fromEntries(
      Object.entries(messages).map(([key, value]) => [key, { get: () => t(value) }])
    )
  ) as { readonly [K in keyof typeof messages]: string };
}

export function rangeClickHint(policy: TerminalInputPolicy, t: Translate = english) {
  if (policy.terminal === 'warp') return t('Drag to select · Option+click extends');
  if (policy.shiftClick === 'requested') return t('Drag to select · Shift+click extends');
}

export function helpLines(
  s: TerminalShortcuts,
  policy?: TerminalInputPolicy,
  hyperlinks?: boolean,
  panStep = 10,
  t: Translate = english
) {
  const copy = localizedMessages(t);
  const linkHint =
    hyperlinks === false
      ? t('Link opening is not enabled in this terminal')
      : t('Links: use the terminal open-link gesture (Warp macOS: ⌘+click); plain clicks edit');
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

  const toolHint = (id: 'edit' | 'hand') =>
    [s[id].keys.length ? s[id].label : '', copy[id]].filter(Boolean).join(' ');
  const headerHint = (id: 'settings' | 'minimap' | 'documents', name: string) =>
    `${s[id].keys.length ? s[id].label : t('Header')} ${name}`;
  return [
    t`${s['feedback-details'].label}: feedback details or recovery action`,
    t`${headerHint('settings', t('Settings'))}: appearance, navigation and paste`,
    t`${s.inspector.label} ${copy.inspector}: selection text attributes and colors`,
    t`${s.export.label} Export: canvas or selection to TXT, ANSI, CharDesk or PNG files`,
    t`${s.sources.label} Source: check external changes or reload the native document`,
    t`${s.navigation.label} Selection and navigation: rows, columns, boundaries and pages`,
    t`${s.characters.label} character library: browse, search, insert or choose brush glyph`,
    t`${s.templates.label} templates: preview, position, Enter places`,
    t`${toolHint('edit')} · ${toolHint('hand')} (default) · ${s.tools.label} drawing tools`,
    t`${s['next-document'].label} / ${s['previous-document'].label} switch canvas · ${headerHint('documents', t('Sessions'))}`,
    t`${s.open.label} Open · ${s.new.label} New`,
    t`${s.search.label} Find · ${s['next-match'].label} next match · ${s.anchors.label} anchors · ${s['add-anchor'].label} add anchor`,
    t('Hand: left-drag to pan the canvas'),
    t`${s['pan-left'].label} / ${s['pan-right'].label} / ${s['pan-up'].label} / ${s['pan-down'].label}: pan ${panStep} cells`,
    t('Edit: click and type; drag to select a rectangle'),
    t`Right-click / ${s['context-menu'].label}: actions; ↑↓ select, Enter runs, Esc closes`,
    linkHint,
    t('i / h / m / I / H / M always type as text'),
    t`${rangeClick}: extend selection · Ctrl+click: append selection`,
    ...terminalNotes,
    t('Shift+arrows: extend selection'),
    t('Drag selection: preview movement; release to commit'),
    t('Type one character in a selection: fill'),
    t('Arrows: move cursor · Ctrl+arrows: move selection'),
    t('Esc: cancel drag / clear selection; keep tool'),
    t('Enter: newline'),
    t`${s['dock-next'].label} / ${s['dock-previous'].label}: focus footer Edit / Hand / Style`,
    t`Controls: ${s['dock-activate'].label} runs · Esc returns to canvas`,
    t('Delete / Backspace: erase grapheme or selection'),
    t`${s.copy.label} Copy · ${s.cut.label} Cut · ${s.paste.label} Paste`,
    t('Paste detects format by default; --paste-mode plain preserves source'),
    t`${s['select-all'].label}: select all content`,
    t`${s.undo.label} / ${s.redo.label}: undo / redo`,
    t('Changes save automatically; closing and quitting wait for saving.'),
    t`${headerHint('minimap', t('Minimap'))}: toggle; keep tool`,
    t`${s.origin.label} / ${s.focus.label}: origin / locate content`,
    t`${s.quit.label}: quit after automatic saving`,
  ];
}
