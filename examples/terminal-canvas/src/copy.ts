import type { TerminalShortcuts } from './shortcuts.ts';
import type { TerminalInputPolicy } from './terminalPolicy.ts';

export const messages = {
  settings: 'Settings',
  title: 'CharDesk · Terminal Canvas',
  edit: 'Edit',
  hand: 'Hand',
  minimap: 'Minimap',
  minimapEmpty: 'No content',
  minimapSmall: 'Minimap needs at least 60 columns × 18 rows.',
  clipboardWorking: 'Working with clipboard…',
  copyDispatched: 'Copy request sent; clipboard acceptance is unknown.',
  cutDispatched: 'Copy request sent; selection kept because the clipboard has not confirmed it.',
  copied: 'Copied',
  pngCopied: 'PNG image copied',
  pngFailed: 'Unable to render PNG snapshot.',
  pngTooLarge: 'Selection is too large for a PNG snapshot.',
  pngPaletteUnavailable: 'Cannot snapshot: terminal colors are unavailable.',
  cut: 'Cut',
  pasted: 'Pasted',
  clipboardEmpty: 'Nothing to copy or paste.',
  clipboardFailed: 'Clipboard unavailable.',
  pasteFailed: 'Unable to prepare pasted text; canvas unchanged.',
  pasteWarnings: 'Paste warnings',
  clipboardStale: 'Clipboard action cancelled; its target or request changed.',
  viewport: 'View',
  cursor: 'Cursor',
  selection: 'selection',
  modified: 'modified',
  saved: 'unchanged',
  help: 'Help',
  'context-menu': 'Menu',
  closeHelp: 'F1 / Esc close help',
  saving: 'Saving…',
  saveDone: 'Saved',
  closing: 'Closing…',
  autosaving: 'Auto saving…',
  autosaved: 'Auto saved',
  recovered: 'Workspace restored',
  recoveryConflict: 'External changes preserved; recovered copies were opened',
  width: 'Some glyphs use a width fallback; saved text is unchanged.',
  handHint: 'Left-drag to pan',
  editHint: 'Click and type · Drag to select',
  copy: 'Copy',
  paste: 'Paste',
  save: 'Save',
} as const;

export function quitMessage(shortcuts: TerminalShortcuts) {
  return `Unsaved edits. ${shortcuts.save.label} saves current, ${shortcuts['save-all'].label} saves all; ${shortcuts.quit.label} again discards and exits.`;
}

export function rangeClickHint(policy: TerminalInputPolicy) {
  if (policy.terminal === 'warp') return 'Drag to select · Option+click extends';
  if (policy.shiftClick === 'requested') return 'Drag to select · Shift+click extends';
}

export function helpLines(
  s: TerminalShortcuts,
  policy?: TerminalInputPolicy,
  hyperlinks?: boolean,
  panStep = 10
) {
  const linkHint =
    hyperlinks === false
      ? 'Link opening is not enabled in this terminal'
      : 'Links: use the terminal open-link gesture (Warp macOS: ⌘+click); plain clicks edit';
  const rangeClick =
    policy?.terminal === 'warp'
      ? 'Option(Alt)+click'
      : policy?.shiftClick === 'requested'
        ? 'Shift+click / Option(Alt)+click'
        : 'Option(Alt)+click / Shift+click (if forwarded)';
  const terminalNotes =
    policy?.terminal === 'warp'
      ? [
          'Warp: Shift+click selects terminal text; Option+click extends the canvas range.',
          `Warp: ⌘C forwarding issue; use ${s.copy.label} or click Copy.`,
        ]
      : policy?.shiftClick === 'requested'
        ? [
            'Ghostty: Shift+click requested; terminal overrides can block it.',
            'Ghostty: ⌘C needs terminal forwarding; the Copy button also works.',
          ]
        : ['Key/click forwarding depends on the terminal and multiplexer.'];

  return [
    `${s.settings.label} Settings: appearance, navigation and paste`,
    `${s.characters.label} character library: browse, search, insert or choose brush glyph`,
    `${s.templates.label} templates: preview, position, Enter places`,
    `${s.edit.label} Edit · ${s.hand.label} Hand (default) · ${s.tools.label} drawing tools`,
    `${s['next-document'].label} / ${s['previous-document'].label} switch document · ${s.documents.label} documents`,
    `${s.open.label} Open · ${s.new.label} New · ${s['save-copy'].label} Save copy · ${s['save-all'].label} Save all`,
    `${s.search.label} Find · ${s['next-match'].label} next match · ${s.anchors.label} anchors · ${s['add-anchor'].label} add anchor`,
    'Hand: left-drag to pan the canvas',
    `${s['pan-left'].label} / ${s['pan-right'].label} / ${s['pan-up'].label} / ${s['pan-down'].label}: pan ${panStep} cells`,
    'Edit: click and type; drag to select a rectangle',
    `Right-click / ${s['context-menu'].label} / Menu button: actions; ↑↓ select, Enter runs, Esc closes`,
    linkHint,
    'i / h / m / I / H / M always type as text',
    `${rangeClick}: extend selection · Ctrl+click: append selection`,
    ...terminalNotes,
    'Shift+arrows: extend selection',
    'Drag selection: preview movement; release to commit',
    'Type one character in a selection: fill',
    'Arrows: move cursor · Ctrl+arrows: move selection',
    'Esc: cancel drag / clear selection; keep tool',
    'Enter / Tab: newline / tab stop',
    'Delete / Backspace: erase grapheme or selection',
    `${s.copy.label} Copy · ${s.cut.label} Cut · ${s.paste.label} Paste`,
    'Paste detects format by default; --paste-mode plain preserves source',
    `${s['select-all'].label}: select all content`,
    `${s.undo.label} / ${s.redo.label}: undo / redo`,
    `${s.save.label}: save .chardesk`,
    `${s.minimap.label}: toggle Minimap; keep tool`,
    `${s.origin.label} / ${s.focus.label}: origin / locate content`,
    `${s.quit.label}: quit (confirm unsaved edits)`,
  ];
}
