import type { CanvasRuntime, CanvasState } from '@/domains/canvas/public';
import { type EditorCommandDefinition, type EditorExtension } from '@/domains/editor/public';
import { actionUnhandled } from './result';
import type {
  ActionChecker,
  ActionContext,
  ActionHandler,
  ActionSource,
  EditorActionId,
} from './types';
import { EDITOR_COMMAND_META } from './catalog';
import { editorHandlers, editorCheckers } from './handlers';

// Combined checkers
const ACTION_CHECKERS: Partial<Record<EditorActionId, ActionChecker>> = {
  ...editorCheckers,
};

const CANVAS_FOCUS_COMMANDS = new Set<EditorActionId>(['copy', 'cut', 'paste', 'delete-selection']);
const SELECTION_FINALIZING_COMMANDS = new Set<EditorActionId>([
  'copy',
  'copy-rich',
  'copy-ansi',
  'cut',
]);
const isFormattingCommand = (id: EditorActionId) => id.startsWith('format-');

type PendingSelectionEditor = {
  finalizePendingSelection?: () => boolean;
};

export type EditorCommandOptions = {
  source?: ActionSource;
  managedTextarea?: HTMLTextAreaElement | null;
  clipboardEvent?: ClipboardEvent;
  fillChar?: string;
  onUndo?: () => boolean | void;
  onRedo?: () => boolean | void;
};

type EditorCommandDescriptor = EditorCommandDefinition<CanvasState, EditorCommandOptions | void>;

const createCommand = (
  canvas: Pick<CanvasRuntime, 'commands' | 'queries' | 'getState'>,
  id: EditorActionId
): EditorCommandDescriptor => ({
  id,
  canExecute: (_input, { state, editor }) => {
    if (id === 'undo') {
      return editor.history.canUndo?.() ?? ACTION_CHECKERS[id]?.(state) ?? true;
    }
    if (id === 'redo') {
      return editor.history.canRedo?.() ?? ACTION_CHECKERS[id]?.(state) ?? true;
    }
    return ACTION_CHECKERS[id]?.(state) ?? true;
  },
  execute: (input, { editor, source }) => {
    const handler = editorHandlers[id] as ActionHandler<EditorCommandOptions> | undefined;
    if (!handler) return actionUnhandled('unknown-command');
    if (SELECTION_FINALIZING_COMMANDS.has(id)) {
      (editor as typeof editor & PendingSelectionEditor).finalizePendingSelection?.();
    }
    const options = input ?? {};
    const context: ActionContext = {
      state: editor.getState() as CanvasState,
      canvas,
      setTool: (tool) => {
        editor.setCurrentTool(tool);
      },
      onUndo: editor.history.undo,
      onRedo: editor.history.redo,
    };
    return handler({ ...options, source: options.source ?? (source as ActionSource) }, context);
  },
});

export const createEditorCommands = (
  canvas: Pick<CanvasRuntime, 'commands' | 'queries' | 'getState'>
) =>
  Object.fromEntries(
    (Object.keys(EDITOR_COMMAND_META) as EditorActionId[]).map((id) => [
      id,
      createCommand(canvas, id),
    ])
  ) as Record<EditorActionId, EditorCommandDescriptor>;

export const createEditorCommandsExtension = (
  canvas: Pick<CanvasRuntime, 'commands' | 'queries' | 'getState'>
): EditorExtension<CanvasState> => {
  const commands = createEditorCommands(canvas);
  return {
    id: 'chardesk.editor-commands',
    commands: Object.values(commands),
    keybindings: Object.values(EDITOR_COMMAND_META).map((command) => ({
      id: `command:${command.id}`,
      label: command.label,
      category: isFormattingCommand(command.id)
          ? 'Formatting'
          : 'General',
      scope: 'canvas',
      configurable: true,
      shortcuts: command.shortcuts?.map((shortcut) =>
        typeof shortcut === 'string' ? shortcut : shortcut.join('+')
      ) ?? [],
      target: { type: 'command' as const, id: command.id },
      when: ({ targetKind, state }) =>
        targetKind !== 'editable' &&
        targetKind !== 'overlay' &&
        targetKind !== 'canvas-ui' &&
        (!CANVAS_FOCUS_COMMANDS.has(command.id) ||
          targetKind === 'managed-canvas' ||
          targetKind === 'canvas-surface') &&
        (command.id !== 'delete-selection' || !state.interaction.textCursor),
    })),
  };
};
