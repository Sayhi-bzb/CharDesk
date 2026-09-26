import type { KeymapBindingSnapshot, ShortcutScope } from '@/domains/editor/public';
import type { I18nKey } from '@/shared/i18n';

type Translate = (key: I18nKey, params?: Record<string, string | number>) => string;

export const SHORTCUT_CATEGORY_ORDER = [
  'General',
  'Canvas',
  'Selection',
  'Formatting',
  'Tools',
  'Presentation',
] as const;

export type ShortcutCategory = (typeof SHORTCUT_CATEGORY_ORDER)[number];

/** Localized labels for legacy commands; the keymap snapshot owns catalog membership. */
const EDITOR_SHORTCUT_LABEL_KEYS: Readonly<Partial<Record<string, I18nKey>>> = {
  'command:undo': 'manual.shortcut.undo',
  'command:redo': 'manual.shortcut.redo',
  'command:copy': 'manual.shortcut.copy',
  'command:cut': 'manual.shortcut.cut',
  'command:paste': 'manual.shortcut.paste',
  'command:delete-selection': 'manual.shortcut.delete',
  'command:format-bold': 'selection.bold',
  'command:format-italic': 'selection.italic',
  'command:format-underline': 'selection.underline',
  'command:format-strike': 'selection.strike',
  'command:format-inverse': 'selection.inverse',
  'command:toggle-sidebar': 'sidebar.toggle',
  'command:toggle-inspector': 'inspector.toggle',
};

export const getShortcutCommandLabel = (
  entry: Pick<KeymapBindingSnapshot, 'id' | 'label'>,
  t: Translate
) => {
  const labelKey = EDITOR_SHORTCUT_LABEL_KEYS[entry.id];
  return labelKey ? t(labelKey) : (entry.label ?? entry.id);
};

export const getShortcutCategory = (category?: string): ShortcutCategory =>
  SHORTCUT_CATEGORY_ORDER.find((candidate) => candidate === category) ?? 'General';

export const getShortcutCategoryLabel = (category: ShortcutCategory, t: Translate) => {
  const keys: Record<ShortcutCategory, I18nKey> = {
    General: 'shortcutEditor.category.general',
    Canvas: 'shortcutEditor.category.canvas',
    Selection: 'shortcutEditor.category.selection',
    Formatting: 'shortcutEditor.category.formatting',
    Tools: 'shortcutEditor.category.tools',
    Presentation: 'shortcutEditor.category.presentation',
  };
  return t(keys[category]);
};

export const getShortcutScopeLabel = (scope: ShortcutScope | undefined, t: Translate) => {
  const keys: Partial<Record<ShortcutScope, I18nKey>> = {
    application: 'shortcutEditor.scope.application',
    canvas: 'shortcutEditor.scope.canvas',
    grid: 'shortcutEditor.scope.grid',
    presentation: 'shortcutEditor.scope.presentation',
  };
  const key = scope ? keys[scope] : undefined;
  return key ? t(key) : '—';
};
