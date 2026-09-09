import type { CanvasState, ClipboardCommandResult } from "@/domains/canvas/public";
import { runEditorCommand } from "@/domains/actions/adapters/editorCommands";
import { getFirstGrapheme } from "@/shared/utils/characters";
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

// Check if action can run
const canCopyOrCut = (state: CanvasState): boolean => {
  return hasClipboardSource(
    getStaticGridSelectionAreas(
      state.interaction.staticGridSelection,
      state.contentSurface.reader
    ),
    state.interaction.textCursor
  );
};

const hasStaticGridRangeSelection = (state: CanvasState) =>
  hasGridRangeSelection(state.interaction.staticGridSelection);

const getSelectedTextAttributeValues = (
  state: CanvasState,
  attribute: TextAttributeName
): boolean[] => {
  const values: boolean[] = [];
  forEachGridSelectionSpan(
    getGridSelectionRanges(state.interaction.staticGridSelection),
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
  context.canvas.commands.selection.setTextAttributes({ [attribute]: next });
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
    if (!canCopyOrCut(context.state)) {
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
    const unavailable = !canCopyOrCut(context.state);
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
    const fillChar = opts.fillChar ? getFirstGrapheme(opts.fillChar) : "";
    if (!fillChar) {
      return actionFailed("no-fill-char");
    }
    const hasTextCursor = context.state.interaction.textCursor !== null;
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
    if (!hasStaticGridRangeSelection(context.state)) {
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

};

// Editor action checkers
export const editorCheckers: Partial<Record<EditorActionId, (state: CanvasState) => boolean>> = {
  undo: (state) => state.canUndo,
  redo: (state) => state.canRedo,
  copy: canCopyOrCut,
  "copy-rich": canCopyOrCut,
  "copy-ansi": canCopyOrCut,
  cut: canCopyOrCut,
  "snapshot-png": hasStaticGridRangeSelection,
  "delete-selection": hasStaticGridRangeSelection,
  "format-bold": canFormatTextSelection,
  "format-italic": canFormatTextSelection,
  "format-underline": canFormatTextSelection,
  "format-strike": canFormatTextSelection,
  "format-inverse": canFormatTextSelection,
  "fill-selection-char": (state) =>
    hasStaticGridRangeSelection(state) && state.interaction.textCursor === null,
};
