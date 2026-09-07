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
import { isStaticGridMode, type CanvasMode } from "@/domains/sessions/public";
import {
  DEFAULT_GRID_RENDER_METRICS,
  gridCellRect,
} from "@/shared/metrics";
import {
  getStaticGridViewState,
  getGridSelectionRanges,
} from "@/domains/selection/public";
import { classifyShortcutTarget } from "@/shared/utils/dom-focus";
import { shouldIgnoreCanvasSurfaceGesture } from "./interaction/core/gestureGuards";
import {
  resolveFillHotkeyChar,
  isActionAccepted,
} from "@/domains/actions/public";
import {
  resolveEditorKeymapEvent,
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
    selectionMode: editor.getState().staticGridSelection.mode,
    selectionRangeCount: getGridSelectionRanges(
      editor.getState().staticGridSelection
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
    selectionMode: editor.getState().staticGridSelection.mode,
  });
};

type UseManagedCanvasInputOptions = {
  canvasMode: CanvasMode;
  model: CanvasEditorModel;
  size: { width: number; height: number } | undefined;
  onUndo?: () => void;
  onRedo?: () => void;
  copyEnabled?: boolean;
  mutateEnabled?: boolean;
  active?: boolean;
};

const getModifiedArrowEdge = (
  event: Pick<globalThis.KeyboardEvent, "ctrlKey" | "key" | "metaKey">
) => {
  if (!event.ctrlKey && !event.metaKey) return null;
  if (event.key === "ArrowLeft") return "left" as const;
  if (event.key === "ArrowRight") return "right" as const;
  if (event.key === "ArrowUp") return "top" as const;
  if (event.key === "ArrowDown") return "bottom" as const;
  return null;
};

