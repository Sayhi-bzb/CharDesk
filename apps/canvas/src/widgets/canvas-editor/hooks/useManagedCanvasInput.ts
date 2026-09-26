import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent as ReactClipboardEvent,
  type CompositionEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { keyInputFromKeyboardEvent } from "@chardesk/keyboard/browser";
import {
  DEFAULT_CANVAS_CELL_METRICS,
} from "@/shared/fonts/canvas-profile";
import { getCellViewportRect as gridCellRect } from "@chardesk/rendering";
import {
  getStaticGridViewState,
  getGridSelectionRanges,
  getStaticGridSelection,
} from "@/domains/selection/public";
import { classifyShortcutTarget } from "@/shared/utils/dom-focus";
import { shouldIgnoreCanvasSurfaceGesture } from "./interaction/core/gestureGuards";
import { isActionAccepted } from "@/domains/actions/public";
import {
  resolveEditorKeymapInput,
  useEditor,
} from "@/domains/editor/public";
import type { ActionResult } from "@/domains/actions/public";
import type { CanvasEditorModel } from "./canvasModels";
import {
  SHORTCUT_PRIORITY,
  useShortcutLayer,
} from "@/shared/shortcuts/dispatcher";
import {
  createClipboardShortcutCoordinator,
  type ClipboardShortcutAction,
  type ClipboardShortcutTrace,
} from "./clipboardShortcutCoordinator";
import {
  shouldSuppressFinalizedCompositionInput,
  type FinalizedManagedComposition,
} from "./managedTextInputSession";
import {
  modifiedArrowEdgeFor,
  resolveManagedCanvasKeyIntent,
  type ManagedCanvasKeyIntent,
} from "./managedCanvasKeyboard";
import {
  ManagedInputBatchScheduler,
  resolveManagedInputBatchLimit,
  resolveManagedInputCommitCadence,
  type ManagedInputBatchCommitSample,
} from './ManagedInputBatchScheduler';

const MANAGED_TEXTAREA_SENTINEL = "\u00a0";
const CLIPBOARD_DEBUG_STORAGE_KEY = "chardesk.clipboardDebug";

type ManagedActionSource =
  | 'canvas-keydown'
  | 'clipboard-event'
  | 'context-menu';

type RunManagedAction = (
  actionId: ClipboardShortcutAction,
  event?: ClipboardEvent,
  source?: ManagedActionSource
) => ActionResult;

const traceClipboardShortcut = (
  trace: ClipboardShortcutTrace,
  canvasOwnsInputFocus: boolean,
  editor: ReturnType<typeof useEditor>
) => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  try {
    const enabled =
      window.localStorage.getItem(CLIPBOARD_DEBUG_STORAGE_KEY) === '1';
    if (!enabled) return;
  } catch {
    return;
  }
  console.debug('[CharDesk clipboard]', {
    ...trace,
    activeElement: document.activeElement?.tagName ?? null,
    canvasOwnsInputFocus,
    interaction: editor.getInteractionState().type,
    selectionMode: getStaticGridSelection(
      editor.getState().interaction.staticGrid
    ).mode,
    selectionRangeCount: getGridSelectionRanges(
      getStaticGridSelection(editor.getState().interaction.staticGrid)
    ).length,
  });
};

const traceClipboardAction = (
  actionId: ClipboardShortcutAction,
  result: ActionResult,
  canvasOwnsInputFocus: boolean,
  editor: ReturnType<typeof useEditor>
) => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(CLIPBOARD_DEBUG_STORAGE_KEY) !== '1') return;
  } catch {
    return;
  }
  console.debug('[CharDesk clipboard action]', {
    actionId,
    status: result.status,
    reason: 'reason' in result ? result.reason : undefined,
    activeElement: document.activeElement?.tagName ?? null,
    canvasOwnsInputFocus,
    interaction: editor.getInteractionState().type,
    selectionMode: getStaticGridSelection(
      editor.getState().interaction.staticGrid
    ).mode,
  });
};

type UseManagedCanvasInputOptions = {
  inputIdentity?: string;
  model: CanvasEditorModel;
  size: { width: number; height: number } | undefined;
  onUndo?: () => void;
  onRedo?: () => void;
  copyEnabled?: boolean;
  mutateEnabled?: boolean;
  active?: boolean;
  onManagedInputBatch?: (sample: ManagedInputBatchCommitSample) => void;
};

