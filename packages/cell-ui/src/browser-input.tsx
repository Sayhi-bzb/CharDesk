/* eslint-disable react-refresh/only-export-components */
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type CompositionEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import type { CharDeskCanvasMetrics } from "@chardesk/rendering/canvas";
import type { WidgetCommand } from "./interaction.js";
import {
  CellTextEditor,
  getCellTextPresentation,
  type CellTextCommand,
  type CellTextEditorOptions,
  type CellTextSnapshot,
} from "./text.js";
import type { FrameSnapshot, WidgetId, WidgetNode } from "./types.js";

export type CellTextState = Readonly<{
  snapshot: CellTextSnapshot;
  dispatch: (command: WidgetCommand) => void;
}>;

export const useCellTextState = (
  targetId: WidgetId,
  options: CellTextEditorOptions & Readonly<{
    onChange?: (value: string, snapshot: CellTextSnapshot) => void;
  }> = {}
): CellTextState => {
  const [editor] = useState(() => new CellTextEditor(options));
  const [snapshot, setSnapshot] = useState(() => editor.snapshot());
  const onChange = options.onChange;
  const dispatch = useCallback((command: WidgetCommand) => {
    if (command.type !== "text" || command.targetId !== targetId) return;
    const before = editor.snapshot();
    const next = editor.dispatch(command.command);
    setSnapshot(next);
    if (next.value !== before.value) onChange?.(next.value, next);
  }, [editor, onChange, targetId]);
  return { snapshot, dispatch };
};

const commandForKey = (
  event: KeyboardEvent<HTMLTextAreaElement>,
  multiline: boolean
): CellTextCommand | null => {
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && event.key.toLowerCase() === "a") return { type: "select-all" };
  if (modifier && event.key.toLowerCase() === "z") {
    return { type: event.shiftKey ? "redo" : "undo" };
  }
  if (modifier && event.key.toLowerCase() === "y") return { type: "redo" };
  if (event.key === "ArrowLeft") return { type: "move", direction: "left", extend: event.shiftKey };
  if (event.key === "ArrowRight") return { type: "move", direction: "right", extend: event.shiftKey };
  if (event.key === "ArrowUp") return { type: "move", direction: "up", extend: event.shiftKey };
  if (event.key === "ArrowDown") return { type: "move", direction: "down", extend: event.shiftKey };
  if (event.key === "Home") return { type: "move", direction: "line-start", extend: event.shiftKey };
  if (event.key === "End") return { type: "move", direction: "line-end", extend: event.shiftKey };
  if (event.key === "Enter" && multiline) return { type: "insert", text: "\n" };
  return null;
};

const commandForBeforeInput = (event: InputEvent): CellTextCommand | null => {
  if (event.inputType === "insertText" && event.data !== null) {
    return { type: "insert", text: event.data };
  }
  if (event.inputType === "insertLineBreak" || event.inputType === "insertParagraph") {
    return { type: "insert", text: "\n" };
  }
  if (event.inputType === "deleteContentBackward") return { type: "delete", direction: "backward" };
  if (event.inputType === "deleteContentForward") return { type: "delete", direction: "forward" };
  if (event.inputType === "historyUndo") return { type: "undo" };
  if (event.inputType === "historyRedo") return { type: "redo" };
  return null;
};

const diffCommand = (before: string, after: string): CellTextCommand | null => {
  if (before === after) return null;
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from += 1;
  let beforeTo = before.length;
  let afterTo = after.length;
  while (beforeTo > from && afterTo > from && before[beforeTo - 1] === after[afterTo - 1]) {
    beforeTo -= 1;
    afterTo -= 1;
  }
  return { type: "replace-range", from, to: beforeTo, text: after.slice(from, afterTo) };
};

const changesDocument = (command: CellTextCommand) =>
  command.type === "insert"
  || command.type === "replace-range"
  || command.type === "delete"
  || command.type === "composition-start"
  || command.type === "composition-update"
  || command.type === "composition-commit"
  || command.type === "composition-cancel"
  || command.type === "undo"
  || command.type === "redo"
  || command.type === "replace-document";

const baseTextareaStyle: CSSProperties = {
  position: "absolute",
  zIndex: 1,
  padding: 0,
  margin: 0,
  border: 0,
  outline: 0,
  resize: "none",
  overflow: "hidden",
  color: "transparent",
  background: "transparent",
  caretColor: "transparent",
  cursor: "default",
  opacity: 0.02,
  whiteSpace: "pre",
};

type ManagedCellTextareaProps = Readonly<{
  node: WidgetNode;
  frame: FrameSnapshot;
  metrics: CharDeskCanvasMetrics;
  dispatch: (command: WidgetCommand) => void;
  focusTarget: (id: WidgetId) => void;
}>;

