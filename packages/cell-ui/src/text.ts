import { ChangeSet, EditorSelection, EditorState, Text as CodeMirrorText } from "@codemirror/state";
import {
  getGraphemeCellWidth,
  iterateGraphemes,
  segmentGraphemes,
} from "@chardesk/protocol";
import type { CellPoint, CellRect, WidgetId } from "./types.js";

export type CellTextSelection = Readonly<{ anchor: number; head: number }>;
export type CellTextComposition = Readonly<{
  from: number;
  to: number;
  text: string;
}>;

export type CellTextSnapshot = Readonly<{
  value: string;
  selection: CellTextSelection;
  composition: CellTextComposition | null;
  scrollX: number;
  scrollY: number;
  revision: number;
  viewport?: Readonly<{ columns: number; rows: number }>;
}>;

export type CellTextCommand =
  | Readonly<{ type: "set-viewport"; columns: number; rows: number }>
  | Readonly<{ type: "insert"; text: string; source?: "input" | "paste" }>
  | Readonly<{ type: "replace-range"; from: number; to: number; text: string }>
  | Readonly<{ type: "delete"; direction: "backward" | "forward" }>
  | Readonly<{
      type: "move";
      direction: "left" | "right" | "up" | "down" | "line-start" | "line-end";
      extend?: boolean;
    }>
  | Readonly<{ type: "set-selection"; anchor: number; head?: number }>
  | Readonly<{ type: "select-all" }>
  | Readonly<{ type: "composition-start" }>
  | Readonly<{ type: "composition-update"; text: string }>
  | Readonly<{ type: "composition-commit"; text: string }>
  | Readonly<{ type: "composition-cancel" }>
  | Readonly<{ type: "undo" | "redo" }>
  | Readonly<{ type: "replace-document"; value: string }>
  | Readonly<{ type: "set-scroll"; x?: number; y?: number }>;

export type CellTextEditorOptions = Readonly<{
  value?: string;
  multiline?: boolean;
  viewport?: Readonly<{ columns: number; rows: number }>;
}>;

type HistoryEntry = Readonly<{
  undo: ChangeSet;
  redo: ChangeSet;
  before: CellTextSelection;
  after: CellTextSelection;
}>;

const selectionOf = (state: EditorState): CellTextSelection => ({
  anchor: state.selection.main.anchor,
  head: state.selection.main.head,
});

const normalizeValue = (value: string, multiline: boolean): string => {
  const normalized = value.replace(/\r\n?/g, "\n");
  return multiline ? normalized : normalized.replace(/\n+/g, " ");
};

const boundaries = (value: string): readonly number[] => {
  const result = [0];
  for (const { index, segment } of segmentGraphemes(value)) {
    const end = index + segment.length;
    if (end !== result.at(-1)) result.push(end);
  }
  return result;
};

type PreparedCellText = Readonly<{
  doc: CodeMirrorText;
  widths: readonly number[];
  maxWidth: number;
}>;

const snapshotPreparation = new WeakMap<CellTextSnapshot, PreparedCellText>();
const layoutPreparation = new WeakMap<CellTextLayoutSnapshot, PreparedCellText>();
const externalPreparation = new Map<string, PreparedCellText>();
const EXTERNAL_PREPARATION_LIMIT = 4;

const graphemeWidthAt = (segment: string, column: number) =>
  segment === "\t" ? 4 - (column % 4) : getGraphemeCellWidth(segment);

const lineWidth = (value: string): number => {
  let column = 0;
  for (const { segment } of iterateGraphemes(value)) column += graphemeWidthAt(segment, column);
  return column;
};

const prepareDocument = (doc: CodeMirrorText): PreparedCellText => {
  const widths = Array.from({ length: doc.lines }, (_, index) => lineWidth(doc.line(index + 1).text));
  let maxWidth = 0;
  for (const width of widths) maxWidth = Math.max(maxWidth, width);
  return { doc, widths, maxWidth };
};

const updatePreparedDocument = (
  previous: PreparedCellText,
  doc: CodeMirrorText,
  changes: ChangeSet,
): PreparedCellText => {
  if (changes.empty) return previous;
  let oldStart = previous.doc.lines;
  let oldEnd = 0;
  let newStart = doc.lines;
  let newEnd = 0;
  changes.iterChanges((fromA, toA, fromB, toB) => {
    oldStart = Math.min(oldStart, previous.doc.lineAt(fromA).number);
    oldEnd = Math.max(oldEnd, previous.doc.lineAt(toA).number);
    newStart = Math.min(newStart, doc.lineAt(fromB).number);
    newEnd = Math.max(newEnd, doc.lineAt(toB).number);
  });
  const widths = [
    ...previous.widths.slice(0, oldStart - 1),
    ...Array.from({ length: newEnd - newStart + 1 }, (_, index) => lineWidth(doc.line(newStart + index).text)),
    ...previous.widths.slice(oldEnd),
  ];
  if (widths.length !== doc.lines) return prepareDocument(doc);
  let maxWidth = 0;
  for (const width of widths) maxWidth = Math.max(maxWidth, width);
  return { doc, widths, maxWidth };
};

