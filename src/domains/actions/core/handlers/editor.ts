import type { CanvasState, ClipboardCommandResult } from "@/domains/canvas/public";
import { exportStructuredHierarchyText } from "@/domains/export/public";
import { runEditorCommand } from "@/domains/actions/adapters/editorCommands";
import { getFirstGrapheme } from "@/shared/utils/characters";
import { getTextColumnWidth } from "@/domains/structured-content/public";
import {
  canReorderStructuredNodes,
  canSplitStructuredSplitBoxLeaf,
  getStructuredBoxNameEndPoint,
  getStructuredSplitBoxLeafAtPoint,
  getStructuredTextStylesInRange,
  isStructuredSplitBoxLineHandle,
} from "@/domains/structured-content/public";
import { clipboard, feedback } from "@/shared/services/effects";
import { getStructuredTextSelectionRange } from "@/domains/structured-content/public";
import type { StructuredBoxNode, StructuredTextNode } from "@/domains/structured-content/public";
import { actionFailed, actionPending, actionSucceeded } from "../result";
import type {
  ActionContext,
  ActionHandler,
  ActionResult,
  ActionSource,
  EditorActionId,
} from "../types";
import {
  forEachGridSelectionSpan,
  getGridSelectionRanges,
  getStaticGridSelectionAreas,
  hasGridRangeSelection,
} from "@/domains/selection/public";
import { hasClipboardSource } from "@/domains/actions/adapters/clipboardActions";
import type { TextAttributes } from "@/shared/types";

// Options types for each action
type UndoRedoOptions = {
  onUndo?: () => boolean | void;
  onRedo?: () => boolean | void;
  managedTextarea?: HTMLTextAreaElement | null;
  source?: ActionSource;
};
type ClipboardOptions = {
  clipboardEvent?: ClipboardEvent;
  managedTextarea?: HTMLTextAreaElement | null;
  source?: ActionSource;
};
type FillOptions = { fillChar?: string };

type FormatActionId = Extract<EditorActionId, `format-${string}`>;
type TextAttributeName = keyof TextAttributes;

const FORMAT_ATTRIBUTES: Record<FormatActionId, TextAttributeName> = {
  "format-bold": "bold",
  "format-italic": "italic",
  "format-underline": "underline",
  "format-strike": "strike",
  "format-inverse": "inverse",
};

const hasStructuredSelection = (state: CanvasState) =>
  state.canvasMode === "structured" && state.selectedStructuredNodeIds.length > 0;

const canReorderStructuredSelection = (
  state: CanvasState,
  direction: "forward" | "backward" | "front" | "back"
) =>
  state.canvasMode === "structured" &&
  canReorderStructuredNodes(
    state.structuredScene,
    state.selectedStructuredNodeIds,
    direction
  );

const getContextSplitBox = (state: CanvasState) => {
  if (
    state.canvasMode !== "structured" ||
    state.selectedStructuredNodeIds.length !== 1 ||
    !state.structuredContextPoint
  ) {
    return null;
  }
  const selectedId = state.selectedStructuredNodeIds[0];
  return (
    state.structuredScene.find((node) => node.id === selectedId && node.type === "splitBox") ?? null
  );
};

const canSplitContextSplitBox = (
  state: CanvasState,
  axis: "horizontal" | "vertical"
) => {
  const splitBox = getContextSplitBox(state);
  if (!splitBox || splitBox.type !== "splitBox" || !state.structuredContextPoint) {
    return false;
  }
  if (state.selectedStructuredSplitHandle) return false;
  const leaf = getStructuredSplitBoxLeafAtPoint(splitBox, state.structuredContextPoint);
  return !!leaf && canSplitStructuredSplitBoxLeaf(leaf, axis);
};

const hasSelectedStructuredDivider = (state: CanvasState) =>
  state.canvasMode === "structured" &&
  !!state.selectedStructuredSplitHandle &&
  isStructuredSplitBoxLineHandle(state.selectedStructuredSplitHandle.handle);

