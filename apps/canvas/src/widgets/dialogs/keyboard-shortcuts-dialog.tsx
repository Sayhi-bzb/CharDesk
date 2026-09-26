'use client';

import { Plus, RotateCcw } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { formatShortcutLabel } from '@/domains/actions/public';
import {
  shortcutFromKeyInput,
  findShortcutConflicts,
  shortcutSequenceKey,
  shortcutsEqual,
  useEditor,
  useEditorKeymapSnapshot,
  type KeymapBindingSnapshot,
  type ShortcutConflict,
  type ShortcutSequence,
} from '@/domains/editor/public';
import { SHORTCUT_PRIORITY, useShortcutLayer } from '@/shared/shortcuts/dispatcher';
import { useUiI18n } from '@/shared/i18n';
import {
  Button,
  IconButton,
  Kbd,
  KbdGroup,
  Pressable,
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from '@chardesk/ui';




import {
  SHORTCUT_CATEGORY_ORDER,
  getShortcutCategory,
  getShortcutCategoryLabel,
  getShortcutCommandLabel,
  getShortcutScopeLabel,
  type ShortcutCategory,
} from './editor-shortcut-catalog';
import { ShortcutKbd } from './shortcut-kbd';
import {
  SettingsDataTable,
  type SettingsDataTableColumn,
  type SettingsDataTableGroup,
} from './settings-data-table';

type RecordingTarget = {
  entryId: string;
  index: number | null;
  sequence: ShortcutSequence;
};

type KeyboardShortcutsPanelProps = {
  revealEntryId?: string | null;
  onRevealComplete?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onRecordingChange?: (recording: boolean) => void;
  onResettableChange?: (resettable: boolean) => void;
};

export type KeyboardShortcutsPanelHandle = {
  save: () => void;
  discard: () => void;
  reset: () => void;
};

type ShortcutBindings = Record<string, readonly ShortcutSequence[]>;

type ShortcutDraft = {
  baseline: ShortcutBindings;
  bindings: ShortcutBindings;
};

type ShortcutGridColumnId = 'command' | 'scope' | 'shortcut' | 'actions';

type ShortcutCommandRow = {
  id: string;
  label: string;
  entry: KeymapBindingSnapshot;
};

const arraysEqual = (left: readonly ShortcutSequence[], right: readonly ShortcutSequence[]) =>
  left.length === right.length && left.every((value, index) => shortcutsEqual(value, right[index]));

const getOverrideValue = (entry: KeymapBindingSnapshot, shortcuts: readonly ShortcutSequence[]) =>
  arraysEqual(entry.defaultShortcuts, shortcuts) ? null : shortcuts;

const createShortcutBindings = (entries: readonly KeymapBindingSnapshot[]): ShortcutBindings =>
  Object.fromEntries(
    entries
      .filter((entry) => entry.configurable)
      .map((entry) => [entry.id, entry.shortcuts.map((sequence) => [...sequence])])
  );

const bindingsEqual = (left: ShortcutBindings, right: ShortcutBindings) => {
  const ids = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...ids].every((id) => arraysEqual(left[id] ?? [], right[id] ?? []));
};

export const KeyboardShortcutsPanel = forwardRef<
  KeyboardShortcutsPanelHandle,
  KeyboardShortcutsPanelProps
