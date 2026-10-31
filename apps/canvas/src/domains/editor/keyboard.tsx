import { useCallback, useRef } from 'react';
import type { KeyInput } from '@chardesk/keyboard';
import { connectBindings, createProgrammaticInput } from '@chardesk/editor-input';
import { browserMetadata, type BrowserKeymap } from '@chardesk/editor-input/browser';
import { useEditor } from './react';
import type { EditorRuntime, EditorShortcutContext } from './core/runtime';
import type { RegisteredKeymapEntry } from './core/keymap';
import type { CanvasState } from '@/domains/canvas/public';
import { classifyShortcutTarget, type ShortcutTargetKind } from '@/shared/utils/dom-focus';
import { SHORTCUT_PRIORITY, useShortcutBindings } from '@/shared/shortcuts/dispatcher';

const createEditorShortcutContext = (
  editor: EditorRuntime<CanvasState>,
  targetKind: ShortcutTargetKind,
  phase: 'keydown' | 'keyup' = 'keydown'
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
      hasTextCursor: state.interaction.staticGrid.mode === 'text-edit',
    },
    grid: {
      editMode: state.interaction.staticGrid.mode,
      hasRange:
        state.interaction.staticGrid.mode === 'navigate' &&
        state.interaction.staticGrid.selection.mode === 'range',
    },
    presentation: { active: false },
    tool: { id: state.tool },
  };
};

const executeEntry = (
  editor: EditorRuntime<CanvasState>,
  entry: RegisteredKeymapEntry<EditorShortcutContext<CanvasState>>,
  context?: EditorShortcutContext<CanvasState>,
  canExecuteEntry?: EditorShortcutEntryPredicate
) => {
  if (context && canExecuteEntry && !canExecuteEntry(entry, context)) {
    return { type: 'none' as const };
  }
  if (entry.target.type === 'tool') {
    return editor.setCurrentTool(entry.target.id)
      ? { type: 'executed' as const }
      : { type: 'none' as const };
  }
  const result = editor.commands.execute(entry.target.id, undefined, 'keyboard');
  return result.status === 'succeeded' || result.status === 'pending'
    ? { type: 'executed' as const, result }
    : { type: 'none' as const };
};

type EditorShortcutEntryPredicate = (
  entry: RegisteredKeymapEntry<EditorShortcutContext<CanvasState>>,
  context: EditorShortcutContext<CanvasState>
) => boolean;
type Execution = ReturnType<typeof executeEntry> | { type: 'pending' } | { type: 'cancelled' };

/** Explicit normalized-input API; sequence ownership and precedence stay in the library. */
export class EditorShortcutEngine {
  readonly #host: ReturnType<typeof createProgrammaticInput>;
  readonly #bindings;
  #context: EditorShortcutContext<CanvasState>;
  #input: KeyInput | undefined;
  #result: Execution = { type: 'none' };
  #canExecuteEntry: EditorShortcutEntryPredicate | undefined;
  readonly editor: EditorRuntime<CanvasState>;
  constructor(
    editor: EditorRuntime<CanvasState>,
    timeoutMs = 1500,
    canExecuteEntry?: EditorShortcutEntryPredicate
  ) {
    this.editor = editor;
    this.#host = createProgrammaticInput(browserMetadata, timeoutMs);
    this.#context = createEditorShortcutContext(editor, 'document');
    this.#canExecuteEntry = canExecuteEntry;
    this.#bindings = connectBindings(this.#host.keymap, editor.keymap, {
      context: () => this.#context,
      repeat: () => this.#input?.repeat ?? false,
      execute: (entry) => {
        this.#result = executeEntry(editor, entry, this.#context, this.#canExecuteEntry);
        return this.#result.type === 'executed';
      },
    });
  }
  setEntryPredicate = (predicate?: EditorShortcutEntryPredicate) => {
    this.#canExecuteEntry = predicate;
  };
  cancelChord = () => this.#host.keymap.clearPendingSequence();
  dispose = () => {
    this.#bindings.dispose();
    this.#host.dispose();
  };
  resolve(input: KeyInput, targetKind: ShortcutTargetKind) {
    this.#context = createEditorShortcutContext(this.editor, targetKind);
    this.#host.keymap.setData('query.input', input);
    const entry = this.#bindings.resolve(input);
    return entry ? { type: 'match' as const, entry } : { type: 'none' as const };
  }
  handleKeyDown(input: KeyInput, targetKind: ShortcutTargetKind): Execution {
    this.#context = createEditorShortcutContext(this.editor, targetKind);
    this.#input = input;
    this.#result = { type: 'none' };
    if (input.key === 'Escape' && this.#host.keymap.hasPendingSequence()) {
      this.cancelChord();
      return { type: 'cancelled' };
    }
    this.#host.dispatch(input);
    if (this.#host.keymap.hasPendingSequence()) return { type: 'pending' };
    return this.#result;
  }
}
const queries = new WeakMap<EditorRuntime<CanvasState>, EditorShortcutEngine>();
const queryEngine = (editor: EditorRuntime<CanvasState>) => {
  let engine = queries.get(editor);
  if (!engine) {
    engine = new EditorShortcutEngine(editor);
    queries.set(editor, engine);
  }
  return engine;
};
export const resolveEditorKeymapInput = (
  editor: EditorRuntime<CanvasState>,
  input: KeyInput,
  targetKind: ShortcutTargetKind
) => queryEngine(editor).resolve(input, targetKind);
export const executeEditorKeymapInput = (
  editor: EditorRuntime<CanvasState>,
  input: KeyInput,
  targetKind: ShortcutTargetKind
) => queryEngine(editor).handleKeyDown(input, targetKind);

export const useEditorShortcutLayer = ({
  enabled = true,
  canExecuteEntry,
}: {
  enabled?: boolean;
  canExecuteEntry?: EditorShortcutEntryPredicate;
} = {}) => {
  const editor = useEditor();
  const policy = useRef({ enabled, canExecuteEntry });
  policy.current = { enabled, canExecuteEntry };
  const attach = useCallback(
    (keymap: BrowserKeymap) => {
      const context = () => {
        const event = keymap.getData('browser.event') as
          { originalEvent?: KeyboardEvent } | undefined;
        return createEditorShortcutContext(
          editor,
          classifyShortcutTarget(event?.originalEvent?.target ?? null)
        );
      };
      const binding = connectBindings(keymap, editor.keymap, {
        context,
        enabled: () =>
          policy.current.enabled &&
          !['canvas-ui', 'overlay', 'editable'].includes(context().targetKind),
        priority: SHORTCUT_PRIORITY.globalAction,
        repeat: (event) => event.originalEvent?.repeat ?? false,
        execute: (entry) =>
          executeEntry(editor, entry, context(), policy.current.canExecuteEntry).type ===
          'executed',
      });
      let target = `${editor.getState().activeCanvasId}:${editor.getState().tool}`;
      const unsubscribe = editor.subscribe((state) => {
        const next = `${state.activeCanvasId}:${state.tool}`;
        if (next !== target) {
          target = next;
          keymap.clearPendingSequence();
        }
      });
      return () => {
        unsubscribe();
        binding.dispose();
      };
    },
    [editor]
  );
  useShortcutBindings(attach);
};
