import type { ShortcutTargetKind } from "@/shared/utils/dom-focus";
import type { KeyInput } from "@chardesk/keyboard";

export type EditorCommandCompletion<Data = unknown> =
  | { succeeded: true; changed: boolean; data?: Data; reason?: string }
  | { succeeded: false; changed: false; reason: string };

export type EditorCommandResult<Data = unknown> =
  | { handled: false; status: "unhandled"; reason?: string }
  | { handled: true; status: "rejected"; reason?: string }
  | { handled: true; status: "succeeded"; data?: Data; reason?: string }
  | {
      handled: true;
      status: "pending";
      completion: Promise<EditorCommandCompletion<Data>>;
    };

export type EditorCommandSource = string;

export type EditorShortcutContext<State> = {
  state: Readonly<State>;
  targetKind: ShortcutTargetKind;
  phase: "keydown" | "keyup";
  target?: { kind: ShortcutTargetKind };
  canvas?: { mode?: string; readOnly?: boolean; hasTextCursor?: boolean };
  grid?: { editMode?: string; hasRange?: boolean };
  structured?: { hasSelection?: boolean };
  presentation?: { active?: boolean };
  tool?: { id?: string | null };
};

export interface EditorStateAdapter<State> {
  get: () => State;
  subscribe: (listener: (state: State, previous: State) => void) => () => void;
}

export interface EditorHistoryCheckpoint {
  commit: () => void;
  cancel: () => void;
}

export interface EditorHistoryPort {
  canUndo?: () => boolean;
  canRedo?: () => boolean;
  undo: () => boolean;
  redo: () => boolean;
  beginCheckpoint: () => EditorHistoryCheckpoint;
  finishCapture: () => void;
}

export type EditorTransactionMode = "save" | "merge" | "none" | "reset";

export interface EditorTransactionPort {
  run: <Result>(fn: () => Result, mode?: EditorTransactionMode) => Result;
}

export interface EditorCommandHost<State> {
  getState: () => Readonly<State>;
  history: EditorHistoryPort;
  transact: <Result>(fn: () => Result, mode?: EditorTransactionMode) => Result;
  setCurrentTool: (id: string) => boolean;
  getCurrentToolId: () => string | null;
}

export interface EditorCommandContext<State> {
  editor: EditorCommandHost<State>;
  state: Readonly<State>;
  source: EditorCommandSource;
}

export interface EditorCommandDefinition<State, Input = void, Data = unknown> {
  id: string;
  canExecute?(input: Input, context: EditorCommandContext<State>): boolean;
  execute(
    input: Input,
    context: EditorCommandContext<State>
  ): EditorCommandResult<Data>;
}

export type AnyEditorCommandDefinition<State> = EditorCommandDefinition<
  State,
  unknown,
  unknown
>;

export const defineEditorCommand = <State, Input = void, Data = unknown>(
  definition: EditorCommandDefinition<State, Input, Data>
) => definition;

export type EditorInputEvent =
  | { type: "pointer"; name: "down" | "move" | "up"; payload: unknown }
  | { type: "keyboard"; input: KeyInput }
  | { type: "wheel" | "pinch" | "tick"; payload: unknown }
  | { type: "misc"; name: "cancel" | "complete" | "interrupt"; payload?: unknown };

export interface Disposable {
  dispose: () => void;
}
