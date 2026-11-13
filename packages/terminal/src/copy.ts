import { english, type Translate } from './i18n.ts';
import type { TerminalShortcuts } from './shortcuts.ts';
import type { TerminalInputPolicy } from './terminalPolicy.ts';
import { shortcutSections } from './shortcutGuide.ts';

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

/** Plain-text projection of the same grouped guide model. */
export function helpLines(
  s: TerminalShortcuts,
  policy?: TerminalInputPolicy,
  hyperlinks?: boolean,
  panStep = 10,
  t: Translate = english
) {
  const lines = shortcutSections(s, policy, hyperlinks, panStep, t).flatMap(({ rows }) =>
    rows.map(({ keys, label, detail }) => `${keys} ${label}${detail ? `: ${detail}` : ''}`)
  );
  return [lines.slice(0, 3).join(' · '), ...lines.slice(3)];
}
