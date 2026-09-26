'use client';

import { useCallback, useMemo } from 'react';
import {
  DEFAULT_TEXT_RENDER_THEMES,
  createTextRenderThemeMap,
  TEXT_RENDER_FEATURES,
  useTextRenderingRuntime,
  useTextRenderProfile,
  type TextRenderColorDefault,
  type TextRenderFeatureDefinition,
  type TextRenderFeatureColorSlotDefinition,
  type TextRenderTheme,
  type TextRenderThemeTokenId,
  type TextRendererMode,
} from '@/domains/document/public';
import { useUiI18n, type I18nKey } from '@/shared/i18n';
import {
  Checkbox,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SwatchButton,
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
  useUiTheme,
} from '@chardesk/ui';




import { ColorPickerPanel } from '@/widgets/color-picker';
import {
  SettingsDataTable,
  type SettingsDataTableColumn,
  type SettingsDataTableGroup,
} from './settings-data-table';

type DisplaySettingsPanelProps = {
  revealSettingId?: string | null;
  onRevealComplete?: () => void;
};

type DisplaySettingsColumnId = 'setting' | 'value' | 'color';

type ColorSegment = {
  color?: string;
  inherited?: boolean;
};

type DisplaySetting =
  | { id: 'text-renderer'; kind: 'renderer'; label: 'settings.textRenderer' }
  | {
      id: `theme:${TextRenderThemeTokenId}`;
      kind: 'theme-token';
      token: TextRenderThemeTokenId;
      label:
        | 'settings.renderTheme.foreground'
        | 'settings.renderTheme.background'
        | 'settings.renderTheme.accent'
        | 'settings.renderTheme.accentForeground'
        | 'settings.renderTheme.info'
        | 'settings.renderTheme.done'
        | 'settings.renderTheme.success'
        | 'settings.renderTheme.warning'
        | 'settings.renderTheme.danger'
        | 'settings.renderTheme.mutedForeground'
        | 'settings.renderTheme.borderSubtle'
        | 'settings.renderTheme.gridSubtle'
        | 'settings.renderTheme.surface'
        | 'settings.renderTheme.surfaceForeground';
    }
  | {
      id: string;
      kind: 'render-feature';
      label: I18nKey;
      feature: TextRenderFeatureDefinition;
    }
  | {
      id: string;
      kind: 'render-feature-colors';
      label: I18nKey;
      feature: TextRenderFeatureDefinition;
      slotIds: readonly string[];
    };

const rendererSetting: DisplaySetting = {
  id: 'text-renderer',
  kind: 'renderer',
  label: 'settings.textRenderer',
};

const themeSettings: readonly DisplaySetting[] = [
  {
    id: 'theme:foreground',
    kind: 'theme-token',
    token: 'foreground',
    label: 'settings.renderTheme.foreground',
  },
  {
    id: 'theme:background',
    kind: 'theme-token',
    token: 'background',
    label: 'settings.renderTheme.background',
  },
  { id: 'theme:accent', kind: 'theme-token', token: 'accent', label: 'settings.renderTheme.accent' },
  {
    id: 'theme:accent-foreground',
    kind: 'theme-token',
    token: 'accent-foreground',
    label: 'settings.renderTheme.accentForeground',
  },
  { id: 'theme:info', kind: 'theme-token', token: 'info', label: 'settings.renderTheme.info' },
  { id: 'theme:done', kind: 'theme-token', token: 'done', label: 'settings.renderTheme.done' },
  { id: 'theme:success', kind: 'theme-token', token: 'success', label: 'settings.renderTheme.success' },
  { id: 'theme:warning', kind: 'theme-token', token: 'warning', label: 'settings.renderTheme.warning' },
  { id: 'theme:danger', kind: 'theme-token', token: 'danger', label: 'settings.renderTheme.danger' },
  {
    id: 'theme:muted-foreground',
    kind: 'theme-token',
    token: 'muted-foreground',
    label: 'settings.renderTheme.mutedForeground',
  },
  {
    id: 'theme:border-subtle',
    kind: 'theme-token',
    token: 'border-subtle',
    label: 'settings.renderTheme.borderSubtle',
  },
  {
    id: 'theme:grid-subtle',
    kind: 'theme-token',
    token: 'grid-subtle',
    label: 'settings.renderTheme.gridSubtle',
  },
  { id: 'theme:surface', kind: 'theme-token', token: 'surface', label: 'settings.renderTheme.surface' },
  {
    id: 'theme:surface-foreground',
    kind: 'theme-token',
    token: 'surface-foreground',
    label: 'settings.renderTheme.surfaceForeground',
  },
];