const hasStructuredTextSelection = (state: CanvasState) =>
  state.canvasMode === "structured" &&
  !!getStructuredTextSelectionRange(state.structuredTextSelection);

const hasStructuredCutSource = (
  state: CanvasState
) =>
  hasStructuredTextSelection(state) ||
  (state.canvasMode === "structured" &&
    state.selectedStructuredNodeIds.length > 0);

const isStructuredBoxNode = (node: { type: string }): node is StructuredBoxNode =>
  node.type === "box";

const isStructuredTextNode = (node: { type: string }): node is StructuredTextNode =>
  node.type === "text";

const getSelectedStructuredBox = (state: CanvasState) => {
  if (state.canvasMode !== "structured" || !state.selectedStructuredBoxId) return null;
  return (
    state.structuredScene.find(
      (node): node is StructuredBoxNode =>
        node.id === state.selectedStructuredBoxId && isStructuredBoxNode(node)
    ) ?? null
  );
};

const getSelectedStructuredEditCursor = (state: CanvasState) => {
  const box = getSelectedStructuredBox(state);
  if (box) return getStructuredBoxNameEndPoint(box);
  if (state.canvasMode !== "structured" || state.selectedStructuredNodeIds.length !== 1)
    return null;
  const selectedId = state.selectedStructuredNodeIds[0];
  const text = state.structuredScene.find(
    (node): node is StructuredTextNode => node.id === selectedId && isStructuredTextNode(node)
  );
  if (!text) return null;
  return {
    x: text.position.x + getTextColumnWidth(text.text),
    y: text.position.y,
  };
};

// Check if action can run
const canCopyOrCut = (state: CanvasState): boolean => {
  if (state.canvasMode === "structured") {
    return hasStructuredTextSelection(state) || state.structuredScene.length > 0;
  }
  return hasClipboardSource(
    getStaticGridSelectionAreas(
      state.staticGridSelection,
      state.contentSurface.reader
    ),
    state.textCursor
  );
};

const hasStaticGridRangeSelection = (state: CanvasState) =>
  state.canvasMode !== "structured" && hasGridRangeSelection(state.staticGridSelection);

const getSelectedTextAttributeValues = (
  state: CanvasState,
  attribute: TextAttributeName
): boolean[] => {
  if (state.canvasMode === "structured") {
    const range = getStructuredTextSelectionRange(state.structuredTextSelection);
    const node = range && state.structuredTextSelection
      ? state.structuredScene.find(
          (candidate) =>
            candidate.id === state.structuredTextSelection?.nodeId && candidate.type === "text"
        )
      : null;
    if (!range || node?.type !== "text") return [];
    return getStructuredTextStylesInRange(node, range.start, range.end).map(
      (style) => style.attrs?.[attribute] === true
    );
  }

  const values: boolean[] = [];
  forEachGridSelectionSpan(
    getGridSelectionRanges(state.staticGridSelection),
    ({ y, minX, maxX }) => {
      for (let x = minX; x <= maxX; x++) {
        const cell = state.contentSurface.reader.get({ x, y });
        if (cell) values.push(cell.attrs?.[attribute] === true);
      }
    },
    state.contentSurface.reader
  );
  return values;
};

const canFormatTextSelection = (state: CanvasState) =>
  getSelectedTextAttributeValues(state, "bold").length > 0;

const toggleTextAttribute = (
  context: ActionContext,
  attribute: TextAttributeName
): ActionResult => {
  const values = getSelectedTextAttributeValues(context.state, attribute);
  if (values.length === 0) return actionFailed("empty-selection");
  const next = !values.every(Boolean);
  if (context.state.canvasMode === "structured") {
    context.canvas.commands.structured.setTextAttributes({ [attribute]: next });
  } else {
    context.canvas.commands.selection.setTextAttributes({ [attribute]: next });
  }
  return actionSucceeded();
};

