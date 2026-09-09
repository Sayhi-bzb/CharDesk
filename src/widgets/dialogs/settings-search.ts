import { formatShortcutLabel } from '@/domains/actions/public';
import { TEXT_RENDER_FEATURES } from '@/domains/document/public';
import type { KeymapBindingSnapshot } from '@/domains/editor/public';
import type { I18nKey } from '@/shared/i18n';
import {
  getShortcutCategory,
  getShortcutCategoryLabel,
  getShortcutCommandLabel,
  getShortcutScopeLabel,
} from './editor-shortcut-catalog';

export type SettingsSection = 'general' | 'display' | 'shortcuts';

export type SettingsTarget = {
  section: SettingsSection;
  focus?:
    | { type: 'language' }
    | { type: 'host-theme' }
    | { type: 'text-renderer' }
    | { type: 'canvas-font' }
    | { type: 'canvas-cursor' }
    | { type: 'canvas-cursor-blink' }
    | { type: 'render-feature'; featureId: string }
    | { type: 'shortcut'; entryId: string };
};

export type SettingsSearchResult = {
  id: string;
  group: SettingsSection;
  groupTitle: string;
  title: string;
  target: SettingsTarget;
  searchText: string;
};

type Translate = (key: I18nKey, params?: Record<string, string | number>) => string;

const searchable = (values: readonly string[]) => values.join(' ').toLocaleLowerCase();

export const getSettingsSearchResults = (
  query: string,
  entries: readonly KeymapBindingSnapshot[],
  t: Translate
) => {
  const generalTitle = t('settings.general');
  const shortcutsTitle = t('appMenu.shortcuts');
  const displayTitle = t('settings.display');
  const languageTitle = t('appMenu.language');
  const results: SettingsSearchResult[] = [
    {
      id: 'setting:host-theme',
      group: 'general',
      groupTitle: generalTitle,
      title: t('settings.theme'),
      target: { section: 'general', focus: { type: 'host-theme' } },
      searchText: searchable([
        t('settings.theme'),
        t('settings.theme.light'),
        t('settings.theme.dark'),
        t('settings.theme.system'),
        'theme',
        '主题',
      ]),
    },
    {
      id: 'setting:canvas-cursor',
      group: 'general',
      groupTitle: generalTitle,
      title: t('settings.canvasCursor'),
      target: { section: 'general', focus: { type: 'canvas-cursor' } },
      searchText: searchable([
        t('settings.canvasCursor'),
        t('settings.canvasCursor.block'),
        t('settings.canvasCursor.bar'),
        t('settings.canvasCursor.underline'),
        'cursor',
        '光标',
      ]),
    },
    {
      id: 'setting:canvas-cursor-blink',
      group: 'general',
      groupTitle: generalTitle,
      title: t('settings.canvasCursorBlink'),
      target: { section: 'general', focus: { type: 'canvas-cursor-blink' } },
      searchText: searchable([t('settings.canvasCursorBlink'), 'blink', '闪烁']),
    },
    {
      id: 'setting:canvas-font',
      group: 'general',
      groupTitle: generalTitle,
      title: t('settings.canvasFont'),
      target: { section: 'general', focus: { type: 'canvas-font' } },
      searchText: searchable([t('settings.canvasFont'), 'font', '字体', 'Maple Mono', 'Fusion Pixel', 'Xiaolai Mono']),
    },
    {
      id: 'section:general',
      group: 'general',
      groupTitle: generalTitle,
      title: generalTitle,
      target: { section: 'general' },
      searchText: searchable([generalTitle]),
    },
    {
      id: 'setting:language',
      group: 'general',
      groupTitle: generalTitle,
      title: languageTitle,
      target: { section: 'general', focus: { type: 'language' } },
      searchText: searchable([
        languageTitle,
        t('appMenu.english'),
        t('appMenu.chinese'),
        'English',
        '中文',
      ]),
    },
    ...TEXT_RENDER_FEATURES.flatMap((feature): SettingsSearchResult[] => [
      {
        id: `setting:${feature.id}`,
        group: 'display',
        groupTitle: displayTitle,
        title: `${t('settings.markdownRules')} · ${t(feature.label)}`,
        target: {
          section: 'display',
          focus: { type: 'render-feature', featureId: feature.id },
        },
        searchText: searchable([
          t(feature.label),
          ...feature.colorSlots.flatMap((slot) => slot.label ? [t(slot.label)] : []),
        ]),
      },
      ...(feature.colorRows ?? []).map((row) => ({
        id: `setting:${feature.id}:${row.id}`,
        group: 'display' as const,
        groupTitle: displayTitle,
        title: `${t('settings.markdownRules')} · ${t(feature.label)} · ${t(row.label)}`,
        target: {
          section: 'display' as const,
          focus: {
            type: 'render-feature' as const,
            featureId: `${feature.id}:${row.id}`,
          },
        },
        searchText: searchable([
          t(feature.label),
          t(row.label),
          ...row.slotIds.flatMap((slotId) => {
            const slot = feature.colorSlots.find((item) => item.id === slotId);
            return slot?.label ? [t(slot.label)] : [];
          }),
        ]),
      })),
    ]),
    {
      id: 'section:display',
      group: 'display',
      groupTitle: displayTitle,
      title: displayTitle,
      target: { section: 'display' },
      searchText: searchable([
        displayTitle,
        t('settings.textRenderer'),
        t('settings.column.color'),
        'ANSI',
        'Markdown',
        'Raw',
      ]),
    },
    {
      id: 'setting:text-renderer',
      group: 'display',
      groupTitle: displayTitle,
      title: t('settings.textRenderer'),
      target: { section: 'display', focus: { type: 'text-renderer' } },
      searchText: searchable([
        t('settings.textRenderer'),
        t('settings.renderTheme'),
        t('settings.renderTheme.accent'),
        t('settings.renderTheme.info'),
        t('settings.renderTheme.done'),
        t('settings.renderTheme.success'),
        t('settings.renderTheme.warning'),
        t('settings.renderTheme.danger'),
        t('settings.renderTheme.mutedForeground'),
        t('settings.renderTheme.borderSubtle'),
        t('settings.renderTheme.gridSubtle'),
        t('settings.renderTheme.surface'),
        t('settings.markdownRules'),
        t('settings.column.color'),
        ...TEXT_RENDER_FEATURES.map((feature) => t(feature.label)),
        'ANSI',
        'Markdown',
        'Raw',
      ]),
    },
    {
      id: 'section:shortcuts',
      group: 'shortcuts',
      groupTitle: shortcutsTitle,
      title: shortcutsTitle,
      target: { section: 'shortcuts' },
      searchText: searchable([shortcutsTitle, t('shortcutEditor.title')]),
    },
    ...entries
      .filter((entry) => entry.configurable)
      .map((entry): SettingsSearchResult => {
        const title = getShortcutCommandLabel(entry, t);
        const category = getShortcutCategory(entry.category);
        const categoryLabel = getShortcutCategoryLabel(category, t);
        const scopeLabel = getShortcutScopeLabel(entry.scope, t);
        const shortcuts = entry.shortcuts.map((shortcut) => formatShortcutLabel(shortcut));
        return {
          id: `shortcut:${entry.id}`,
          group: 'shortcuts',
          groupTitle: shortcutsTitle,
          title,
          target: { section: 'shortcuts', focus: { type: 'shortcut', entryId: entry.id } },
          searchText: searchable([title, categoryLabel, scopeLabel, ...shortcuts]),
        };
      }),
  ];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return normalizedQuery
    ? results.filter((result) => result.searchText.includes(normalizedQuery))
    : [];
};