export const useManagedCanvasInput = ({
  inputIdentity,
  model,
  size,
  onUndo,
  onRedo,
  copyEnabled = true,
  mutateEnabled = true,
  active = true,
  onManagedInputBatch,
}: UseManagedCanvasInputOptions) => {
  const editor = useEditor();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposing = useRef(false);
  const finalizedCompositionRef = useRef<FinalizedManagedComposition | null>(null);
  const {
    writeTextString,
    deleteStaticGrid,
    newlineText,
    indentText,
    moveTextCursor,
    moveStaticGridFocus,
    moveStaticGridFocusToEdge,
    moveStaticGridFocusToContentBoundary,
    selectStaticGridAll,
    selectStaticGridRow,
    selectStaticGridColumn,
    enterStaticGridTextEdit,
    exitStaticGridTextEdit,
    offset,
    zoom,
    fillSelectionsWithChar,
    clearSelections,
    setCanvasColorPickerTarget,
    setHoveredGrid,
  } = model;
  const { staticGrid, canvasColorPickerTarget } = model.interaction;
  const [managedInputScheduler] = useState(() => new ManagedInputBatchScheduler({
    now: () => performance.now(),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (handle) => cancelAnimationFrame(handle),
    setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimer: (handle) => window.clearTimeout(handle),
    commit: () => undefined,
  }, resolveManagedInputCommitCadence(
    typeof window === 'undefined' ? '' : window.location.search
  ), resolveManagedInputBatchLimit(
    typeof window === 'undefined' ? '' : window.location.search
  )));
  useLayoutEffect(() => {
    managedInputScheduler.setCommitHandler((value, sample) => {
      if (!mutateEnabled || !value) return;
      const startedAt = performance.now();
      writeTextString(value);
      onManagedInputBatch?.({
        ...sample,
        commitDurationMs: performance.now() - startedAt,
      });
    });
    return () => managedInputScheduler.setCommitHandler(() => undefined);
  }, [managedInputScheduler, mutateEnabled, onManagedInputBatch, writeTextString]);
  const flushPendingManagedText = useCallback(
    () => managedInputScheduler.flush(),
    [managedInputScheduler]
  );
  const discardPendingManagedText = useCallback(
    () => managedInputScheduler.discard(),
    [managedInputScheduler]
  );
  const enqueueManagedText = useCallback((value: string) => {
    if (!mutateEnabled || !value) return;
    managedInputScheduler.enqueue(value);
  }, [managedInputScheduler, mutateEnabled]);
  useLayoutEffect(
    () => () => discardPendingManagedText(),
    [discardPendingManagedText, inputIdentity]
  );
  const staticGridView = useMemo(
    () =>
      getStaticGridViewState({
        state: staticGrid,
        grid: model.contentReader,
      }),
    [model.contentReader, staticGrid]
  );
  const staticGridInteraction = staticGridView.interaction;
  const activeTextCursor = staticGridInteraction.kind === "text-edit"
    ? staticGridInteraction.cursor
    : null;
  const activeSelections = staticGridView.target.areas;
  const staticGridActiveCell = staticGridInteraction.activeCell;
  const hasActiveSelection = activeSelections.length > 0;
  const [canvasOwnsInputFocus, setCanvasOwnsInputFocus] = useState(false);
  const canvasOwnsInputFocusRef = useRef(false);
  const windowHasFocusRef = useRef(true);
  const managedTextareaPoint =
    activeTextCursor ??
    activeSelections[0]?.start ??
    staticGridActiveCell ??
    null;
  const primeManagedTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || !canvasOwnsInputFocusRef.current || isComposing.current) {
      return;
    }
    textarea.value = MANAGED_TEXTAREA_SENTINEL;
    textarea.setSelectionRange(0, MANAGED_TEXTAREA_SENTINEL.length);
  }, []);
  const focusManagedTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    canvasOwnsInputFocusRef.current = true;
    setCanvasOwnsInputFocus(true);
    if (document.activeElement !== textarea) {
      textarea.focus({ preventScroll: true });
    }
    // Safari does not consistently dispatch cut/copy for an empty editable
    // target. Keep a selected sentinel so the native clipboard event fires.
    primeManagedTextarea();
  }, [primeManagedTextarea]);
  const restoreManagedInputFocus = useCallback(() => {
    if (!canvasOwnsInputFocusRef.current) return;
    textareaRef.current?.focus({ preventScroll: true });
    primeManagedTextarea();
  }, [primeManagedTextarea]);
  const releaseManagedTextarea = useCallback(() => {
    canvasOwnsInputFocusRef.current = false;
    setCanvasOwnsInputFocus(false);
  }, []);
  const reconcileManagedTextareaBlur = useCallback(() => {
    const textarea = textareaRef.current;
    if (
      !textarea ||
      !canvasOwnsInputFocusRef.current ||
      !windowHasFocusRef.current
    ) return;
    const activeElement = document.activeElement;
    if (activeElement === textarea) return;

    const surface = textarea.closest('[data-testid="canvas-editor-surface"]');
    const targetKind = classifyShortcutTarget(activeElement);
    const isNeutralDocumentFocus =
      activeElement === document.body || activeElement === document.documentElement;
    const isSameCanvasSurface =
      !!surface &&
      activeElement instanceof Node &&
      surface.contains(activeElement) &&
      targetKind === 'canvas-surface';

    if (isNeutralDocumentFocus || isSameCanvasSurface) {
      focusManagedTextarea();
      return;
    }
    releaseManagedTextarea();
  }, [focusManagedTextarea, releaseManagedTextarea]);
  const handleCanvasPointerDown = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    flushPendingManagedText();
    if (shouldIgnoreCanvasSurfaceGesture(event.nativeEvent)) {
      releaseManagedTextarea();
      return;
    }
    event.preventDefault();
    focusManagedTextarea();
  };
  useLayoutEffect(() => {
    if (!canvasOwnsInputFocus) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (document.activeElement !== textarea) {
      textarea.focus({ preventScroll: true });
    }
    primeManagedTextarea();
  }, [canvasOwnsInputFocus, managedTextareaPoint, primeManagedTextarea]);

  useEffect(() => {
    const handleDocumentPointerDown = (event: globalThis.PointerEvent) => {
      const textarea = textareaRef.current;
      const surface = textarea?.closest('[data-testid="canvas-editor-surface"]');
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (surface?.contains(target) && !shouldIgnoreCanvasSurfaceGesture(event)) {
        return;
      }
      flushPendingManagedText();
      releaseManagedTextarea();
    };
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    };
  }, [flushPendingManagedText, releaseManagedTextarea]);

  useEffect(() => {
    if (active) return;
    flushPendingManagedText();
    let canceled = false;
    queueMicrotask(() => {
      if (!canceled) releaseManagedTextarea();
    });
    return () => {
      canceled = true;
    };
  }, [active, flushPendingManagedText, releaseManagedTextarea]);

  useEffect(() => {
    const suspendOnWindowBlur = () => {
      flushPendingManagedText();
      windowHasFocusRef.current = false;
    };
    const restoreOnWindowFocus = () => {
      windowHasFocusRef.current = true;
      reconcileManagedTextareaBlur();
    };
    const flushWhenHidden = () => {
      if (document.hidden) flushPendingManagedText();
    };
    window.addEventListener('blur', suspendOnWindowBlur);
    window.addEventListener('focus', restoreOnWindowFocus);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.removeEventListener('blur', suspendOnWindowBlur);
      window.removeEventListener('focus', restoreOnWindowFocus);
      document.removeEventListener('visibilitychange', flushWhenHidden);
    };
  }, [flushPendingManagedText, reconcileManagedTextareaBlur]);

  const runManagedAction: RunManagedAction = useCallback(
    (
      actionId,
      e?: ClipboardEvent,
      source: ManagedActionSource = e ? 'clipboard-event' : 'context-menu'
    ) => {
      const result = editor.commands.execute(actionId, {
        source,
        clipboardEvent: e,
        managedTextarea: textareaRef.current,
      }, source);
      traceClipboardAction(
        actionId,
        result,
        canvasOwnsInputFocusRef.current,
        editor
      );
      return result;
    },
    [editor]
  );
  const [clipboardShortcutCoordinator] = useState(() =>
    createClipboardShortcutCoordinator({})
  );

  useEffect(() => {
    clipboardShortcutCoordinator.setFallbackHandler((actionId) => {
      runManagedAction(actionId, undefined, 'canvas-keydown');
    });
    clipboardShortcutCoordinator.setTraceHandler((trace) => {
      traceClipboardShortcut(trace, canvasOwnsInputFocusRef.current, editor);
    });
    return () => {
      clipboardShortcutCoordinator.dispose();
    };
  }, [clipboardShortcutCoordinator, editor, runManagedAction]);

  useShortcutLayer({
    id: "managed-canvas-commands",
    priority: SHORTCUT_PRIORITY.managedCanvas,
    enabled: (copyEnabled || mutateEnabled) && canvasOwnsInputFocus,
    onKeyDown: (input, context) => {
      if (
        !canvasOwnsInputFocusRef.current ||
        (context.targetKind !== 'managed-canvas' &&
          context.targetKind !== 'canvas-surface' &&
          context.targetKind !== 'document')
      ) {
        return;
      }
      const contentNavigationEdge = modifiedArrowEdgeFor(input);
      if (contentNavigationEdge) {
        flushPendingManagedText();
        moveStaticGridFocusToContentBoundary(contentNavigationEdge, {
          extend: input.modifiers.shift,
        });
        return {
          claimed: true,
          preventDefault: true,
          stopImmediatePropagation: true,
        };
      }
      const resolution = resolveEditorKeymapInput(
        editor,
        input,
        context.targetKind === 'document'
          ? 'managed-canvas'
          : context.targetKind
      );
      const commandId =
        resolution.type === "match" && resolution.entry.target.type === "command"
          ? resolution.entry.target.id
          : null;
      const clipboardCommand =
        commandId === "copy" || commandId === "cut" || commandId === "paste"
          ? commandId
          : null;
      if (clipboardCommand) {
        if (clipboardCommand === "copy" ? !copyEnabled : !mutateEnabled) return;
        flushPendingManagedText();
        primeManagedTextarea();
        clipboardShortcutCoordinator.begin(clipboardCommand);
        return { claimed: true, preventDefault: false };
      }
      const historyCommand = commandId === "undo" || commandId === "redo" ? commandId : null;
      if (!historyCommand) return;
      if (!mutateEnabled) return;
      flushPendingManagedText();
      const result = editor.commands.execute(historyCommand, {
        source: "canvas-keydown",
        managedTextarea: textareaRef.current,
        onUndo,
        onRedo,
      }, "canvas-keydown");
      return result.status === "succeeded"
        ? { claimed: true, preventDefault: true }
        : undefined;
    },
  });

  const handleCopy = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    flushPendingManagedText();
    if (!copyEnabled) {
      e.preventDefault();
      return;
    }
    if (clipboardShortcutCoordinator.handleNative('copy') === 'suppress') {
      e.preventDefault();
      return;
    }
    const result = runManagedAction('copy', e.nativeEvent);
    if (isActionAccepted(result)) e.preventDefault();
  };
  const handleCut = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    flushPendingManagedText();
    if (!mutateEnabled) {
      e.preventDefault();
      return;
    }
    if (clipboardShortcutCoordinator.handleNative('cut') === 'suppress') {
      e.preventDefault();
      return;
    }
    const result = runManagedAction('cut', e.nativeEvent);
    if (isActionAccepted(result) || document.activeElement === textareaRef.current) {
      e.preventDefault();
    }
  };
  const handlePaste = (e: ReactClipboardEvent<HTMLTextAreaElement>) => {
    flushPendingManagedText();
    if (!mutateEnabled) {
      e.preventDefault();
      return;
    }
    if (clipboardShortcutCoordinator.handleNative('paste') === 'suppress') {
      e.preventDefault();
      return;
    }
    const result = runManagedAction('paste', e.nativeEvent);
    if (isActionAccepted(result) || document.activeElement === textareaRef.current) {
      e.preventDefault();
    }
  };
  useShortcutLayer({
    id: "canvas-color-picker",
    priority: SHORTCUT_PRIORITY.dynamicCanvasCommand,
    enabled: !!canvasColorPickerTarget,
    onKeyDown: (input, context) => {
      if (
        input.key !== "Escape" ||
        context.targetKind === "editable" ||
        context.targetKind === "overlay"
      ) {
        return;
      }
      setCanvasColorPickerTarget(null);
      setHoveredGrid(null);
      return { claimed: true, preventDefault: true };
    },
  });

  const textareaStyle: CSSProperties = useMemo(() => {
    const point = managedTextareaPoint ?? { x: 0, y: 0 };
    const pos = size
      ? gridCellRect(point, { offset, zoom }, DEFAULT_CANVAS_CELL_METRICS)
      : { x: 0, y: 0 };
    const bounds = size ?? { width: 1, height: 1 };

    return {
      position: 'absolute',
      left: `${Math.max(0, Math.min(bounds.width - 1, pos.x))}px`,
      top: `${Math.max(0, Math.min(bounds.height - 1, pos.y))}px`,
      width: '1px',
      height: '1px',
      opacity: 0.01,
      color: 'transparent',
      caretColor: 'transparent',
      background: 'transparent',
      border: 0,
      padding: 0,
      resize: 'none',
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: 1,
    };
  }, [
    managedTextareaPoint,
    offset,
    zoom,
    size,
  ]);


  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isComposing.current) finalizedCompositionRef.current = null;
    if (e.defaultPrevented) return;
    if (isComposing.current) return;
    const input = keyInputFromKeyboardEvent(e.nativeEvent);
    const pageRows = Math.max(
      1,
      Math.floor(
        (size?.height ?? DEFAULT_CANVAS_CELL_METRICS.cellHeight) /
          (DEFAULT_CANVAS_CELL_METRICS.cellHeight * zoom)
      ) - 1
    );
    const decision = resolveManagedCanvasKeyIntent(input, {
      mutateEnabled,
      staticGridInteraction: staticGridInteraction.kind,
      hasActiveSelection,
      colorPickerOpen: !!canvasColorPickerTarget,
      pageRows,
    });
    if (decision.flushPendingText) flushPendingManagedText();
    if (decision.preventDefault) e.preventDefault();
    if (decision.intent) executeManagedCanvasKeyIntent(decision.intent);
  };

  function executeManagedCanvasKeyIntent(intent: ManagedCanvasKeyIntent) {
    switch (intent.type) {
      case "delete-grid":
        deleteStaticGrid(intent.direction);
        return;
      case "select-grid-all":
        selectStaticGridAll();
        return;
      case "select-grid-row":
        selectStaticGridRow();
        return;
      case "select-grid-column":
        selectStaticGridColumn();
        return;
      case "enter-grid-text-edit":
        enterStaticGridTextEdit(staticGridActiveCell ?? undefined);
        return;
      case "move-grid-edge":
        moveStaticGridFocusToEdge(intent.edge, { extend: intent.extend });
        return;
      case "move-grid-page":
        moveStaticGridFocus(0, intent.rows, { extend: intent.extend });
        return;
      case "move-grid-focus":
        moveStaticGridFocus(intent.dx, intent.dy, { extend: intent.extend });
        return;
      case "newline-text":
        newlineText();
        return;
      case "indent-text":
        indentText();
        return;
      case "move-text-cursor":
        moveTextCursor(intent.dx, intent.dy);
        return;
      case "fill-selection":
        fillSelectionsWithChar(intent.char);
        return;
      case "escape":
        if (intent.target === "color-picker") {
          setCanvasColorPickerTarget(null);
          setHoveredGrid(null);
        } else if (intent.target === "grid-text-edit") {
          exitStaticGridTextEdit();
        } else if (intent.target === "selection") {
          clearSelections();
        }
    }
  }

  const readManagedText = (value: string) =>
    value.replaceAll(MANAGED_TEXTAREA_SENTINEL, "");

  return {
    textareaRef,
    focusManagedTextarea,
    restoreManagedInputFocus,
    canvasOwnsInputFocus,
    onCanvasPointerDown: handleCanvasPointerDown,
    textareaStyle: textareaStyle as CSSProperties,
    textareaProps: {
      onCompositionStart: () => {
        flushPendingManagedText();
        isComposing.current = true;
        finalizedCompositionRef.current = null;
      },
      onCompositionEnd: (event: CompositionEvent<HTMLTextAreaElement>) => {
        isComposing.current = false;
        const value = event.data || readManagedText(event.currentTarget.value);
        managedInputScheduler.commitImmediate(value);
        finalizedCompositionRef.current = { value };
        primeManagedTextarea();
      },
      onInput: (event: FormEvent<HTMLTextAreaElement>) => {
        const nativeEvent = event.nativeEvent as InputEvent | undefined;
        const value = nativeEvent?.data ?? readManagedText(event.currentTarget.value);
        if (shouldSuppressFinalizedCompositionInput(
          finalizedCompositionRef.current,
          value,
          nativeEvent?.inputType
        )) {
          finalizedCompositionRef.current = null;
          primeManagedTextarea();
          return;
        }
        finalizedCompositionRef.current = null;
        if (nativeEvent?.isComposing) {
          isComposing.current = true;
          return;
        }
        if (!isComposing.current) {
          enqueueManagedText(value);
          primeManagedTextarea();
        }
      },
      onKeyDown: handleKeyDown,
      onCopy: handleCopy,
      onCut: handleCut,
      onPaste: handlePaste,
      onBlur: () => {
        flushPendingManagedText();
        isComposing.current = false;
        finalizedCompositionRef.current = null;
        queueMicrotask(reconcileManagedTextareaBlur);
      },
    },
  };
};