export const useManagedCanvasInput = ({
  canvasMode,
  model,
  size,
  onUndo,
  onRedo,
  copyEnabled = true,
  mutateEnabled = true,
  active = true,
}: UseManagedCanvasInputOptions) => {
  const editor = useEditor();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isComposing = useRef(false);
  const finalizedCompositionRef = useRef<FinalizedManagedComposition | null>(null);
  const {
    textCursor,
    staticGridSelection,
    staticGridEditMode,
    writeTextString,
    backspaceText,
    deleteTextForward,
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
    moveStructuredGridFocus,
    setTextCursor,
    offset,
    zoom,
    fillSelectionsWithChar,
    clearSelections,
    structuredGridFocus,
    setStructuredGridFocus,
    selectedStructuredNodeIds,
    setSelectedStructuredNodeIds,
    setEditingStructuredTextNodeId,
    setStructuredTextSelection,
    canvasColorPickerTarget,
    setCanvasColorPickerTarget,
    setHoveredGrid,
  } = model;
  const staticGridView = useMemo(
    () =>
      getStaticGridViewState({
        selection: staticGridSelection,
        editMode: staticGridEditMode,
        textCursor,
        grid: model.grid,
      }),
    [model.grid, staticGridEditMode, staticGridSelection, textCursor]
  );
  const staticGridMode = isStaticGridMode(canvasMode);
  const activeTextCursor = staticGridMode ? staticGridView.textCursor : textCursor;
  const activeSelections = staticGridMode ? staticGridView.selectionAreas : [];
  const staticGridActiveCell = staticGridMode ? staticGridView.activeCell : null;
  const hasStructuredSelection =
    canvasMode === 'structured' && selectedStructuredNodeIds.length > 0;
  const hasStructuredGridFocus =
    canvasMode === 'structured' && !!structuredGridFocus;
  const hasActiveSelection = activeSelections.length > 0 || hasStructuredSelection;
  const [canvasOwnsInputFocus, setCanvasOwnsInputFocus] = useState(false);
  const canvasOwnsInputFocusRef = useRef(false);
  const windowHasFocusRef = useRef(true);
  const managedTextareaPoint =
    activeTextCursor ??
    structuredGridFocus ??
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
      releaseManagedTextarea();
    };
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    };
  }, [releaseManagedTextarea]);

  useEffect(() => {
    if (active) return;
    let canceled = false;
    queueMicrotask(() => {
      if (!canceled) releaseManagedTextarea();
    });
    return () => {
      canceled = true;
    };
  }, [active, releaseManagedTextarea]);

  useEffect(() => {
    const suspendOnWindowBlur = () => {
      windowHasFocusRef.current = false;
    };
    const restoreOnWindowFocus = () => {
      windowHasFocusRef.current = true;
      reconcileManagedTextareaBlur();
    };
    window.addEventListener('blur', suspendOnWindowBlur);
    window.addEventListener('focus', restoreOnWindowFocus);
    return () => {
      window.removeEventListener('blur', suspendOnWindowBlur);
      window.removeEventListener('focus', restoreOnWindowFocus);
    };
  }, [reconcileManagedTextareaBlur]);

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
    onKeyDown: (event, context) => {
      if (
        !canvasOwnsInputFocusRef.current ||
        (event.target !== textareaRef.current &&
          context.targetKind !== 'canvas-surface' &&
          context.targetKind !== 'document')
      ) {
        return;
      }
      const contentNavigationEdge = staticGridMode
        ? getModifiedArrowEdge(event)
        : null;
      if (contentNavigationEdge) {
        moveStaticGridFocusToContentBoundary(contentNavigationEdge, {
          extend: event.shiftKey,
        });
        return {
          claimed: true,
          preventDefault: true,
          stopImmediatePropagation: true,
        };
      }
      const resolution = resolveEditorKeymapEvent(
        editor,
        event,
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
        primeManagedTextarea();
        clipboardShortcutCoordinator.begin(clipboardCommand);
        return { claimed: true, preventDefault: false };
      }
      const historyCommand = commandId === "undo" || commandId === "redo" ? commandId : null;
      if (!historyCommand) return;
      if (!mutateEnabled) return;
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
    onKeyDown: (event, context) => {
      if (
        event.key !== "Escape" ||
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
      ? gridCellRect(point, { offset, zoom })
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
    if (!mutateEnabled && (e.key === "Backspace" || e.key === "Delete")) {
      e.preventDefault();
      return;
    }
    if (activeTextCursor) {
      if (e.key === 'Backspace') {
        e.preventDefault();
        backspaceText();
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        deleteTextForward();
        return;
      }
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && hasActiveSelection) {
      e.preventDefault();
      editor.commands.execute('delete-selection', undefined, 'canvas-keydown');
      return;
    }

    const mod = e.ctrlKey || e.metaKey;

    if (staticGridMode && mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      selectStaticGridAll();
    } else if (
      staticGridMode &&
      staticGridEditMode === 'navigate' &&
      e.shiftKey &&
      e.code === 'Space' &&
      !mod
    ) {
      e.preventDefault();
      selectStaticGridRow();
    } else if (
      staticGridMode &&
      staticGridEditMode === 'navigate' &&
      e.ctrlKey &&
      e.code === 'Space' &&
      !e.metaKey
    ) {
      e.preventDefault();
      selectStaticGridColumn();
    } else if (staticGridMode && e.key === 'F2' && mutateEnabled) {
      e.preventDefault();
      enterStaticGridTextEdit(staticGridActiveCell ?? undefined);
    } else if (
      staticGridMode &&
      staticGridEditMode === 'navigate' &&
      (e.key === 'Home' || e.key === 'End')
    ) {
      e.preventDefault();
      moveStaticGridFocusToEdge(
        mod
          ? e.key === 'Home' ? 'top-left' : 'bottom-right'
          : e.key === 'Home' ? 'left' : 'right',
        { extend: e.shiftKey }
      );
    } else if (
      staticGridMode &&
      staticGridEditMode === 'navigate' &&
      (e.key === 'PageUp' || e.key === 'PageDown')
    ) {
      e.preventDefault();
      const pageRows = Math.max(
        1,
        Math.floor(
          (size?.height ?? DEFAULT_GRID_RENDER_METRICS.cellHeight) /
            (DEFAULT_GRID_RENDER_METRICS.cellHeight * zoom)
        ) - 1
      );
      moveStaticGridFocus(0, e.key === 'PageUp' ? -pageRows : pageRows, {
        extend: e.shiftKey,
      });
    } else if (e.key === 'Backspace') {
      if (activeTextCursor) {
        e.preventDefault();
        backspaceText();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (staticGridMode && staticGridEditMode === 'navigate') {
        moveStaticGridFocus(0, e.shiftKey ? -1 : 1);
      } else {
        newlineText();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (staticGridMode && staticGridEditMode === 'navigate') {
        moveStaticGridFocus(e.shiftKey ? -1 : 1, 0);
      } else {
        indentText();
      }
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      if (staticGridMode && staticGridEditMode === 'navigate') {
        moveStaticGridFocus(dx, dy, { extend: e.shiftKey });
      } else if (staticGridMode && activeTextCursor) {
        moveTextCursor(dx, dy);
      } else if (textCursor) {
        moveTextCursor(dx, dy);
      } else if (!hasStructuredSelection) {
        moveStructuredGridFocus(dx, dy);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (canvasColorPickerTarget) {
        setCanvasColorPickerTarget(null);
        setHoveredGrid(null);
      } else if (staticGridMode && staticGridEditMode === 'text-edit') {
        exitStaticGridTextEdit();
      } else if (activeTextCursor) {
        setTextCursor(null);
        setEditingStructuredTextNodeId(null);
        setStructuredTextSelection(null);
      } else if (hasStructuredSelection) {
        setSelectedStructuredNodeIds([]);
      } else if (hasStructuredGridFocus) {
        setStructuredGridFocus(null);
      } else if (hasActiveSelection) {
        clearSelections();
      }
    } else if (staticGridView.hasSelection && !activeTextCursor) {
      if (!mutateEnabled) return;
      const fillChar = resolveFillHotkeyChar(e);
      if (!fillChar) return;

      // Direct character fill when selection is active
      e.preventDefault();
      fillSelectionsWithChar(fillChar);
    }
  };

  const commitManagedText = (value: string) => {
    if (mutateEnabled && value) writeTextString(value);
  };
  const readManagedText = (value: string) =>
    value.replaceAll(MANAGED_TEXTAREA_SENTINEL, "");

  return {
    textareaRef,
    canvasOwnsInputFocus,
    onCanvasPointerDown: handleCanvasPointerDown,
    textareaStyle: textareaStyle as CSSProperties,
    textareaProps: {
      onCompositionStart: () => {
        isComposing.current = true;
        finalizedCompositionRef.current = null;
      },
      onCompositionEnd: (event: CompositionEvent<HTMLTextAreaElement>) => {
        isComposing.current = false;
        const value = event.data || readManagedText(event.currentTarget.value);
        commitManagedText(value);
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
          commitManagedText(value);
          primeManagedTextarea();
        }
      },
      onKeyDown: handleKeyDown,
      onCopy: handleCopy,
      onCut: handleCut,
      onPaste: handlePaste,
      onBlur: () => {
        isComposing.current = false;
        finalizedCompositionRef.current = null;
        queueMicrotask(reconcileManagedTextareaBlur);
      },
    },
  };
};
