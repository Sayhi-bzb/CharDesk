import type { CanvasRuntime } from "@/domains/canvas/public";
import type { ClipboardCommandResult } from "@/domains/canvas/public";
import type { ActionId, ActionSource } from "@/domains/actions/core/types";
import {
  shouldIgnoreEditorCommandByFocus,
} from "@/domains/actions/input-arbiter";
import { getFirstGrapheme } from "@/shared/utils/characters";
import { hasGridRangeSelection } from "@/domains/selection/public";
import { getStructuredTextSelectionRange } from "@/domains/structured-content/public";

type EditorCommand = Extract<
  ActionId,
  "undo" | "redo" | "copy" | "copy-rich" | "copy-ansi" | "cut" | "paste" | "fill-selection-char"
>;
type CommandSource = ActionSource;

type RunEditorCommandOptions = {
  source?: CommandSource;
  managedTextarea?: HTMLTextAreaElement | null;
  clipboardEvent?: ClipboardEvent;
  fillChar?: string;
  onUndo?: () => boolean | void;
  onRedo?: () => boolean | void;
};

export const runEditorCommand = (
  canvas: Pick<CanvasRuntime, "commands" | "queries" | "getState">,
  command: EditorCommand,
  options: RunEditorCommandOptions = {}
): boolean | Promise<ClipboardCommandResult> => {
  const source = options.source ?? "global-hotkey";
  if (shouldIgnoreEditorCommandByFocus(source, options.managedTextarea)) return false;

  const state = canvas.getState();

  switch (command) {
    case "undo":
      return options.onUndo ? options.onUndo() !== false : canvas.commands.history.undo();
    case "redo":
      return options.onRedo ? options.onRedo() !== false : canvas.commands.history.redo();
    case "copy":
    case "copy-rich":
    case "copy-ansi":
      if (
        state.canvasMode === "structured" &&
        (command === "copy-rich" || command === "copy-ansi")
      ) {
        return false;
      }
      if (!canvas.queries.canCopyOrCut()) return false;
      return canvas.commands.selection.copy({
        event: options.clipboardEvent,
        rich: command === "copy" || command === "copy-rich",
        ansi: command === "copy-ansi",
      });
    case "cut":
      if (state.canvasMode === "structured") {
        const hasStructuredTextSelection = !!getStructuredTextSelectionRange(
          state.interaction.structuredTextSelection
        );
        if (!hasStructuredTextSelection && state.interaction.selectedStructuredNodeIds.length === 0) {
          return false;
        }
        return canvas.commands.selection.cut({ event: options.clipboardEvent });
      }
      if (!canvas.queries.canCopyOrCut()) return false;
      return canvas.commands.selection.cut({ event: options.clipboardEvent });
    case "paste":
      return canvas.commands.selection.paste({
        eventDataTransfer: options.clipboardEvent?.clipboardData || undefined,
      });
    case "fill-selection-char": {
      if (state.canvasMode === "structured") return false;
      const fillChar = options.fillChar ? getFirstGrapheme(options.fillChar) : "";
      if (!fillChar) return false;
      if (!hasGridRangeSelection(state.interaction.staticGridSelection) || state.interaction.textCursor) return false;
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea") return false;
      canvas.commands.selection.fillWithChar(fillChar);
      return true;
    }
    default:
      return false;
  }
};
