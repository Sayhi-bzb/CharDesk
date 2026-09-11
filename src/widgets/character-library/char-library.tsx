'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { Check, ChevronRight, Loader2, RefreshCcw, X } from 'lucide-react';
import { writeClipboardPayload } from '@/domains/actions/public';
import { useCanvasState } from '@/domains/canvas/public';
import {
  useLibraryStore,
  type CharacterGroup,
  type CharacterPackId,
  type CharacterRecord,
  type CharacterViewId,
  type UnicodeFacetType,
} from '@/domains/character-library/public';
import {
  cn,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Button,
  IconButton,
  SelectableItem,
  Surface,
  StatusText,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipCreateHandle,
  TooltipPopup,
  TooltipTrigger,
  type TooltipHandle,
} from '@chardesk/ui';
import {
  useInPlaceFeedback,
  type InPlaceFeedback,
} from '@/shared/hooks/use-in-place-feedback';
import { resolveCharDeskFontRoute } from "@chardesk/rendering";
import { MAPLE_FONT_PROFILE } from "@chardesk/font-maple";
import { useUiI18n, type I18nKey } from '@/shared/i18n';










const PAGE_SIZE = 240;
type CopyFeedbackTarget = {
  entryKey: string;
  grapheme: string;
};

type CopyFeedback = InPlaceFeedback<CopyFeedbackTarget>;

const getCharacterEntryKey = (entry: CharacterRecord) => `${entry.id}-${entry.grapheme}`;

const UNICODE_FACET_LABEL_KEYS: Record<UnicodeFacetType, I18nKey> = {
  block: 'character.unicode.block',
  script: 'character.unicode.script',
  category: 'character.unicode.category',
};

const CHARACTER_GROUP_LABEL_KEYS: Record<CharacterPackId, Record<string, I18nKey>> = {
  essentials: {
    ascii: 'character.group.essentials.ascii',
    lines: 'character.group.essentials.lines',
    arrows: 'character.group.essentials.arrows',
    shapes: 'character.group.essentials.shapes',
    math: 'character.group.essentials.math',
    technical: 'character.group.essentials.technical',
    numbers: 'character.group.essentials.numbers',
    dingbats: 'character.group.essentials.dingbats',
    braille: 'character.group.essentials.braille',
    'common-symbols': 'character.group.essentials.common-symbols',
  },
  nerd: {
    'seti-ui-custom': 'character.group.nerd.seti-ui-custom',
    devicons: 'character.group.nerd.devicons',
    'font-awesome': 'character.group.nerd.font-awesome',
    'font-awesome-ext': 'character.group.nerd.font-awesome-ext',
    'material-design': 'character.group.nerd.material-design',
    'weather-icons': 'character.group.nerd.weather-icons',
    octicons: 'character.group.nerd.octicons',
    'powerline-symbols': 'character.group.nerd.powerline-symbols',
    'powerline-extra': 'character.group.nerd.powerline-extra',
    'iec-power': 'character.group.nerd.iec-power',
    'font-logos': 'character.group.nerd.font-logos',
    pomicons: 'character.group.nerd.pomicons',
    codicons: 'character.group.nerd.codicons',
    'progress-indicators': 'character.group.nerd.progress-indicators',
    'heavy-angle-brackets': 'character.group.nerd.heavy-angle-brackets',
  },
  emoji: {
    'smileys-emotion': 'character.group.emoji.smileys-emotion',
    'people-body': 'character.group.emoji.people-body',
    component: 'character.group.emoji.component',
    'animals-nature': 'character.group.emoji.animals-nature',
    'food-drink': 'character.group.emoji.food-drink',
    'travel-places': 'character.group.emoji.travel-places',
    activities: 'character.group.emoji.activities',
    objects: 'character.group.emoji.objects',
    symbols: 'character.group.emoji.symbols',
    flags: 'character.group.emoji.flags',
  },
};

