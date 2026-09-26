import type { KeymapEntry } from "./keymap";
import type { EditorStateNode } from "./stateNode";
import type {
  AnyEditorCommandDefinition,
  Disposable,
  EditorCommandHost,
  EditorInputEvent,
  EditorShortcutContext,
} from "./types";

export interface EditorManagerFactory<State> {
  id: string;
  create: (editor: EditorCommandHost<State>) => Disposable;
}

export type EditorStateScope = "document" | "session" | "presence" | "derived";

export interface EditorStateScopeDefinition {
  key: string;
  scope: EditorStateScope;
}

export interface EditorToolDefinition<State, Event = EditorInputEvent> {
  id: string;
  create: (
    editor: EditorCommandHost<State>,
    parent: EditorStateNode<State, Event>,
  ) => EditorStateNode<State, Event>;
}

export interface EditorExtension<State, Event = EditorInputEvent> {
  id: string;
  commands?: readonly AnyEditorCommandDefinition<State>[];
  tools?: readonly EditorToolDefinition<State, Event>[];
  keybindings?: readonly KeymapEntry<EditorShortcutContext<State>>[];
  managers?: readonly EditorManagerFactory<State>[];
  stateScopes?: readonly EditorStateScopeDefinition[];
  setup?: (editor: EditorCommandHost<State>) => void | (() => void) | Disposable;
}
