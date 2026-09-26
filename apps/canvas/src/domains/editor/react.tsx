/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { CanvasState } from "@/domains/canvas/public";
import { CanvasEditorRuntime } from "./runtime";

const EditorContext = createContext<CanvasEditorRuntime | null>(null);
let editorRuntimeFallback: CanvasEditorRuntime | null = null;

export const configureEditorRuntimeFallbackForTesting = (
  editor: CanvasEditorRuntime | null
) => {
  editorRuntimeFallback = editor;
};

export const EditorProvider = ({
  editor,
  children,
}: {
  editor: CanvasEditorRuntime;
  children: ReactNode;
}) => <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>;

export const useEditor = () => {
  const editor = useContext(EditorContext) ?? editorRuntimeFallback;
  if (!editor) throw new Error("useEditor must be used within EditorProvider");
  return editor;
};

export const useEditorKeymapSnapshot = () => {
  const editor = useEditor();
  const subscribe = useCallback(
    (listener: () => void) => editor.keymap.subscribe(listener),
    [editor]
  );
  const getSnapshot = useCallback(() => editor.keymap.getSnapshot(), [editor]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const useEditorValue = <Selected,>(
  selector: (state: Readonly<CanvasState>) => Selected,
  isEqual: (left: Selected, right: Selected) => boolean = Object.is
) => {
  const editor = useEditor();
  const cache = useRef<{ state: Readonly<CanvasState>; value: Selected } | null>(null);
  const getSnapshot = useCallback(() => {
    const state = editor.getState();
    const previous = cache.current;
    if (previous?.state === state) return previous.value;
    const value = selector(state);
    if (previous && isEqual(previous.value, value)) {
      cache.current = { state, value: previous.value };
      return previous.value;
    }
    cache.current = { state, value };
    return value;
  }, [editor, isEqual, selector]);

  return useSyncExternalStore(editor.subscribe, getSnapshot, getSnapshot);
};