const featureSettings = TEXT_RENDER_FEATURES.flatMap((feature): DisplaySetting[] => [
  {
    id: feature.id,
    kind: 'render-feature',
    label: feature.label,
    feature,
  },
  ...(feature.colorRows ?? []).map((row) => ({
    id: `${feature.id}:${row.id}`,
    kind: 'render-feature-colors' as const,
    label: row.label,
    feature,
    slotIds: row.slotIds,
  })),
]);
const inlineSettings = featureSettings.filter(
  (setting) => 'feature' in setting && setting.feature.settingsGroup === 'inline'
);
const mathSettings = featureSettings.filter(
  (setting) => 'feature' in setting && setting.feature.settingsGroup === 'math'
);
const blockSettings = featureSettings.filter(
  (setting) => 'feature' in setting && setting.feature.settingsGroup === 'blocks'
);

function MarkdownColorControl({
  defaultSegments,
  label,
  color,
  appearance,
  className,
  onPick,
  onReset,
}: {
  defaultSegments: readonly ColorSegment[];
  label: string;
  color?: string;
  appearance: 'light' | 'dark';
  className?: string;
  onPick: (color: string) => void;
  onReset: () => void;
}) {
  const { t } = useUiI18n();
  const inheritedLabel = t('settings.color.inherited');
  const segments: ColorSegment[] = color
    ? [{ color }]
    : [...defaultSegments];
  const composite = segments.length > 1;
  const inherited = segments.length === 1 && segments[0]?.inherited === true;
  const solidColor = !composite && !inherited ? segments[0]?.color : undefined;
  const defaultValues = defaultSegments.map((segment) =>
    segment.color ?? inheritedLabel
  );
  const colorLabel = color
    ?? `${t('settings.color.default')} (${defaultValues.join(' / ')})`;
  return (
    <Popover>
      <Tooltip>
        <PopoverTrigger asChild>
          <TooltipTrigger
            render={
              <SwatchButton
                color={solidColor ?? 'transparent'}
                className={cn('ml-auto', className)}
                swatchClassName={cn(
                  (inherited || composite) && 'relative overflow-hidden shadow-none',
                  inherited &&
                    "after:absolute after:h-px after:w-3 after:-rotate-45 after:bg-muted-foreground after:content-['']"
                )}
                data-color-preview={color ? 'custom' : composite ? 'mixed' : inherited ? 'inherit' : 'default'}
                data-inherited={inherited || undefined}
                aria-label={`${t('settings.color.customize', { setting: label })}: ${colorLabel}`}
              />
            }
          >
            {composite &&
              segments.map((segment, index) => (
                <span
                  key={segment.color ?? `inherited-${index}`}
                  data-color-segment={segment.color ?? 'inherited'}
                  className={cn(
                    'relative h-full min-w-0 flex-1',
                    segment.inherited &&
                      "after:absolute after:left-1/2 after:top-1/2 after:h-px after:w-2 after:-translate-x-1/2 after:-translate-y-1/2 after:-rotate-45 after:bg-muted-foreground after:content-['']"
                  )}
                  style={segment.color ? { backgroundColor: segment.color } : undefined}
                />
              ))}
          </TooltipTrigger>
        </PopoverTrigger>
        <TooltipPopup>{label}</TooltipPopup>
      </Tooltip>
      <PopoverContent side="right" align="start" className="w-auto p-0">
        <ColorPickerPanel
          value={color ?? ''}
          onPick={onPick}
          appearance={appearance}
          onReset={color ? onReset : undefined}
          showCanvasPicker={false}
        />
      </PopoverContent>
    </Popover>
  );
}

