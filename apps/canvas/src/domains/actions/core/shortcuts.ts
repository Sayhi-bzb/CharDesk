import { APP_ACTION_META } from './catalog';
import {
  formatShortcutSequence,
  normalizeShortcut,
  type CanvasEditorRuntime,
  type ShortcutSequence,
} from '@/domains/editor/public';
import type { EditorActionId, ShortcutToken, SidebarActionId } from './types';

type CanvasEditorKeymap = CanvasEditorRuntime['keymap'];
export type ShortcutPlatform = 'mac' | 'other';
export type ShortcutDisplayStroke = { label: string; accessibleLabel: string };

const getShortcutPlatform = (): ShortcutPlatform => {
  if (typeof navigator === 'undefined') return 'other';
  const platform = navigator.platform || navigator.userAgent || '';
  return /mac|iphone|ipad|ipod/i.test(platform) ? 'mac' : 'other';
};

const toEditorPlatform = (platform: ShortcutPlatform) => platform === 'mac' ? 'mac' : 'windows';

export const setEditorCommandShortcutOverride = (
  keymap: CanvasEditorKeymap,
  commandId: EditorActionId,
  shortcuts: readonly (readonly ShortcutToken[])[] | null
) => keymap.setUserBindings(
  `command:${commandId}`,
  shortcuts?.map((shortcut) => [shortcut.join('+')]) ?? null
);

export const getShortcutDisplayStrokes = (
  shortcut: string | ShortcutSequence,
  platform = getShortcutPlatform()
): ShortcutDisplayStroke[] => {
  const target = toEditorPlatform(platform);
  const sequence = normalizeShortcut(shortcut, target);
  if (!sequence) return [];
  const labels = formatShortcutSequence(sequence, target, true).map((label) =>
    platform === 'other' ? label.replaceAll('+', ' ') : label
  );
  const accessible = formatShortcutSequence(sequence, target, false).map((label) =>
    label
      .replace(/^Cmd\b/, 'Command')
      .replace(/^Ctrl\b/, 'Control')
      .replace('ArrowUp', 'Up Arrow')
      .replace('ArrowDown', 'Down Arrow')
      .replace('ArrowLeft', 'Left Arrow')
      .replace('ArrowRight', 'Right Arrow')
  );
  return labels.map((label, index) => ({ label, accessibleLabel: accessible[index] }));
};

export const formatShortcutLabel = (
  shortcut: string | ShortcutSequence,
  platform = getShortcutPlatform()
) => getShortcutDisplayStrokes(shortcut, platform)
  .map((stroke) => stroke.accessibleLabel)
  .join(', then ');

const formatCompact = (sequence: ShortcutSequence, platform: ShortcutPlatform) =>
  formatShortcutSequence(sequence, toEditorPlatform(platform), platform === 'mac')
    .map((stroke) => platform === 'mac' ? stroke.replaceAll(' ', '') : stroke)
    .join(', then ');

export const getEditorCommandShortcutLabel = (
  keymap: CanvasEditorKeymap,
  commandId: EditorActionId,
  platform = getShortcutPlatform()
) => {
  const configured = keymap.getBindings(`command:${commandId}`);
  return configured?.length
    ? configured.map((sequence) => formatCompact(sequence, platform)).join(' / ')
    : undefined;
};

export const getAppActionShortcutLabel = (
  actionId: SidebarActionId,
  platform = getShortcutPlatform()
) => {
  const chords = APP_ACTION_META[actionId].shortcuts;
  if (!chords?.length) return undefined;
  return chords.map((chord) => {
    const shortcut = typeof chord === 'string' ? chord : chord.join('+');
    const sequence = normalizeShortcut(shortcut, toEditorPlatform(platform));
    return sequence ? formatCompact(sequence, platform) : shortcut;
  }).join(' / ');
};

export const getAppActionShortcuts = (actionId: SidebarActionId) =>
  APP_ACTION_META[actionId].shortcuts?.map((shortcut) =>
    typeof shortcut === 'string' ? shortcut : shortcut.join('+')
  ) ?? [];
