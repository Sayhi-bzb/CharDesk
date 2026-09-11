import { useEffect, useRef } from "react";
import { createSequenceMatcher, type Hotkey } from "@tanstack/hotkeys";
import type { KeyInput } from "@chardesk/keyboard";
import { useEditor } from "./react";
import {
  matchHotkeySequenceInput,
  shortcutFromKeyInput,
  type ShortcutSequence,
} from "./core/shortcut";
import type { EditorRuntime, EditorShortcutContext } from "./core/runtime";
import type { RegisteredKeymapEntry } from "./core/keymap";
import type { CanvasState } from "@/domains/canvas/public";
import type { ShortcutTargetKind } from "@/shared/utils/dom-focus";
import {
  SHORTCUT_PRIORITY,
  useShortcutLayer,
} from "@/shared/shortcuts/dispatcher";

const createEditorShortcutContext = (
  editor: EditorRuntime<CanvasState>,
  targetKind: ShortcutTargetKind,
  phase: "keydown" | "keyup" = "keydown"
): EditorShortcutContext<CanvasState> => {
  const state = editor.getState();
  return {
    state,
    targetKind,
    phase,
    target: { kind: targetKind },
    canvas: {
      mode: state.canvasMode,
      readOnly: false,
      hasTextCursor: state.interaction.staticGrid.mode === "text-edit",
    },
    grid: {
      editMode: state.interaction.staticGrid.mode,
      hasRange: state.interaction.staticGrid.mode === "navigate"
        && state.interaction.staticGrid.selection.mode === "range",
    },
    presentation: { active: false },
    tool: { id: state.tool },
  };
};

export const resolveEditorKeymapInput = (
  editor: EditorRuntime<CanvasState>,
  input: KeyInput,
  targetKind: ShortcutTargetKind,
  phase: "keydown" | "keyup" = "keydown"
) => {
  if (!shortcutFromKeyInput(input)) return { type: "none" as const };
  const entry = editor.keymap.resolveInput(
    input,
    createEditorShortcutContext(editor, targetKind, phase)
  )[0];
  return entry ? { type: "match" as const, entry } : { type: "none" as const };
};

const executeEntry = (
  editor: EditorRuntime<CanvasState>,
  entry: RegisteredKeymapEntry<EditorShortcutContext<CanvasState>>,
  context?: EditorShortcutContext<CanvasState>,
  canExecuteEntry?: EditorShortcutEntryPredicate,
) => {
  if (context && canExecuteEntry && !canExecuteEntry(entry, context)) {
    return { type: "none" as const };
  }
  if (entry.target.type === "tool") {
    return editor.setCurrentTool(entry.target.id)
      ? { type: "executed" as const }
      : { type: "none" as const };
  }
  const result = editor.commands.execute(entry.target.id, undefined, "keyboard");
  return result.status === "succeeded" || result.status === "pending"
    ? { type: "executed" as const, result }
    : { type: "none" as const };
};

export const executeEditorKeymapInput = (
  editor: EditorRuntime<CanvasState>,
  input: KeyInput,
  targetKind: ShortcutTargetKind
) => {
  const resolution = resolveEditorKeymapInput(editor, input, targetKind);
  if (resolution.type !== "match") return resolution;
  if (input.repeat && (resolution.entry.repeat ?? "ignore") === "ignore") {
    return { type: "none" as const };
  }
  return executeEntry(editor, resolution.entry);
};

export class EditorShortcutEngine {
  readonly #editor: EditorRuntime<CanvasState>;
  readonly #timeoutMs: number;
  #pending: Array<{
    sequence: ShortcutSequence;
    matcher: ReturnType<typeof createSequenceMatcher>;
  }> | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #canExecuteEntry: EditorShortcutEntryPredicate | undefined;

  constructor(
    editor: EditorRuntime<CanvasState>,
    timeoutMs = 1_500,
    canExecuteEntry?: EditorShortcutEntryPredicate,
  ) {
    this.#editor = editor;
    this.#timeoutMs = timeoutMs;
    this.#canExecuteEntry = canExecuteEntry;
  }

  setEntryPredicate = (predicate?: EditorShortcutEntryPredicate) => {
    this.#canExecuteEntry = predicate;
  };

  cancelChord = () => {
    this.#pending = null;
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  };

  dispose = () => this.cancelChord();

  #context(targetKind: ShortcutTargetKind): EditorShortcutContext<CanvasState> {
    return createEditorShortcutContext(this.#editor, targetKind);
  }

  #beginChord(starts: readonly { sequence: ShortcutSequence }[], input: KeyInput) {
    this.cancelChord();
    this.#pending = starts.map(({ sequence }) => {
      const matcher = createSequenceMatcher([...sequence] as Hotkey[], { timeout: this.#timeoutMs });
      matchHotkeySequenceInput(matcher, input);
      return { sequence, matcher };
    });
    this.#timer = setTimeout(this.cancelChord, this.#timeoutMs);
    return { type: "pending" as const };
  }

  handleKeyDown(input: KeyInput, targetKind: ShortcutTargetKind) {
    if (input.key === "Escape" && this.#pending) {
      this.cancelChord();
      return { type: "cancelled" as const };
    }
    if (!shortcutFromKeyInput(input)) return { type: "none" as const };
    const context = this.#context(targetKind);

    if (this.#pending) {
      const sequences = this.#pending
        .filter(({ matcher }) => matchHotkeySequenceInput(matcher, input))
        .map(({ sequence }) => sequence);
      this.cancelChord();
      const entry = this.#editor.keymap.resolveCandidates(sequences, context)[0];
      if (entry && (!input.repeat || (entry.repeat ?? "ignore") === "allow")) {
        return executeEntry(this.#editor, entry, context, this.#canExecuteEntry);
      }
      // A mismatched second stroke starts a fresh root resolution.
    }

    const starts = this.#editor.keymap.getSequenceStarts(input, context);
    if (starts.length > 0) {
      return this.#beginChord(starts, input);
    }
    const entry = this.#editor.keymap.resolveInput(input, context)[0];
    if (!entry || (input.repeat && (entry.repeat ?? "ignore") === "ignore")) {
      return { type: "none" as const };
    }
    return executeEntry(this.#editor, entry, context, this.#canExecuteEntry);
  }
}

type EditorShortcutEntryPredicate = (
  entry: RegisteredKeymapEntry<EditorShortcutContext<CanvasState>>,
  context: EditorShortcutContext<CanvasState>,
) => boolean;

export const useEditorShortcutLayer = ({
  enabled = true,
  canExecuteEntry,
}: {
  enabled?: boolean;
  canExecuteEntry?: EditorShortcutEntryPredicate;
} = {}) => {
  const editor = useEditor();
  const engineRef = useRef<EditorShortcutEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new EditorShortcutEngine(editor, 1_500, canExecuteEntry);
  }
  useEffect(() => {
    engineRef.current?.setEntryPredicate(canExecuteEntry);
  }, [canExecuteEntry]);
  useEffect(() => {
    const engine = engineRef.current;
    const cancel = () => engine?.cancelChord();
    window.addEventListener("blur", cancel);
    window.addEventListener("compositionstart", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("compositionstart", cancel);
      engine?.dispose();
    };
  }, []);
  useShortcutLayer({
    id: "editor-keymap",
    priority: SHORTCUT_PRIORITY.globalAction,
    enabled,
    onKeyDown: (input, context) => {
      const result = engineRef.current!.handleKeyDown(input, context.targetKind);
      return result.type === "executed" || result.type === "pending" || result.type === "cancelled"
        ? { claimed: true, preventDefault: true }
        : undefined;
    },
  });
};