const getCodePointLabel = (grapheme: string) =>
  Array.from(grapheme)
    .map((part) => {
      const codePoint = part.codePointAt(0);
      return codePoint === undefined
        ? ''
        : `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
    })
    .filter(Boolean)
    .join(' ');

function CharButton({
  entry,
  feedbackStatus,
  onClick,
  onFocus,
  onKeyDown,
  buttonRef,
  tabIndex,
  tooltipHandle,
}: {
  entry: CharacterRecord;
  feedbackStatus: CopyFeedback['status'] | null;
  onClick: (entry: CharacterRecord) => void;
  onFocus: (entry: CharacterRecord) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, entry: CharacterRecord) => void;
  buttonRef: (node: HTMLButtonElement | null) => void;
  tabIndex: number;
  tooltipHandle: TooltipHandle<string>;
}) {
  const { t } = useUiI18n();
  const codePoints = getCodePointLabel(entry.grapheme);
  const unavailable = !entry.insertable;
  const tooltipLabel = `${entry.name} · ${codePoints}${
    unavailable ? ` · ${t('character.metadataOnly')}` : ''
  }`;
  const actionLabel = unavailable
    ? tooltipLabel
    : `${t('character.copy', { character: entry.grapheme })} · ${tooltipLabel}`;
  const preview = entry.category.startsWith('M')
    ? `◌${entry.grapheme}`
    : entry.category === 'Zs'
      ? '␠'
      : entry.grapheme;

  return (
    <TooltipTrigger
      handle={tooltipHandle}
      payload={`${entry.name} · ${codePoints}`}
      disabled={unavailable}
      render={
        <IconButton
          ref={buttonRef}
          type="button"
          size="sm"
          feedback={feedbackStatus ?? undefined}
          aria-label={actionLabel}
          data-character-codepoints={codePoints}
          data-copy-feedback={feedbackStatus ?? undefined}
          disabled={unavailable}
          onClick={() => onClick(entry)}
          onFocus={() => onFocus(entry)}
          onKeyDown={(event) => onKeyDown(event, entry)}
          tabIndex={unavailable ? -1 : tabIndex}
          className="shrink-0"
        />
      }
    >
      <span className="relative flex size-full items-center justify-center">
        <span
          aria-hidden="true"
          style={{
            color: 'var(--character-library-foreground)',
            fontFamily: MAPLE_FONT_PROFILE.families[
              resolveCharDeskFontRoute(entry.grapheme)
            ],
          }}
          className={cn(
            'font-mono text-sm leading-none transition-[opacity,transform] duration-[var(--motion-fast)] ease-out motion-reduce:transition-none',
            feedbackStatus ? 'scale-75 opacity-0' : 'scale-100 opacity-100'
          )}
        >
          {preview}
        </span>
        <Check
          data-icon="inline-start"
          aria-hidden="true"
          className={cn(
            'absolute transition-[opacity,transform] duration-[var(--motion-fast)] ease-out motion-reduce:transition-none',
            feedbackStatus === 'success' ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
          )}
        />
        <X
          data-icon="inline-start"
          aria-hidden="true"
          className={cn(
            'absolute transition-[opacity,transform] duration-[var(--motion-fast)] ease-out motion-reduce:transition-none',
            feedbackStatus === 'error' ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
          )}
        />
      </span>
    </TooltipTrigger>
  );
}

function CharacterGrid({
  entries,
  copyFeedback,
  onSelect,
  paged = true,
}: {
  entries: CharacterRecord[];
  copyFeedback: CopyFeedback | null;
  onSelect: (entry: CharacterRecord) => void;
  paged?: boolean;
}) {
  const { t } = useUiI18n();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [activeEntryKey, setActiveEntryKey] = useState<string | null>(null);
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const keyboardHintId = useId();
  const tooltipHandle = useMemo(() => TooltipCreateHandle<string>(), []);
  const visibleEntries = paged ? entries.slice(0, visibleCount) : entries;
  const focusableEntries = visibleEntries.filter((entry) => entry.insertable);
  const focusableEntryKeys = focusableEntries.map(getCharacterEntryKey);
  const resolvedActiveEntryKey =
    activeEntryKey && focusableEntryKeys.includes(activeEntryKey)
      ? activeEntryKey
      : (focusableEntryKeys[0] ?? null);

  useEffect(() => {
    if (activeEntryKey !== resolvedActiveEntryKey) {
      setActiveEntryKey(resolvedActiveEntryKey);
    }
  }, [activeEntryKey, resolvedActiveEntryKey]);

  const registerButton = useCallback((entryKey: string, node: HTMLButtonElement | null) => {
    if (node) buttonRefs.current.set(entryKey, node);
    else buttonRefs.current.delete(entryKey);
  }, []);

  const moveFocus = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, entry: CharacterRecord) => {
      const currentKey = getCharacterEntryKey(entry);
      const currentIndex = focusableEntryKeys.indexOf(currentKey);
      if (currentIndex === -1) return;

      let nextIndex: number | null = null;
      if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = focusableEntryKeys.length - 1;
      else if (event.key === 'ArrowLeft') nextIndex = Math.max(0, currentIndex - 1);
      else if (event.key === 'ArrowRight') {
        nextIndex = Math.min(focusableEntryKeys.length - 1, currentIndex + 1);
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const currentButton = buttonRefs.current.get(currentKey);
        const currentRect = currentButton?.getBoundingClientRect();
        if (currentRect && (currentRect.width > 0 || currentRect.height > 0)) {
          const direction = event.key === 'ArrowDown' ? 1 : -1;
          const currentCenterX = currentRect.left + currentRect.width / 2;
          const currentCenterY = currentRect.top + currentRect.height / 2;
          const candidate = focusableEntryKeys
            .map((key, index) => {
              const rect = buttonRefs.current.get(key)?.getBoundingClientRect();
              if (!rect || index === currentIndex) return null;
              const centerY = rect.top + rect.height / 2;
              const rowDistance = (centerY - currentCenterY) * direction;
              if (rowDistance <= 1) return null;
              return {
                index,
                rowDistance,
                columnDistance: Math.abs(rect.left + rect.width / 2 - currentCenterX),
              };
            })
            .filter((value): value is NonNullable<typeof value> => value !== null)
            .sort(
              (left, right) =>
                left.rowDistance - right.rowDistance ||
                left.columnDistance - right.columnDistance
            )[0];
          nextIndex = candidate?.index ?? currentIndex;
        } else {
          nextIndex = event.key === 'ArrowDown'
            ? Math.min(focusableEntryKeys.length - 1, currentIndex + 1)
            : Math.max(0, currentIndex - 1);
        }
      }

      if (nextIndex === null) return;
      event.preventDefault();
      const nextKey = focusableEntryKeys[nextIndex];
      if (!nextKey) return;
      setActiveEntryKey(nextKey);
      buttonRefs.current.get(nextKey)?.focus();
    },
    [focusableEntryKeys]
  );

  return (
    <>
      <p id={keyboardHintId} className="sr-only">
        {t('character.keyboardHint')}
      </p>
      <div
        role="group"
        aria-label={t('character.collection')}
        aria-describedby={keyboardHintId}
        className="flex flex-wrap gap-0.5 overflow-hidden py-1"
      >
        {visibleEntries.map((entry) => (
          <CharButton
            key={getCharacterEntryKey(entry)}
            entry={entry}
            feedbackStatus={
              copyFeedback?.target.entryKey === getCharacterEntryKey(entry)
                ? copyFeedback.status
                : null
            }
            onClick={(selectedEntry) => {
              setActiveEntryKey(getCharacterEntryKey(selectedEntry));
              onSelect(selectedEntry);
            }}
            onFocus={(focusedEntry) => setActiveEntryKey(getCharacterEntryKey(focusedEntry))}
            onKeyDown={moveFocus}
            buttonRef={(node) => registerButton(getCharacterEntryKey(entry), node)}
            tabIndex={getCharacterEntryKey(entry) === resolvedActiveEntryKey ? 0 : -1}
            tooltipHandle={tooltipHandle}
          />
        ))}
      </div>
      <Tooltip handle={tooltipHandle}>
        {({ payload }) => <TooltipPopup side="top">{payload}</TooltipPopup>}
      </Tooltip>
      {paged && visibleCount < entries.length && (
        <Button
          type="button"
          tone="neutral"
          size="sm"
          onClick={() => setVisibleCount((value) => value + PAGE_SIZE)}
          className="my-1"
        >
          {t('character.showMore', {
            count: Math.min(PAGE_SIZE, entries.length - visibleCount),
          })}
        </Button>
      )}
    </>
  );
}

function GroupSection({
  pack,
  group,
  defaultOpen,
  copyFeedback,
  onSelect,
}: {
  pack: CharacterPackId;
  group: CharacterGroup;
  defaultOpen: boolean;
  copyFeedback: CopyFeedback | null;
  onSelect: (entry: CharacterRecord) => void;
}) {
  const { t } = useUiI18n();
  const labelKey = CHARACTER_GROUP_LABEL_KEYS[pack][group.id];
  const label = labelKey ? t(labelKey) : group.label;

  return (
    <Collapsible defaultOpen={defaultOpen} className="group/character-group">
      <Surface
        data-slot="character-group-header"
        kind="embedded"
        className="sticky top-0 z-10"
      >
        <CollapsibleTrigger asChild>
          <SelectableItem type="button" muted className="w-full justify-start">
            <span className="truncate">{label}</span>
            <span className="ml-auto text-[10px] tabular-nums">{group.entries.length}</span>
            <ChevronRight className="shrink-0 transition-transform group-data-[state=open]/character-group:rotate-90" />
          </SelectableItem>
        </CollapsibleTrigger>
      </Surface>
      <CollapsibleContent className="px-1">
        <CharacterGrid entries={group.entries} copyFeedback={copyFeedback} onSelect={onSelect} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function EmptySearch() {
  const { t } = useUiI18n();
  return <p className="px-2 py-4 text-xs text-muted-foreground">{t('character.empty')}</p>;
}

function PackPane({
  pack,
  copyFeedback,
  onSelect,
}: {
  pack: CharacterPackId;
  copyFeedback: CopyFeedback | null;
  onSelect: (entry: CharacterRecord) => void;
}) {
  const { t } = useUiI18n();
  const groups = useLibraryStore((state) => state.packs[pack]);
  const status = useLibraryStore((state) => state.packStatus[pack]);
  const error = useLibraryStore((state) => state.packErrors[pack]);
  const query = useLibraryStore((state) => state.searchQueries[pack]);
  const results = useLibraryStore((state) => state.searchResults[pack]);
  const retryPack = useLibraryStore((state) => state.retryPack);

  if (query.trim()) {
    return (
      <div className="p-2 pb-10">
        <p className="px-1 pb-2 text-[11px] text-muted-foreground">
          {t('character.results', { count: results.length })}
        </p>
        {results.length ? (
          <CharacterGrid
            entries={results}
            copyFeedback={copyFeedback}
            onSelect={onSelect}
            paged={false}
          />
        ) : (
          <EmptySearch />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2 pb-10">
      {status === 'loading' && (
        <div className="flex items-center gap-2 px-2 py-3 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> {t('character.loading')}
        </div>
      )}
      {error && (
        <div className="flex flex-col gap-2 px-2 py-3 text-[11px] text-muted-foreground">
          <StatusText tone="error" asChild>
            <p className="break-words">{error}</p>
          </StatusText>
          <Button
            type="button"
            tone="neutral"
            size="sm"
            onClick={() => void retryPack(pack)}
            className="self-start"
          >
            <RefreshCcw /> {t('character.retry')}
          </Button>
        </div>
      )}
      {groups?.map((group, index) => (
        <GroupSection
          key={group.id}
          pack={pack}
          group={group}
          defaultOpen={index === 0}
          copyFeedback={copyFeedback}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function UnicodePane({
  copyFeedback,
  onSelect,
}: {
  copyFeedback: CopyFeedback | null;
  onSelect: (entry: CharacterRecord) => void;
}) {
  const { t } = useUiI18n();
  const {
    unicodeManifest,
    unicodeStatus,
    unicodeError,
    unicodeFacetType,
    unicodeFacetId,
    unicodeResults,
    unicodeOffset,
    unicodeHasMore,
    loadUnicodeManifest,
    loadUnicodePage,
  } = useLibraryStore();
  const [facetType, setFacetType] = useState<UnicodeFacetType>('block');

  useEffect(() => {
    void loadUnicodeManifest();
  }, [loadUnicodeManifest]);

  useEffect(() => {
    if (!unicodeManifest || unicodeFacetId) return;
    const first = unicodeManifest.facets[facetType][0];
    if (first) void loadUnicodePage(facetType, first.id);
  }, [facetType, loadUnicodePage, unicodeFacetId, unicodeManifest]);

  const selectFacetType = async (value: UnicodeFacetType) => {
    setFacetType(value);
    const first = unicodeManifest?.facets[value][0];
    if (first) await loadUnicodePage(value, first.id);
  };

  const selectedFacetId =
    unicodeFacetType === facetType && unicodeFacetId
      ? unicodeFacetId
      : unicodeManifest?.facets[facetType][0]?.id;

  return (
    <div className="flex flex-col gap-2 p-2 pb-10">
      {unicodeStatus === 'loading' && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> {t('character.loadingIndex')}
        </div>
      )}
      {unicodeError && (
        <StatusText tone="error" asChild>
          <p className="break-words text-[11px]">{unicodeError}</p>
        </StatusText>
      )}
      {unicodeManifest && (
        <Tabs
          value={facetType}
          onValueChange={(value) => {
            void selectFacetType(value as UnicodeFacetType);
          }}
          className="gap-2"
        >
          <TabsList className="w-full">
            {(['block', 'script', 'category'] as const).map((type) => (
              <TabsTrigger
                key={type}
                value={type}
                active={facetType === type}
                className="flex-1 px-1 text-[10px] capitalize"
              >
                {t(UNICODE_FACET_LABEL_KEYS[type])}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={facetType} className="flex flex-col gap-2">
            <Select
              value={selectedFacetId}
              onValueChange={(value) => void loadUnicodePage(facetType, value)}
            >
              <SelectTrigger
                aria-label={t('character.unicodeFacet')}
                size="sm"
                appearance="search"
                className="w-full text-[11px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                position="popper"
                align="start"
                className="max-h-72 w-[var(--radix-select-trigger-width)] border-0"
              >
                {unicodeManifest.facets[facetType].map((facet) => (
                  <SelectItem key={facet.id} value={facet.id}>
                    {facet.label} ({facet.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <CharacterGrid
              entries={unicodeResults}
              copyFeedback={copyFeedback}
              onSelect={onSelect}
              paged={false}
            />
            {unicodeHasMore && unicodeFacetId && (
              <Button
                type="button"
                tone="neutral"
                size="sm"
                onClick={() =>
                  void loadUnicodePage(unicodeFacetType, unicodeFacetId, unicodeOffset + PAGE_SIZE)
                }
              >
                {t('character.loadMore', { count: PAGE_SIZE })}
              </Button>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export function CharLibrary({ view }: { view: CharacterViewId }) {
  const { t } = useUiI18n();
  const brushColor = useCanvasState((state) => state.brushColor);
  const { feedback: copyFeedback, run: runCopyFeedback } =
    useInPlaceFeedback<CopyFeedbackTarget>();

  const handleSelect = async (entry: CharacterRecord) => {
    if (!entry.insertable) return;
    await runCopyFeedback(
      {
        entryKey: getCharacterEntryKey(entry),
        grapheme: entry.grapheme,
      },
      () =>
        writeClipboardPayload(
          {
            plain: entry.grapheme,
            rich: JSON.stringify({
              type: 'ascii-metropolis-zone',
              version: 1,
              cells: [{ x: 0, y: 0, char: entry.grapheme, color: brushColor }],
            }),
          },
          { withRich: true }
        )
    );
  };

  return (
    <div
      className="contents"
      style={{ '--character-library-foreground': brushColor } as CSSProperties}
    >
      {view === 'unicode' ? (
        <UnicodePane copyFeedback={copyFeedback} onSelect={handleSelect} />
      ) : (
        <PackPane pack={view} copyFeedback={copyFeedback} onSelect={handleSelect} />
      )}
      <span role="status" className="sr-only">
        {copyFeedback
          ? t(copyFeedback.status === 'success' ? 'character.copied' : 'character.copyFailed', {
              character: copyFeedback.target.grapheme,
            })
          : ''}
      </span>
    </div>
  );
}
