import * as shared from '@chardesk/editor-core/editor/shortcut';
export type {
  ShortcutStroke,
  ShortcutSequence,
  ShortcutPlatform,
} from '@chardesk/editor-core/editor/shortcut';
const platform = (): shared.ShortcutPlatform => {
  if (typeof navigator === 'undefined') return 'linux';
  const value = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  return /mac|iphone|ipad|ipod/i.test(value) ? 'mac' : /win/i.test(value) ? 'windows' : 'linux';
};
export {
  shortcutSequenceKey,
  shortcutsEqual,
} from '@chardesk/editor-core/editor/shortcut';
export const normalizeShortcutStroke = (
  ...args: Parameters<typeof shared.normalizeShortcutStroke>
) => shared.normalizeShortcutStroke(args[0], args[1] ?? platform());
export const normalizeShortcut = (...args: Parameters<typeof shared.normalizeShortcut>) =>
  shared.normalizeShortcut(args[0], args[1] ?? platform());
export const shortcutFromKeyInput = (...args: Parameters<typeof shared.shortcutFromKeyInput>) =>
  shared.shortcutFromKeyInput(args[0], args[1] ?? platform());
export const formatShortcutStroke = (...args: Parameters<typeof shared.formatShortcutStroke>) =>
  shared.formatShortcutStroke(args[0], args[1] ?? platform(), args[2]);
export const formatShortcutSequence = (...args: Parameters<typeof shared.formatShortcutSequence>) =>
  shared.formatShortcutSequence(args[0], args[1] ?? platform(), args[2]);