const preparedFor = (snapshot: CellTextSnapshot): PreparedCellText => {
  const associated = snapshotPreparation.get(snapshot);
  if (associated) return associated;
  const value = presentation(snapshot).value;
  const cached = externalPreparation.get(value);
  if (cached) {
    externalPreparation.delete(value);
    externalPreparation.set(value, cached);
    snapshotPreparation.set(snapshot, cached);
    return cached;
  }
  const prepared = prepareDocument(CodeMirrorText.of(value.split("\n")));
  externalPreparation.set(value, prepared);
  if (externalPreparation.size > EXTERNAL_PREPARATION_LIMIT) {
    externalPreparation.delete(externalPreparation.keys().next().value!);
  }
  snapshotPreparation.set(snapshot, prepared);
  return prepared;
};

/** Preserve derived text data when a browser preview changes only the viewport. */
export const withCellTextScroll = (snapshot: CellTextSnapshot, scrollX: number, scrollY: number): CellTextSnapshot => {
  const next = { ...snapshot, scrollX, scrollY };
  snapshotPreparation.set(next, preparedFor(snapshot));
  return next;
};

const documentOffset = (doc: CodeMirrorText, offset: number, affinity: "backward" | "forward") => {
  const clamped = Math.max(0, Math.min(doc.length, Math.trunc(offset)));
  const line = doc.lineAt(clamped);
  return line.from + normalizeGraphemeOffset(line.text, clamped - line.from, affinity);
};

export const normalizeGraphemeOffset = (
  value: string,
  offset: number,
  affinity: "backward" | "forward" = "backward"
): number => {
  const clamped = Math.max(0, Math.min(value.length, Math.trunc(offset)));
  const points = boundaries(value);
  if (points.includes(clamped)) return clamped;
  if (affinity === "forward") return points.find((point) => point > clamped) ?? value.length;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]!;
    if (point < clamped) return point;
  }
  return 0;
};

type LogicalLine = ReturnType<CodeMirrorText["line"]>;

const columnAt = (line: LogicalLine, offset: number): number => {
  let column = 0;
  for (const { index, segment } of iterateGraphemes(line.text)) {
    if (line.from + index >= offset) break;
    column += graphemeWidthAt(segment, column);
  }
  return column;
};

const offsetAtColumn = (line: LogicalLine, target: number): number => {
  let column = 0;
  for (const { index, segment } of iterateGraphemes(line.text)) {
    const from = line.from + index;
    const width = graphemeWidthAt(segment, column);
    if (target <= column) return from;
    if (target < column + width) {
      return target - column >= width / 2 ? from + segment.length : from;
    }
    column += width;
  }
  return line.to;
};

const presentation = (snapshot: CellTextSnapshot) => {
  const composition = snapshot.composition;
  if (!composition) {
    return { value: snapshot.value, caret: snapshot.selection.head, compositionRange: null };
  }
  const value = snapshot.value.slice(0, composition.from)
    + composition.text
    + snapshot.value.slice(composition.to);
  return {
    value,
    caret: composition.from + composition.text.length,
    compositionRange: {
      from: composition.from,
      to: composition.from + composition.text.length,
    },
  };
};

export const measureCellText = (snapshot: CellTextSnapshot) => {
  const prepared = preparedFor(snapshot);
  return {
    width: prepared.maxWidth + 1,
    height: prepared.doc.lines,
  };
};

export class CellTextEditor {
  readonly #multiline: boolean;
  #viewport: Readonly<{ columns: number; rows: number }>;
  #state: EditorState;
  #value: string;
  #prepared: PreparedCellText;
  #compositionPrepared: PreparedCellText | null = null;
  #compositionPreparedFor: CellTextComposition | null = null;
  #composition: CellTextComposition | null = null;
  #scrollX = 0;
  #scrollY = 0;
  #revision = 0;
  #desiredColumn: number | null = null;
  #done: HistoryEntry[] = [];
  #undone: HistoryEntry[] = [];