const resolveClipboardAction = (
  result: boolean | Promise<ClipboardCommandResult>
): ActionResult => {
  if (result === false) return actionFailed("command-failed");
  if (result === true) return actionSucceeded();
  return actionPending(
    result.then((completion) =>
      completion.status === "applied"
        ? { succeeded: true as const, changed: completion.changed }
        : {
            succeeded: false as const,
            changed: false as const,
            reason: completion.reason,
          }
    )
  );
};

// Editor action handlers
export const editorHandlers: Record<EditorActionId, ActionHandler<unknown>> = {
  undo: (options, context): ActionResult => {
    const opts = options as UndoRedoOptions;
    if (!context.state.canUndo) return actionFailed("precondition-failed");
    const succeeded = runEditorCommand(context.canvas, "undo", {
      source: opts.source,
      managedTextarea: opts.managedTextarea,
      onUndo: opts.onUndo,
    });
    return typeof succeeded === "boolean" && succeeded
      ? actionSucceeded()
      : actionFailed("precondition-failed");
  },

  redo: (options, context): ActionResult => {
    const opts = options as UndoRedoOptions;
    if (!context.state.canRedo) return actionFailed("precondition-failed");
    const succeeded = runEditorCommand(context.canvas, "redo", {
      source: opts.source,
      managedTextarea: opts.managedTextarea,
      onRedo: opts.onRedo,
    });
    return typeof succeeded === "boolean" && succeeded
      ? actionSucceeded()
      : actionFailed("precondition-failed");
  },

  copy: (options, context): ActionResult => {
    const opts = options as ClipboardOptions;
    if (context.state.canvasMode === "structured") {
      if (context.state.structuredScene.length === 0) {
        return actionFailed("empty-scene");
      }
    } else if (!canCopyOrCut(context.state)) {
      return actionFailed("empty-selection");
    }
    return resolveClipboardAction(
      runEditorCommand(context.canvas, "copy", {
        source: opts.source ?? "keyboard",
        clipboardEvent: opts.clipboardEvent,
        managedTextarea: opts.managedTextarea,
      })
    );
  },

  "copy-rich": (options, context): ActionResult => {
    const opts = options as ClipboardOptions;
    if (context.state.canvasMode === "structured") {
      return actionFailed("not-supported-in-structured");
    }
    if (!canCopyOrCut(context.state)) {
      return actionFailed("empty-selection");
    }
    return resolveClipboardAction(
      runEditorCommand(context.canvas, "copy-rich", {
        source: opts.source ?? "keyboard",
        clipboardEvent: opts.clipboardEvent,
        managedTextarea: opts.managedTextarea,
      })
    );
  },

  "copy-ansi": (options, context): ActionResult => {
    const opts = options as ClipboardOptions;
    if (context.state.canvasMode === "structured") {
      return actionFailed("not-supported-in-structured");
    }
    if (!canCopyOrCut(context.state)) {
      return actionFailed("empty-selection");
    }
    return resolveClipboardAction(
      runEditorCommand(context.canvas, "copy-ansi", {
        source: opts.source ?? "keyboard",
        clipboardEvent: opts.clipboardEvent,
        managedTextarea: opts.managedTextarea,
      })
    );
  },

  cut: (options, context): ActionResult => {
    const opts = options as ClipboardOptions;
    const unavailable =
      context.state.canvasMode === "structured"
        ? !hasStructuredCutSource(context.state)
        : !canCopyOrCut(context.state);
    if (unavailable) return actionFailed("empty-selection");
    return resolveClipboardAction(
      runEditorCommand(context.canvas, "cut", {
        source: opts.source ?? "keyboard",
        clipboardEvent: opts.clipboardEvent,
        managedTextarea: opts.managedTextarea,
      })
    );
  },

  paste: (options, context): ActionResult => {
    const opts = options as ClipboardOptions;
    return resolveClipboardAction(
      runEditorCommand(context.canvas, "paste", {
        source: opts.source ?? "keyboard",
        clipboardEvent: opts.clipboardEvent,
        managedTextarea: opts.managedTextarea,
      })
    );
  },

  "fill-selection-char": (options, context): ActionResult => {
    const opts = options as FillOptions;
    if (context.state.canvasMode === "structured") {
      return actionFailed("not-supported-in-structured");
    }
    const fillChar = opts.fillChar ? getFirstGrapheme(opts.fillChar) : "";
    if (!fillChar) {
      return actionFailed("no-fill-char");
    }
    const hasTextCursor = context.state.textCursor !== null;
    if (!hasStaticGridRangeSelection(context.state) || hasTextCursor) {
      return actionFailed("no-selection");
    }
    const succeeded = runEditorCommand(context.canvas, "fill-selection-char", {
      source: "keyboard",
      fillChar,
    });
    return succeeded ? actionSucceeded() : actionFailed("command-failed");
  },

  "snapshot-png": (_options, context): ActionResult => {
    if (!hasStaticGridRangeSelection(context.state)) {
      return actionFailed("empty-selection");
    }
    void context.canvas.commands.selection.copyAsPng(context.state.showGrid);
    return actionSucceeded();
  },

  "delete-selection": (_options, context): ActionResult => {
    if (!hasStaticGridRangeSelection(context.state) && !hasStructuredSelection(context.state)) {
      return actionFailed("empty-selection");
    }
    context.canvas.commands.selection.delete();
    return actionSucceeded();
  },

  "format-bold": (_options, context) => toggleTextAttribute(context, FORMAT_ATTRIBUTES["format-bold"]),
  "format-italic": (_options, context) =>
    toggleTextAttribute(context, FORMAT_ATTRIBUTES["format-italic"]),
  "format-underline": (_options, context) =>
    toggleTextAttribute(context, FORMAT_ATTRIBUTES["format-underline"]),
  "format-strike": (_options, context) =>
    toggleTextAttribute(context, FORMAT_ATTRIBUTES["format-strike"]),
  "format-inverse": (_options, context) =>
    toggleTextAttribute(context, FORMAT_ATTRIBUTES["format-inverse"]),

  "structured-rename": (_options, context): ActionResult => {
    const cursor = getSelectedStructuredEditCursor(context.state);
    if (!cursor) return actionFailed("empty-selection");
    context.canvas.commands.interaction.setTextCursor(cursor);
    return actionSucceeded();
  },

  "structured-bring-forward": (_options, context): ActionResult => {
    if (!canReorderStructuredSelection(context.state, "forward")) {
      return actionFailed("precondition-failed");
    }
    context.canvas.commands.structured.reorderSelection("forward");
    return actionSucceeded();
  },

  "structured-send-backward": (_options, context): ActionResult => {
    if (!canReorderStructuredSelection(context.state, "backward")) {
      return actionFailed("precondition-failed");
    }
    context.canvas.commands.structured.reorderSelection("backward");
    return actionSucceeded();
  },

  "structured-bring-to-front": (_options, context): ActionResult => {
    if (!canReorderStructuredSelection(context.state, "front")) {
      return actionFailed("precondition-failed");
    }
    context.canvas.commands.structured.reorderSelection("front");
    return actionSucceeded();
  },

  "structured-send-to-back": (_options, context): ActionResult => {
    if (!canReorderStructuredSelection(context.state, "back")) {
      return actionFailed("precondition-failed");
    }
    context.canvas.commands.structured.reorderSelection("back");
    return actionSucceeded();
  },

  "structured-duplicate": (_options, context): ActionResult => {
    if (!hasStructuredSelection(context.state)) return actionFailed("empty-selection");
    const duplicatedIds = context.canvas.commands.structured.duplicateSelection();
    return duplicatedIds.length > 0 ? actionSucceeded() : actionFailed("empty-selection");
  },

  "structured-copy-hierarchy": (_options, context): ActionResult => {
    if (context.state.canvasMode !== "structured") {
      return actionFailed("not-supported-in-freeform");
    }
    if (context.state.structuredScene.length === 0) {
      return actionFailed("empty-scene");
    }
    const text = exportStructuredHierarchyText(
      context.state.structuredScene,
      context.state.selectedStructuredNodeIds,
      context.state.structuredComponents
    );
    void clipboard.writeText(text).then((copied) => {
      if (!copied) {
        feedback.error("Copy failed", {
          description: "Could not write structure hierarchy to clipboard.",
        });
      }
    });
    return actionSucceeded();
  },

  "structured-split-horizontal": (_options, context): ActionResult => {
    const point = context.state.structuredContextPoint;
    const splitBox = getContextSplitBox(context.state);
    if (!point || !splitBox || splitBox.type !== "splitBox") {
      return actionFailed("empty-selection");
    }
    return context.canvas.commands.structured.splitLeaf(splitBox.id, point, "horizontal")
      ? actionSucceeded()
      : actionFailed("precondition-failed");
  },

  "structured-split-vertical": (_options, context): ActionResult => {
    const point = context.state.structuredContextPoint;
    const splitBox = getContextSplitBox(context.state);
    if (!point || !splitBox || splitBox.type !== "splitBox") {
      return actionFailed("empty-selection");
    }
    return context.canvas.commands.structured.splitLeaf(splitBox.id, point, "vertical")
      ? actionSucceeded()
      : actionFailed("precondition-failed");
  },

  "structured-delete-divider": (_options, context): ActionResult => {
    if (!hasSelectedStructuredDivider(context.state)) {
      return actionFailed("empty-selection");
    }
    context.canvas.commands.selection.delete();
    return actionSucceeded();
  },
};

