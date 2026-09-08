import {
  ALL_KEYS,
  formatForDisplay,
  hasNonModifierKey,
  isModifierKey,
  matchesKeyboardEvent,
  normalizeHotkey,
  normalizeHotkeyFromEvent,
  normalizeKeyName,
  validateHotkey,
  type Hotkey,
} from '@tanstack/hotkeys';
import type { KeyInput } from '@chardesk/keyboard';

export type ShortcutStroke = string;
export type ShortcutSequence = readonly ShortcutStroke[];
export type ShortcutPlatform = 'mac' | 'windows' | 'linux';

const MAX_SEQUENCE_LENGTH = 2;
const VALID_KEYS = new Set<string>(ALL_KEYS);

const getPlatform = (): ShortcutPlatform => {
  if (typeof navigator === 'undefined') return 'linux';
  const platform = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  if (/mac|iphone|ipad|ipod/i.test(platform)) return 'mac';
  return /win/i.test(platform) ? 'windows' : 'linux';
};

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
  const parts = candidate.split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0 || new Set(parts.map((part) => part.toLowerCase())).size !== parts.length) {
    return null;
  }
  const key = normalizeKeyName(parts.at(-1) ?? '');
  if (isModifierKey(key) || !VALID_KEYS.has(key)) return null;
  const validation = validateHotkey(candidate);
  if (!validation.valid || !hasNonModifierKey(candidate, platform)) return null;
  return normalizeHotkey(candidate, platform);
};

/** Converts legacy space-delimited shortcuts and canonical stroke arrays to one sequence shape. */
export const normalizeShortcut = (
  shortcut: string | readonly string[],
  platform: ShortcutPlatform = getPlatform()
): ShortcutSequence | null => {
  const strokes = typeof shortcut === 'string'
    ? shortcut.trim().split(/\s+/).filter(Boolean)
    : [...shortcut];
  if (strokes.length === 0 || strokes.length > MAX_SEQUENCE_LENGTH) return null;
  const normalized = strokes.map((stroke) => normalizeShortcutStroke(stroke, platform));
  return normalized.every((stroke): stroke is string => stroke !== null) ? normalized : null;
};

export const shortcutSequenceKey = (sequence: ShortcutSequence) => sequence.join('\u001f');

export const shortcutsEqual = (left: ShortcutSequence, right: ShortcutSequence) =>
  left.length === right.length && left.every((stroke, index) => stroke === right[index]);

const hotkeyEventFromInput = (input: KeyInput): KeyboardEvent => ({
  key: input.key,
  code: input.code,
  ctrlKey: input.modifiers.ctrl,
  shiftKey: input.modifiers.shift,
  altKey: input.modifiers.alt,
  metaKey: input.modifiers.meta,
}) as KeyboardEvent;

export const shortcutFromKeyInput = (
  input: KeyInput,
  platform: ShortcutPlatform = getPlatform()
): ShortcutStroke | null => {
  if (input.composing || input.modifiers.altGraph || input.phase !== 'down') return null;
  const event = hotkeyEventFromInput(input);
  const key = normalizeKeyName(event.key);
  if (isModifierKey(key)) return null;
  const recordingPlatform = event.metaKey && !event.ctrlKey
    ? 'mac'
    : event.ctrlKey && !event.metaKey
      ? 'windows'
      : platform;
  const stroke = normalizeHotkeyFromEvent(event, recordingPlatform);
  return hasNonModifierKey(stroke, recordingPlatform) ? stroke : null;
};

export const matchesShortcutInput = (
  input: KeyInput,
  stroke: ShortcutStroke,
  platform: ShortcutPlatform = getPlatform()
) => {
  if (input.composing || input.modifiers.altGraph || input.phase !== 'down') return false;
  const event = hotkeyEventFromInput(input);
  if (matchesKeyboardEvent(event, stroke as Hotkey, platform)) return true;
  if (!stroke.includes('Mod+')) return false;
  const eventPlatform = event.metaKey && !event.ctrlKey
    ? 'mac'
    : event.ctrlKey && !event.metaKey
      ? 'windows'
      : platform;
  return eventPlatform !== platform && matchesKeyboardEvent(event, stroke as Hotkey, eventPlatform);
};

export const matchHotkeySequenceInput = (
  matcher: Readonly<{ match: (event: KeyboardEvent) => boolean }>,
  input: KeyInput
) => matcher.match(hotkeyEventFromInput(input));

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