  constructor(options: CellTextEditorOptions = {}) {
    this.#multiline = options.multiline ?? false;
    this.#viewport = {
      columns: Math.max(1, Math.trunc(options.viewport?.columns ?? 20)),
      rows: Math.max(1, Math.trunc(options.viewport?.rows ?? 1)),
    };
    this.#value = normalizeValue(options.value ?? "", this.#multiline);
    this.#state = EditorState.create({
      doc: this.#value,
      selection: EditorSelection.cursor(0),
    });
    this.#prepared = prepareDocument(this.#state.doc);
  }

  snapshot(): CellTextSnapshot {
    const snapshot: CellTextSnapshot = {
      value: this.#value,
      selection: selectionOf(this.#state),
      composition: this.#composition,
      scrollX: this.#scrollX,
      scrollY: this.#scrollY,
      revision: this.#revision,
      viewport: this.#viewport,
    };
    if (this.#composition && this.#compositionPreparedFor !== this.#composition) {
      const { from, to, text } = this.#composition;
      const changes = ChangeSet.of([{ from, to, insert: text }], this.#prepared.doc.length);
      this.#compositionPrepared = updatePreparedDocument(this.#prepared, changes.apply(this.#prepared.doc), changes);
      this.#compositionPreparedFor = this.#composition;
    }
    snapshotPreparation.set(snapshot, this.#composition ? this.#compositionPrepared! : this.#prepared);
    return snapshot;
  }

  dispatch(command: CellTextCommand): CellTextSnapshot {
    if (command.type === "set-viewport") {
      const { columns, rows } = command;
      if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
        throw new RangeError("Text viewport must use positive integer Cells.");
      }
      if (columns === this.#viewport.columns && rows === this.#viewport.rows) return this.snapshot();
      this.#viewport = { columns, rows };
      return this.#changed(true);
    }
    const value = this.#value;
    const selection = selectionOf(this.#state);
    if (command.type === "composition-start") {
      this.#composition = {
        from: Math.min(selection.anchor, selection.head),
        to: Math.max(selection.anchor, selection.head),
        text: "",
      };
      return this.#changed(false);
    }
    if (command.type === "composition-update") {
      if (!this.#composition) this.dispatch({ type: "composition-start" });
      this.#composition = { ...this.#composition!, text: command.text };
      return this.#changed(true);
    }
    if (command.type === "composition-cancel") {
      this.#composition = null;
      return this.#changed(false);
    }
    if (command.type === "composition-commit") {
      const composition = this.#composition ?? {
        from: Math.min(selection.anchor, selection.head),
        to: Math.max(selection.anchor, selection.head),
        text: "",
      };
      this.#composition = null;
      return this.#replace(composition.from, composition.to, command.text, true);
    }
    if (command.type === "replace-document") {
      const next = normalizeValue(command.value, this.#multiline);
      this.#state = EditorState.create({
        doc: next,
        selection: EditorSelection.cursor(next.length),
      });
      this.#value = next;
      this.#prepared = prepareDocument(this.#state.doc);
      this.#compositionPrepared = null;
      this.#compositionPreparedFor = null;
      this.#done = [];
      this.#undone = [];
      return this.#changed(true);
    }
    if (command.type === "undo" || command.type === "redo") {
      return this.#history(command.type);
    }
    if (command.type === "set-scroll") {
      this.#scrollX = Math.max(0, Math.trunc(command.x ?? this.#scrollX));
      this.#scrollY = Math.max(0, Math.trunc(command.y ?? this.#scrollY));
      return this.#changed(false);
    }
    if (command.type === "select-all") {
      return this.#select(0, value.length);
    }
    if (command.type === "set-selection") {
      return this.#select(command.anchor, command.head ?? command.anchor);
    }
    if (command.type === "insert") {
      const text = normalizeValue(command.text, this.#multiline);
      return this.#replace(
        Math.min(selection.anchor, selection.head),
        Math.max(selection.anchor, selection.head),
        text,
        true
      );
    }
    if (command.type === "replace-range") {
      return this.#replace(command.from, command.to, command.text, true);
    }
    if (command.type === "delete") {
      const from = Math.min(selection.anchor, selection.head);
      const to = Math.max(selection.anchor, selection.head);
      if (from !== to) return this.#replace(from, to, "", true);
      const other = command.direction === "backward"
        ? documentOffset(this.#state.doc, selection.head - 1, "backward")
        : documentOffset(this.#state.doc, selection.head + 1, "forward");
      return this.#replace(Math.min(other, selection.head), Math.max(other, selection.head), "", true);
    }
    if (command.type === "move") {
      return this.#move(command.direction, command.extend ?? false);
    }
    return this.snapshot();
  }

  #replace(from: number, to: number, insert: string, addToHistory: boolean) {
    const safeFrom = documentOffset(this.#state.doc, from, "backward");
    const safeTo = documentOffset(this.#state.doc, to, "forward");
    const normalized = normalizeValue(insert, this.#multiline);
    const before = selectionOf(this.#state);
    const transaction = this.#state.update({
      changes: { from: safeFrom, to: safeTo, insert: normalized },
      selection: EditorSelection.cursor(safeFrom + normalized.length),
    });
    if (addToHistory && !transaction.changes.empty) {
      this.#done.push({
        undo: transaction.changes.invert(this.#state.doc),
        redo: transaction.changes,
        before,
        after: { anchor: safeFrom + normalized.length, head: safeFrom + normalized.length },
      });
      this.#undone = [];
    }
    this.#prepared = updatePreparedDocument(this.#prepared, transaction.state.doc, transaction.changes);
    this.#state = transaction.state;
    this.#value = this.#state.doc.toString();
    this.#compositionPrepared = null;
    this.#compositionPreparedFor = null;
    this.#desiredColumn = null;
    return this.#changed(true);
  }

  #select(anchor: number, head: number) {
    const safeAnchor = documentOffset(this.#state.doc, anchor, "backward");
    const safeHead = documentOffset(
      this.#state.doc,
      head,
      head < anchor ? "backward" : "forward"
    );
    this.#state = this.#state.update({
      selection: EditorSelection.single(safeAnchor, safeHead),
    }).state;
    this.#desiredColumn = null;
    return this.#changed(true);
  }

  #move(direction: Extract<CellTextCommand, { type: "move" }>["direction"], extend: boolean) {
    const current = selectionOf(this.#state);
    const head = current.head;
    let next = head;
    if (direction === "left" || direction === "right") {
      next = direction === "left"
        ? documentOffset(this.#state.doc, head - 1, "backward")
        : documentOffset(this.#state.doc, head + 1, "forward");
      this.#desiredColumn = null;
    } else {
      const line = this.#state.doc.lineAt(head);
      if (direction === "line-start") next = line.from;
      else if (direction === "line-end") next = line.to;
      else {
        const targetLine = this.#state.doc.line(Math.max(
          1,
          Math.min(this.#state.doc.lines, line.number + (direction === "up" ? -1 : 1))
        ));
        const desired = this.#desiredColumn ?? columnAt(line, head);
        this.#desiredColumn = desired;
        next = offsetAtColumn(targetLine, desired);
      }
    }
    this.#state = this.#state.update({
      selection: EditorSelection.single(extend ? current.anchor : next, next),
    }).state;
    return this.#changed(true);
  }

  #history(direction: "undo" | "redo") {
    const source = direction === "undo" ? this.#done : this.#undone;
    const target = direction === "undo" ? this.#undone : this.#done;
    const entry = source.pop();
    if (!entry) return this.snapshot();
    const changes = direction === "undo" ? entry.undo : entry.redo;
    const selection = direction === "undo" ? entry.before : entry.after;
    const next = this.#state.update({ changes, selection }).state;
    this.#prepared = updatePreparedDocument(this.#prepared, next.doc, changes);
    this.#state = next;
    this.#value = next.doc.toString();
    this.#compositionPrepared = null;
    this.#compositionPreparedFor = null;
    target.push(entry);
    this.#composition = null;
    return this.#changed(true);
  }

  #changed(reveal: boolean, increment = true): CellTextSnapshot {
    if (increment) this.#revision += 1;
    const extent = measureCellText(this.snapshot());
    this.#scrollX = Math.max(0, Math.min(this.#scrollX, extent.width - this.#viewport.columns));
    this.#scrollY = Math.max(0, Math.min(this.#scrollY, extent.height - this.#viewport.rows));
    if (reveal) this.#revealCaret();
    return this.snapshot();
  }

  #revealCaret(): void {
    const snapshot = this.snapshot();
    const shown = presentation(snapshot);
    const line = preparedFor(snapshot).doc.lineAt(shown.caret);
    const column = columnAt(line, shown.caret);
    if (column < this.#scrollX) this.#scrollX = column;
    else if (column >= this.#scrollX + this.#viewport.columns) {
      this.#scrollX = column - this.#viewport.columns + 1;
    }
    if (line.number - 1 < this.#scrollY) this.#scrollY = line.number - 1;
    else if (line.number - 1 >= this.#scrollY + this.#viewport.rows) {
      this.#scrollY = line.number - this.#viewport.rows;
    }
  }
}

