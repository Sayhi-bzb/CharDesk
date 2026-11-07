import {
  ALL_KEYS,
  formatForDisplay,
  hasNonModifierKey,
  isModifierKey,
  normalizeHotkey,
  normalizeHotkeyFromEvent,
  normalizeKeyName,
  validateHotkey,
} from '@tanstack/hotkeys';
import type { KeyInput } from '@chardesk/keyboard';

type ShortcutKeyboardEvent = Parameters<typeof normalizeHotkeyFromEvent>[0] & {
  key: string;
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
};

export type ShortcutStroke = string;
export type ShortcutSequence = readonly ShortcutStroke[];
export type ShortcutPlatform = 'mac' | 'windows' | 'linux';

const MAX_SEQUENCE_LENGTH = 2;
const VALID_KEYS = new Set<string>(ALL_KEYS);

const getPlatform = (): ShortcutPlatform => 'linux';

const PHYSICAL_PUNCTUATION_KEYS: Readonly<Record<string, string>> = {
  backquote: '`',
  backslash: '\\',
  bracketleft: '[',
  bracketright: ']',
  comma: ',',
  equal: '=',
  intlbackslash: '\\',
  minus: '-',
  period: '.',
  semicolon: ';',
  slash: '/',
};

const migratePhysicalKey = (stroke: string) =>
  stroke.replace(
    /code:(?:Key([A-Z])|Digit([0-9])|([A-Za-z]+))/gi,
    (match, letter, digit, physicalKey) =>
      (letter ?? digit)?.toUpperCase() ??
      PHYSICAL_PUNCTUATION_KEYS[physicalKey.toLowerCase()] ??
      match
  );

export const normalizeShortcutStroke = (
  stroke: string,
  platform: ShortcutPlatform = getPlatform()
): ShortcutStroke | null => {
  const candidate = migratePhysicalKey(stroke.trim());
  if (!candidate || candidate.includes(' ')) return null;
  const parts = candidate
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (
    parts.length === 0 ||
    new Set(parts.map((part) => part.toLowerCase())).size !== parts.length
  ) {
    return null;
  }
  const key = normalizeKeyName(parts.at(-1) ?? '');
  if (isModifierKey(key) || !VALID_KEYS.has(key)) return null;
  const validation = validateHotkey(candidate);
  if (!validation.valid || !hasNonModifierKey(candidate, platform)) return null;
  const normalized = normalizeHotkey(candidate, platform);
  // Portable Mod is explicit policy. Preserve a literal Control/Command binding
  // when TanStack canonicalization would otherwise make it platform-adaptive.
  return /(?:^|\+)mod\+/i.test(candidate)
    ? normalized
    : normalized.replace(/(^|\+)Mod(?=\+)/g, `$1${platform === 'mac' ? 'Meta' : 'Control'}`);
};

/** Converts legacy space-delimited shortcuts and canonical stroke arrays to one sequence shape. */
export const normalizeShortcut = (
  shortcut: string | readonly string[],
  platform: ShortcutPlatform = getPlatform()
): ShortcutSequence | null => {
  const strokes =
    typeof shortcut === 'string' ? shortcut.trim().split(/\s+/).filter(Boolean) : [...shortcut];
  if (strokes.length === 0 || strokes.length > MAX_SEQUENCE_LENGTH) return null;
  const normalized = strokes.map((stroke) => normalizeShortcutStroke(stroke, platform));
  return normalized.every((stroke): stroke is string => stroke !== null) ? normalized : null;
};

export const shortcutSequenceKey = (sequence: ShortcutSequence) => sequence.join('\u001f');

export const shortcutsEqual = (left: ShortcutSequence, right: ShortcutSequence) =>
  left.length === right.length && left.every((stroke, index) => stroke === right[index]);

// TanStack reads only these six fields; no DOM event is constructed by the core.
const hotkeyEventFromInput = (input: KeyInput): ShortcutKeyboardEvent =>
  ({
    key: input.key,
    code: input.code,
    ctrlKey: input.modifiers.ctrl,
    shiftKey: input.modifiers.shift,
    altKey: input.modifiers.alt,
    metaKey: input.modifiers.meta,
  }) as ShortcutKeyboardEvent;

export const shortcutFromKeyInput = (
  input: KeyInput,
  platform: ShortcutPlatform = getPlatform()
): ShortcutStroke | null => {
  if (input.composing || input.modifiers.altGraph || input.phase !== 'down') return null;
  const event = hotkeyEventFromInput(input);
  const key = normalizeKeyName(event.key);
  if (isModifierKey(key)) return null;
  const stroke = normalizeHotkeyFromEvent(event, platform);
  return hasNonModifierKey(stroke, platform) ? stroke : null;
};

export const formatShortcutStroke = (
  stroke: ShortcutStroke,
  platform: ShortcutPlatform = getPlatform(),
  useSymbols = true
) => formatForDisplay(stroke, { platform, useSymbols });

export const formatShortcutSequence = (
  sequence: ShortcutSequence,
  platform: ShortcutPlatform = getPlatform(),
  useSymbols = true
) => sequence.map((stroke) => formatShortcutStroke(stroke, platform, useSymbols));