>(function KeyboardShortcutsPanel(
  { revealEntryId, onRevealComplete, onDirtyChange, onRecordingChange, onResettableChange },
  ref
) {
  const { t } = useUiI18n();
  const editor = useEditor();
  const snapshot = useEditorKeymapSnapshot();
  const [draft, setDraft] = useState<ShortcutDraft>(() => {
    const bindings = createShortcutBindings(snapshot.entries);
    return { baseline: bindings, bindings };
  });
  const [recording, setRecording] = useState<RecordingTarget | null>(null);
  const recordingRef = useRef<RecordingTarget | null>(null);

  const entriesById = useMemo(
    () =>
      new Map(
        snapshot.entries.map((entry) => {
          const shortcuts = draft.bindings[entry.id] ?? entry.shortcuts;
          return [
            entry.id,
            {
              ...entry,
              shortcuts,
              userDefined: !arraysEqual(entry.defaultShortcuts, shortcuts),
            },
          ];
        })
      ),
    [draft.bindings, snapshot.entries]
  );
  const editableEntries = useMemo(
    () => [...entriesById.values()].filter((entry) => entry.configurable),
    [entriesById]
  );
  const dirty = useMemo(
    () => !bindingsEqual(draft.baseline, draft.bindings),
    [draft.baseline, draft.bindings]
  );
  const resettable = useMemo(
    () => editableEntries.some((entry) => !arraysEqual(entry.shortcuts, entry.defaultShortcuts)),
    [editableEntries]
  );
  const conflictsByBinding = useMemo(() => {
    const entries = [...entriesById.values()];
    const byKey = new Map<string, readonly ShortcutConflict[]>();
    for (const entry of entries) {
      for (const shortcut of entry.shortcuts) {
        const conflicts = findShortcutConflicts(entries, entry.id, shortcut);
        if (conflicts.length > 0) {
          byKey.set(`${entry.id}:${shortcutSequenceKey(shortcut)}`, conflicts);
        }
      }
    }
    return byKey;
  }, [entriesById]);

  const commitBindings = useCallback(
    (entry: KeymapBindingSnapshot, shortcuts: readonly ShortcutSequence[]) => {
      setDraft((current) => ({
        ...current,
        bindings: { ...current.bindings, [entry.id]: shortcuts },
      }));
    },
    []
  );

  const saveDraft = useCallback(() => {
    editor.keymap.updateUserBindings(
      Object.fromEntries(
        editableEntries.map((entry) => [
          entry.id,
          getOverrideValue(entry, draft.bindings[entry.id] ?? entry.shortcuts),
        ])
      )
    );
    setDraft((current) => ({ baseline: current.bindings, bindings: current.bindings }));
  }, [draft.bindings, editableEntries, editor]);

  const discardDraft = useCallback(() => {
    setDraft((current) => ({ ...current, bindings: current.baseline }));
  }, []);

  const resetDraft = useCallback(() => {
    setDraft((current) => ({
      ...current,
      bindings: Object.fromEntries(
        editableEntries.map((entry) => [
          entry.id,
          entry.defaultShortcuts.map((sequence) => [...sequence]),
        ])
      ),
    }));
  }, [editableEntries]);

  useImperativeHandle(ref, () => ({ save: saveDraft, discard: discardDraft, reset: resetDraft }), [
    discardDraft,
    resetDraft,
    saveDraft,
  ]);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => onRecordingChange?.(recording !== null), [onRecordingChange, recording]);
  useEffect(() => onResettableChange?.(resettable), [onResettableChange, resettable]);

  useEffect(
    () => () => {
      onDirtyChange?.(false);
      onRecordingChange?.(false);
      onResettableChange?.(false);
    },
    [onDirtyChange, onRecordingChange, onResettableChange]
  );

  const stopRecording = useCallback(() => {
    recordingRef.current = null;
    setRecording(null);
  }, []);

  const beginRecording = (entryId: string, index: number | null) => {
    const next = { entryId, index, sequence: [] };
    recordingRef.current = next;
    setRecording(next);
  };

  const finishRecording = useCallback(
    (entry: KeymapBindingSnapshot, index: number | null, shortcut: ShortcutSequence) => {
      const next = [...entry.shortcuts];
      if (index === null) next.push(shortcut);
      else next[index] = shortcut;
      const shortcuts = [
        ...new Map(next.map((sequence) => [shortcutSequenceKey(sequence), sequence])).values(),
      ];
      stopRecording();
      commitBindings(entry, shortcuts);
    },
    [commitBindings, stopRecording]
  );

  const finishPendingRecording = useCallback(() => {
    const current = recordingRef.current;
    if (!current) return;
    const entry = entriesById.get(current.entryId);
    if (!entry || current.sequence.length === 0) {
      stopRecording();
      return;
    }
    finishRecording(entry, current.index, current.sequence);
  }, [entriesById, finishRecording, stopRecording]);

  useEffect(() => {
    if (!recording) return;

    const finishOutsideControl = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const activeControl = document.querySelector(
        '[data-shortcut-recording-control][data-recording="true"]'
      );
      if (!activeControl?.contains(target)) finishPendingRecording();
    };

    document.addEventListener('pointerdown', finishOutsideControl, true);
    window.addEventListener('blur', stopRecording);
    return () => {
      document.removeEventListener('pointerdown', finishOutsideControl, true);
      window.removeEventListener('blur', stopRecording);
    };
  }, [finishPendingRecording, recording, stopRecording]);

  useShortcutLayer({
    id: 'shortcut-recorder',
    priority: SHORTCUT_PRIORITY.observer + 1,
    enabled: recording !== null,
    onKeyDown: (input) => {
      if (!recording) return undefined;
      if (
        input.key === 'Tab'
        && !input.modifiers.alt
        && !input.modifiers.ctrl
        && !input.modifiers.meta
      ) {
        finishPendingRecording();
        return undefined;
      }
      if (input.key === 'Escape') {
        stopRecording();
        return { claimed: true, preventDefault: true, stopImmediatePropagation: true };
      }
      if (input.key === 'Enter') {
        finishPendingRecording();
        return { claimed: true, preventDefault: true, stopImmediatePropagation: true };
      }
      const stroke = shortcutFromKeyInput(input);
      if (stroke && recording.sequence.length < 2) {
        const current = recordingRef.current;
        if (current) {
          const next = { ...current, sequence: [...current.sequence, stroke] };
          recordingRef.current = next;
          setRecording(next);
        }
      }
      return { claimed: true, preventDefault: true, stopImmediatePropagation: true };
    },
  });

  const getCommandLabel = (entryId: string) => {
    const entry = entriesById.get(entryId);
    return entry ? getShortcutCommandLabel(entry, t) : entryId;
  };

  const getConflictDescription = (conflicts: readonly ShortcutConflict[]) =>
    t(
      conflicts.some((conflict) => conflict.kind === 'prefix')
        ? 'shortcutEditor.conflict.prefixDescription'
        : 'shortcutEditor.conflict.description',
      {
        commands: [...new Set(conflicts.map((conflict) => conflict.conflictingEntryId))]
          .map(getCommandLabel)
          .join(', '),
      }
    );

  const shortcutGroups = useMemo<SettingsDataTableGroup<ShortcutCommandRow>[]>(() => {
    const grouped = new Map<ShortcutCategory, ShortcutCommandRow[]>(
      SHORTCUT_CATEGORY_ORDER.map((category) => [category, []])
    );
    for (const entry of editableEntries) {
      const category = getShortcutCategory(entry.category);
      grouped.get(category)?.push({
        id: entry.id,
        label: getShortcutCommandLabel(entry, t),
        entry,
      });
    }

    return SHORTCUT_CATEGORY_ORDER.flatMap((category) => {
      const children = grouped.get(category) ?? [];
      return children.length > 0
        ? [
            {
              id: category.toLowerCase(),
              label: getShortcutCategoryLabel(category, t),
              items: children,
            },
          ]
        : [];
    });
  }, [editableEntries, t]);

  const shortcutGridColumns = useMemo<SettingsDataTableColumn<ShortcutGridColumnId>[]>(
    () => [
      {
        id: 'command',
        header: t('shortcutEditor.column.command'),
        widthClassName: 'w-[30%]',
        cellClassName: 'truncate ps-8 text-muted-foreground',
      },
      {
        id: 'scope',
        header: t('shortcutEditor.column.scope'),
        widthClassName: 'w-[15%]',
        cellClassName: 'truncate text-muted-foreground',
      },
      { id: 'shortcut', header: t('shortcutEditor.column.shortcut') },
      {
        id: 'actions',
        header: t('shortcutEditor.column.actions'),
        widthClassName: 'w-10',
        headerClassName: 'px-1 text-right',
        cellClassName: 'p-1 text-right',
        visuallyHiddenHeader: true,
      },
    ],
    [t]
  );

  const revealShortcut = useCallback((row: HTMLTableRowElement) => {
    if (typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    row
      .querySelector<HTMLElement>('[data-shortcut-recording-control]')
      ?.focus({ preventScroll: true });
  }, []);

  const renderRecordingState = (sequence: ShortcutSequence) =>
    sequence.length > 0 ? (
      <span className="flex items-center gap-1">
        <ShortcutKbd shortcut={sequence} />
        <span aria-hidden="true">…</span>
      </span>
    ) : (
      <KbdGroup aria-label={t('shortcutEditor.recording')}>
        <Kbd>{t('shortcutEditor.recording')}</Kbd>
      </KbdGroup>
    );

  const renderAddShortcutControl = (entry: KeymapBindingSnapshot, commandLabel: string) => {
    const isRecording = recording?.entryId === entry.id && recording.index === null;
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              data-shortcut-recording-control=""
              data-recording={isRecording}
              tone="neutral"
              size="xs"
              shape={isRecording ? 'auto' : 'square'}
              className="ml-auto shrink-0"
              pressed={isRecording}
              aria-label={t('shortcutEditor.setFor', { command: commandLabel })}
              onClick={() => {
                if (isRecording) stopRecording();
                else beginRecording(entry.id, null);
              }}
              onBlur={() => {
                if (isRecording) finishPendingRecording();
              }}
            />
          }
        >
          {isRecording ? (
            renderRecordingState(recording.sequence)
          ) : (
            <Plus data-icon="inline-start" />
          )}
        </TooltipTrigger>
        <TooltipPopup side="top">
          {isRecording ? t('shortcutEditor.recordingDescription') : t('shortcutEditor.set')}
        </TooltipPopup>
      </Tooltip>
    );
  };

  const renderShortcutCell = (entry: KeymapBindingSnapshot, commandLabel: string) => (
    <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden whitespace-nowrap">
      {entry.shortcuts.map((shortcut, index) => {
        const isRecording = recording?.entryId === entry.id && recording.index === index;
        const shortcutLabel = formatShortcutLabel(shortcut);
        const conflicts = conflictsByBinding.get(`${entry.id}:${shortcutSequenceKey(shortcut)}`);
        const conflictDescription = conflicts ? getConflictDescription(conflicts) : null;
        const control = (
          <Pressable
            type="button"
            data-slot="shortcut-binding"
            data-shortcut-recording-control=""
            data-recording={isRecording}
            className="shrink-0"
            aria-invalid={conflicts ? true : undefined}
            aria-label={[
              t('shortcutEditor.edit', {
                command: commandLabel,
                shortcut: shortcutLabel,
              }),
              conflictDescription,
            ]
              .filter(Boolean)
              .join('. ')}
            aria-pressed={isRecording}
            onClick={() => {
              if (isRecording) stopRecording();
              else beginRecording(entry.id, index);
            }}
            onBlur={() => {
              if (isRecording) finishPendingRecording();
            }}
          >
            {isRecording ? (
              renderRecordingState(recording.sequence)
            ) : (
              <ShortcutKbd shortcut={shortcut} invalid={Boolean(conflicts)} />
            )}
          </Pressable>
        );
        return (
          <span key={`${shortcut}-${index}`} className="contents">
            {index > 0 ? (
              <span aria-hidden="true" className="text-muted-foreground">
                /
              </span>
            ) : null}
            {conflictDescription ? (
              <Tooltip>
                <TooltipTrigger render={control} />
                <TooltipPopup side="top">{conflictDescription}</TooltipPopup>
              </Tooltip>
            ) : (
              control
            )}
          </span>
        );
      })}
      {renderAddShortcutControl(entry, commandLabel)}
    </div>
  );

  return (
    <SettingsDataTable
      columns={shortcutGridColumns}
      groups={shortcutGroups}
      getItemId={(item) => item.id}
      getGroupToggleLabel={(group, expanded) =>
        t(
          expanded ? 'shortcutEditor.category.collapse' : 'shortcutEditor.category.expand',
          { category: group.label }
        )
      }
      renderGroupSummary={(group) =>
        t('shortcutEditor.category.commandCount', { count: group.items.length })
      }
      revealItemId={revealEntryId}
      onRevealItem={revealShortcut}
      onRevealComplete={onRevealComplete}
      dataSlot="shortcut-grid"
      bodyDataSlot="shortcut-list"
      groupRowDataSlot="shortcut-category-row"
      getItemRowData={(item) => ({
        'data-slot': 'shortcut-row',
        'data-shortcut-entry-id': item.entry.id,
      })}
      renderItemCell={({ entry, label }, columnId) => {
        if (columnId === 'command') return label;
        if (columnId === 'scope') return getShortcutScopeLabel(entry.scope, t);
        if (columnId === 'shortcut') return renderShortcutCell(entry, label);
        return (
          <>
            {entry.userDefined ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <IconButton
                      type="button"
                      size="xs"
                      aria-label={t('shortcutEditor.reset', { command: label })}
                      onClick={() => commitBindings(entry, entry.defaultShortcuts)}
                    />
                  }
                >
                  <RotateCcw />
                </TooltipTrigger>
                <TooltipPopup side="left">
                  {t('shortcutEditor.reset', { command: label })}
                </TooltipPopup>
              </Tooltip>
            ) : null}
          </>
        );
      }}
    />
  );
});