const resolveDefaultSegments = (
  source: TextRenderColorDefault,
  theme: TextRenderTheme
): ColorSegment[] => {
  if (source.kind === 'inherit') return [{ inherited: true }];
  if (source.kind === 'token') return [{ color: theme[source.token] }];
  return [
    ...source.tokens.map((token) => ({ color: theme[token] })),
    ...(source.includesInherited ? [{ inherited: true }] : []),
  ];
};

function FeatureColorControls({
  slots,
  label,
  theme,
  colors,
  appearance,
  onPick,
  onReset,
}: {
  slots: readonly TextRenderFeatureColorSlotDefinition[];
  label: string;
  theme: TextRenderTheme;
  colors: Record<string, string>;
  appearance: 'light' | 'dark';
  onPick: (slot: string, color: string) => void;
  onReset: (slot: string) => void;
}) {
  const { t } = useUiI18n();
  if (slots.length === 0) {
    return <span className="text-muted-foreground">{t('settings.color.syntax')}</span>;
  }
  return (
    <div className="flex justify-end gap-1">
      {slots.map((slot) => (
        <MarkdownColorControl
          key={slot.id}
          defaultSegments={resolveDefaultSegments(slot.default, theme)}
          label={slot.label ? t(slot.label) : label}
          color={colors[slot.id]}
          appearance={appearance}
          className="ml-0"
          onPick={(color) => onPick(slot.id, color)}
          onReset={() => onReset(slot.id)}
        />
      ))}
    </div>
  );
}