// Editor action checkers
export const editorCheckers: Partial<Record<EditorActionId, (state: CanvasState) => boolean>> = {
  undo: (state) => state.canUndo,
  redo: (state) => state.canRedo,
  copy: (state) =>
    state.canvasMode === "structured" ? state.structuredScene.length > 0 : canCopyOrCut(state),
  "copy-rich": (state) => state.canvasMode !== "structured" && canCopyOrCut(state),
  "copy-ansi": (state) => state.canvasMode !== "structured" && canCopyOrCut(state),
  cut: (state) =>
    state.canvasMode === "structured" ? hasStructuredCutSource(state) : canCopyOrCut(state),
  "snapshot-png": hasStaticGridRangeSelection,
  "delete-selection": (state) =>
    hasStaticGridRangeSelection(state) || hasStructuredSelection(state),
  "format-bold": canFormatTextSelection,
  "format-italic": canFormatTextSelection,
  "format-underline": canFormatTextSelection,
  "format-strike": canFormatTextSelection,
  "format-inverse": canFormatTextSelection,
  "structured-rename": (state) => getSelectedStructuredEditCursor(state) !== null,
  "structured-bring-forward": (state) =>
    canReorderStructuredSelection(state, "forward"),
  "structured-send-backward": (state) =>
    canReorderStructuredSelection(state, "backward"),
  "structured-bring-to-front": (state) =>
    canReorderStructuredSelection(state, "front"),
  "structured-send-to-back": (state) =>
    canReorderStructuredSelection(state, "back"),
  "structured-duplicate": hasStructuredSelection,
  "structured-copy-hierarchy": (state) =>
    state.canvasMode === "structured" && state.structuredScene.length > 0,
  "structured-split-horizontal": (state) => canSplitContextSplitBox(state, "horizontal"),
  "structured-split-vertical": (state) => canSplitContextSplitBox(state, "vertical"),
  "structured-delete-divider": hasSelectedStructuredDivider,
  "fill-selection-char": (state) =>
    hasStaticGridRangeSelection(state) && state.textCursor === null,
};