export type CellTextGlyph = Readonly<{
  text: string;
  from: number;
  to: number;
  point: CellPoint;
  width: number;
  selected: boolean;
  composing: boolean;
}>;

export type CellTextLayoutSnapshot = Readonly<{
  id: WidgetId;
  bounds: CellRect;
  contentBounds: CellRect;
  value: string;
  glyphs: readonly CellTextGlyph[];
  caret: CellPoint;
  selection: CellTextSelection;
  scrollX: number;
  scrollY: number;
}>;

export const getCellTextPresentation = presentation;

export const offsetAtCellPoint = (
  layout: CellTextLayoutSnapshot,
  point: CellPoint
): number => {
  const line = point.y - layout.contentBounds.y + layout.scrollY;
  const column = point.x - layout.contentBounds.x + layout.scrollX;
  const glyphs = layout.glyphs.filter((glyph) => glyph.point.y - layout.contentBounds.y + layout.scrollY === line);
  for (const glyph of glyphs) {
    const start = glyph.point.x - layout.contentBounds.x + layout.scrollX;
    if (column <= start) return glyph.from;
    if (column < start + glyph.width) {
      return column - start >= glyph.width / 2 ? glyph.to : glyph.from;
    }
  }
  const doc = layoutPreparation.get(layout)?.doc ?? CodeMirrorText.of(layout.value.split("\n"));
  return doc.line(Math.max(1, Math.min(doc.lines, line + 1))).to;
};