const ManagedCellTextarea = ({
  node,
  frame,
  metrics,
  dispatch,
  focusTarget,
}: ManagedCellTextareaProps) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const composing = useRef(false);
  const finalized = useRef<string | null>(null);
  const snapshot = node.textEditor!;
  const layout = frame.textLayouts.get(node.id)!;
  const inputBounds = frame.scene.entries.get(node.id)!.contentClip;
  const multiline = node.kind === "text-area";
  const shown = getCellTextPresentation(snapshot);

  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea || composing.current) return;
    if (textarea.value !== snapshot.value) textarea.value = snapshot.value;
    textarea.setSelectionRange(snapshot.selection.anchor, snapshot.selection.head);
  }, [snapshot]);

  const send = (command: CellTextCommand) => {
    if (node.disabled || (node.readOnly && changesDocument(command))) return;
    dispatch({ type: "text", targetId: node.id, command });
  };

  const onBeforeInput = (event: FormEvent<HTMLTextAreaElement>) => {
    const native = event.nativeEvent as InputEvent;
    if (native.isComposing || composing.current) return;
    const command = commandForBeforeInput(native);
    if (!command) return;
    event.preventDefault();
    send(command);
  };

  const onInput = (event: FormEvent<HTMLTextAreaElement>) => {
    const native = event.nativeEvent as InputEvent;
    if (native.isComposing || composing.current) return;
    if (finalized.current !== null) {
      const compositionText = finalized.current;
      finalized.current = null;
      if (native.data === compositionText && event.currentTarget.value === snapshot.value) return;
    }
    const command = diffCommand(snapshot.value, event.currentTarget.value);
    if (command) send(command);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!multiline && event.key === "Enter") {
      event.preventDefault();
      dispatch({ type: "activate", targetId: node.id });
      return;
    }
    const command = commandForKey(event, multiline);
    if (!command) return;
    event.preventDefault();
    send(command);
  };

  const onCopy = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const from = Math.min(snapshot.selection.anchor, snapshot.selection.head);
    const to = Math.max(snapshot.selection.anchor, snapshot.selection.head);
    if (from === to) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", snapshot.value.slice(from, to));
  };

  const onCut = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    onCopy(event);
    if (!node.disabled && !node.readOnly && snapshot.selection.anchor !== snapshot.selection.head) {
      send({ type: "insert", text: "" });
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (node.disabled || node.readOnly) return;
    event.preventDefault();
    send({ type: "insert", text: event.clipboardData.getData("text/plain"), source: "paste" });
  };

  return (
    <textarea
      ref={ref}
      data-cell-text-editor={node.id}
      aria-label={node.label ?? (multiline ? "Text area" : "Text input")}
      aria-multiline={multiline || undefined}
      disabled={node.disabled}
      readOnly={node.readOnly}
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      style={{
        ...baseTextareaStyle,
        left: Math.max(inputBounds.x, Math.min(layout.caret.x, inputBounds.x + inputBounds.width - 1)) * metrics.cellWidth,
        top: Math.max(inputBounds.y, Math.min(layout.caret.y, inputBounds.y + inputBounds.height - 1)) * metrics.cellHeight,
        width: Math.min(1, inputBounds.width) * metrics.cellWidth,
        height: Math.min(1, inputBounds.height) * metrics.cellHeight,
        fontSize: metrics.fontSize,
      }}
      defaultValue={shown.value}
      onFocus={() => focusTarget(node.id)}
      onBeforeInput={onBeforeInput}
      onInput={onInput}
      onKeyDown={onKeyDown}
      onCopy={onCopy}
      onCut={onCut}
      onPaste={onPaste}
      onCompositionStart={() => {
        if (node.disabled || node.readOnly) return;
        composing.current = true;
        send({ type: "composition-start" });
      }}
      onCompositionUpdate={(event: CompositionEvent<HTMLTextAreaElement>) => {
        send({ type: "composition-update", text: event.data });
      }}
      onCompositionEnd={(event: CompositionEvent<HTMLTextAreaElement>) => {
        composing.current = false;
        if (node.disabled || node.readOnly) return;
        finalized.current = event.data;
        send({ type: "composition-commit", text: event.data });
      }}
    />
  );
};

export const CellTextInputLayer = ({
  frame,
  metrics,
  dispatch,
  focusTarget,
}: Readonly<{
  frame: FrameSnapshot;
  metrics: CharDeskCanvasMetrics;
  dispatch: (command: WidgetCommand) => void;
  focusTarget: (id: WidgetId) => void;
}>) => (
  <>
    {[...frame.tree.nodes.values()]
      .filter((node) => (
        node.textEditor
        && frame.textLayouts.has(node.id)
        && frame.semantics.nodes.has(node.id)
      ))
      .map((node) => (
        <ManagedCellTextarea
          key={node.id}
          node={node}
          frame={frame}
          metrics={metrics}
          dispatch={dispatch}
          focusTarget={focusTarget}
        />
      ))}
  </>
);