export function DisplaySettingsPanel({
  revealSettingId,
  onRevealComplete,
}: DisplaySettingsPanelProps) {
  const { t } = useUiI18n();
  const { resolvedTheme: hostResolvedTheme } = useUiTheme();
  const textRendering = useTextRenderingRuntime();
  const textRenderProfile = useTextRenderProfile();
  const themeMode = hostResolvedTheme === 'dark' ? 'dark' : 'light';
  const activeRenderTheme = textRenderProfile.renderThemes[themeMode];
  const resolvedRenderTheme = textRendering.getResolvedTheme(themeMode);
  const columns = useMemo<SettingsDataTableColumn<DisplaySettingsColumnId>[]>(
    () => [
      {
        id: 'setting',
        header: t('settings.column.setting'),
        widthClassName: 'w-[38%]',
        cellClassName: 'truncate ps-8 text-muted-foreground',
      },
      {
        id: 'value',
        header: t('settings.column.value'),
        widthClassName: 'w-[30%]',
        headerClassName: 'text-right',
        cellClassName: 'text-right',
      },
      {
        id: 'color',
        header: t('settings.column.color'),
        widthClassName: 'w-[32%]',
        headerClassName: 'text-right',
        cellClassName: 'text-right',
      },
    ],
    [t]
  );
  const groups = useMemo<SettingsDataTableGroup<DisplaySetting>[]>(
    () => [
      { id: 'rendering', label: t('settings.rendering'), items: [rendererSetting] },
      {
        id: 'theme',
        label: `${t('settings.renderTheme')} · ${t(`settings.theme.${themeMode}`)}`,
        items: themeSettings,
      },
      { id: 'inline', label: t('settings.markdownRules.inline'), items: inlineSettings },
      { id: 'math', label: t('settings.markdownRules.math'), items: mathSettings },
      { id: 'blocks', label: t('settings.markdownRules.block'), items: blockSettings },
    ],
    [t, themeMode]
  );
  const revealSetting = useCallback((row: HTMLTableRowElement) => {
    if (typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    row.querySelector<HTMLElement>('[data-settings-control]')?.focus({ preventScroll: true });
  }, []);

  return (
    <SettingsDataTable
      columns={columns}
      groups={groups}
      getItemId={(setting) => setting.id}
      getGroupToggleLabel={(group, expanded) =>
        t(expanded ? 'settings.group.collapse' : 'settings.group.expand', {
          group: group.label,
        })
      }
      revealItemId={revealSettingId}
      onRevealItem={revealSetting}
      onRevealComplete={onRevealComplete}
      dataSlot="display-settings-grid"
      bodyDataSlot="display-settings-list"
      groupRowDataSlot="display-settings-group-row"
      renderItemCell={(setting, columnId) => {
        const renderFeature = 'feature' in setting ? setting.feature : null;
        const featureConfig = renderFeature
          ? textRenderProfile.features[renderFeature.id] ?? {
              enabled: renderFeature.defaultEnabled,
              colors: createTextRenderThemeMap(() => ({})),
            }
          : null;
        if (columnId === 'setting') {
          return setting.kind === 'render-feature-colors'
            ? <span className="ps-3">{t(setting.label)}</span>
            : t(setting.label);
        }
        if (columnId === 'value') {
          if (setting.kind === 'theme-token') {
            return <span className="text-muted-foreground">—</span>;
          }
          return setting.kind === 'renderer' ? (
            <Select
              value={textRenderProfile.mode}
              onValueChange={(mode) =>
                textRendering.setProfile({
                  ...textRenderProfile,
                  mode: mode as TextRendererMode,
                })
              }
            >
              <SelectTrigger
                id="settings-text-renderer"
                data-settings-control=""
                aria-label={t(setting.label)}
                className="ml-auto w-full max-w-40 min-w-0"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" position="popper">
                <SelectGroup>
                  {(['auto', 'ansi', 'markdown', 'raw'] as const).map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {t(`settings.textRenderer.${mode}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : setting.kind === 'render-feature-colors' || renderFeature?.control === 'style' ? (
            <span className="text-muted-foreground" aria-hidden="true">—</span>
          ) : (
            <Checkbox
              data-settings-control=""
              aria-label={t(setting.label)}
              checked={featureConfig!.enabled}
              onCheckedChange={(checked) => {
                textRendering.setProfile({
                  ...textRenderProfile,
                  features: {
                    ...textRenderProfile.features,
                    [setting.feature.id]: {
                      ...featureConfig!,
                      enabled: checked === true,
                    },
                  },
                });
              }}
            />
          );
        }
        return (
          <>
            {setting.kind === 'renderer' ? (
              <span className="text-muted-foreground" aria-hidden="true">
                —
              </span>
            ) : setting.kind === 'theme-token' ? (
              <MarkdownColorControl
                defaultSegments={[{ color: DEFAULT_TEXT_RENDER_THEMES[themeMode][setting.token] }]}
                label={t(setting.label)}
                color={activeRenderTheme[setting.token]}
                appearance={themeMode}
                onPick={(color) =>
                  textRendering.setProfile({
                    ...textRenderProfile,
                    renderThemes: {
                      ...textRenderProfile.renderThemes,
                      [themeMode]: {
                        ...activeRenderTheme,
                        [setting.token]: color,
                      },
                    },
                  })
                }
                onReset={() => {
                  const renderTheme = { ...activeRenderTheme };
                  delete renderTheme[setting.token];
                  textRendering.setProfile({
                    ...textRenderProfile,
                    renderThemes: {
                      ...textRenderProfile.renderThemes,
                      [themeMode]: renderTheme,
                    },
                  });
                }}
              />
            ) : setting.kind === 'render-feature' && setting.feature.colorRows?.length ? (
              <span className="text-muted-foreground" aria-hidden="true">—</span>
            ) : (
              <FeatureColorControls
                slots={setting.kind === 'render-feature-colors'
                  ? setting.feature.colorSlots.filter((slot) => setting.slotIds.includes(slot.id))
                  : setting.feature.colorSlots}
                label={t(setting.label)}
                theme={resolvedRenderTheme}
                colors={featureConfig!.colors[themeMode]}
                appearance={themeMode}
                onPick={(slot, color) => {
                  textRendering.setProfile({
                    ...textRenderProfile,
                    features: {
                      ...textRenderProfile.features,
                      [setting.feature.id]: {
                        ...featureConfig!,
                        colors: {
                          ...featureConfig!.colors,
                          [themeMode]: {
                            ...featureConfig!.colors[themeMode],
                            [slot]: color,
                          },
                        },
                      },
                    },
                  });
                }}
                onReset={(slot) => {
                  const colors = { ...featureConfig!.colors[themeMode] };
                  delete colors[slot];
                  textRendering.setProfile({
                    ...textRenderProfile,
                    features: {
                      ...textRenderProfile.features,
                      [setting.feature.id]: {
                        ...featureConfig!,
                        colors: { ...featureConfig!.colors, [themeMode]: colors },
                      },
                    },
                  });
                }}
              />
            )}
          </>
        );
      }}
    />
  );
}