const createTextLayout = (
  id: WidgetId,
  bounds: CellRect,
  contentBounds: CellRect,
  snapshot: CellTextSnapshot,
  visibleOnly: boolean,
): CellTextLayoutSnapshot => {
  const shown = presentation(snapshot);
  const prepared = preparedFor(snapshot);
  const selectionFrom = Math.min(snapshot.selection.anchor, snapshot.selection.head);
  const selectionTo = Math.max(snapshot.selection.anchor, snapshot.selection.head);
  const glyphs: CellTextGlyph[] = [];
  const caretLine = prepared.doc.lineAt(shown.caret);
  const caret = {
    x: contentBounds.x + columnAt(caretLine, shown.caret) - snapshot.scrollX,
    y: contentBounds.y + caretLine.number - 1 - snapshot.scrollY,
  };
  const first = visibleOnly ? Math.max(1, snapshot.scrollY + 1) : 1;
  const last = visibleOnly
    ? Math.min(prepared.doc.lines, snapshot.scrollY + contentBounds.height)
    : prepared.doc.lines;
  for (let number = first; number <= last; number += 1) {
    const line = prepared.doc.line(number);
    let column = 0;
    for (const { index, segment } of iterateGraphemes(line.text)) {
      const from = line.from + index;
      const to = from + segment.length;
      const width = graphemeWidthAt(segment, column);
      const point = {
        x: contentBounds.x + column - snapshot.scrollX,
        y: contentBounds.y + line.number - 1 - snapshot.scrollY,
      };
      if (!visibleOnly || (point.x + width > contentBounds.x
        && point.x < contentBounds.x + contentBounds.width)) {
        glyphs.push({
          text: segment,
          from,
          to,
          point,
          width,
          selected: !snapshot.composition && from < selectionTo && to > selectionFrom,
          composing: !!shown.compositionRange
            && from < shown.compositionRange.to
            && to > shown.compositionRange.from,
        });
      }
      column += width;
    }
  }
  const layout = {
    id,
    bounds,
    contentBounds,
    value: shown.value,
    glyphs,
    caret,
    selection: snapshot.selection,
    scrollX: snapshot.scrollX,
    scrollY: snapshot.scrollY,
  };
  layoutPreparation.set(layout, prepared);
  return layout;
};

/** The public helper keeps its complete-glyph projection for source consumers. */
export const createCellTextLayout = (
  id: WidgetId, bounds: CellRect, contentBounds: CellRect, snapshot: CellTextSnapshot,
): CellTextLayoutSnapshot => createTextLayout(id, bounds, contentBounds, snapshot, false);

/** Runtime painting only needs the Cells that can intersect the editor viewport. */
export const createVisibleCellTextLayout = (
  id: WidgetId, bounds: CellRect, contentBounds: CellRect, snapshot: CellTextSnapshot,
): CellTextLayoutSnapshot => createTextLayout(id, bounds, contentBounds, snapshot, true);
