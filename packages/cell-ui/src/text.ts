import { ChangeSet, EditorSelection, EditorState } from "@codemirror/state";
import {
  getGraphemeCellWidth,
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

type LogicalLine = Readonly<{ from: number; to: number; number: number }>;

const logicalLines = (value: string): readonly LogicalLine[] => {
  const lines: LogicalLine[] = [];
  let from = 0;
  let number = 0;
  for (let index = 0; index <= value.length; index += 1) {
    if (index !== value.length && value[index] !== "\n") continue;
    lines.push({ from, to: index, number });
    from = index + 1;
    number += 1;
  }
  return lines;
};

const lineAt = (value: string, offset: number): LogicalLine => {
  const lines = logicalLines(value);
  return lines.find((line) => offset >= line.from && offset <= line.to)
    ?? lines.at(-1)!;
};

const graphemeWidthAt = (segment: string, column: number) =>
  segment === "\t" ? 4 - (column % 4) : getGraphemeCellWidth(segment);

const columnAt = (value: string, line: LogicalLine, offset: number): number => {
  let column = 0;
  for (const { index, segment } of segmentGraphemes(value.slice(line.from, line.to))) {
    if (line.from + index >= offset) break;
    column += graphemeWidthAt(segment, column);
  }
  return column;
};

const offsetAtColumn = (value: string, line: LogicalLine, target: number): number => {
  let column = 0;
  for (const { index, segment } of segmentGraphemes(value.slice(line.from, line.to))) {
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

export class CellTextEditor {
  readonly #multiline: boolean;
  #viewport: Readonly<{ columns: number; rows: number }>;
  #state: EditorState;
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
    this.#state = EditorState.create({
      doc: normalizeValue(options.value ?? "", this.#multiline),
      selection: EditorSelection.cursor(0),
    });
  }

  snapshot(): CellTextSnapshot {
    return {
      value: this.#state.doc.toString(),
      selection: selectionOf(this.#state),
      composition: this.#composition,
      scrollX: this.#scrollX,
      scrollY: this.#scrollY,
      revision: this.#revision,
      viewport: this.#viewport,
    };
  }

  dispatch(command: CellTextCommand): CellTextSnapshot {
    if (command.type === "set-viewport") {
      const { columns, rows } = command;
      if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
        throw new RangeError("Text viewport must use positive integer Cells.");
      }
      if (columns === this.#viewport.columns && rows === this.#viewport.rows) return this.snapshot();
      this.#viewport = { columns, rows };
      this.#scrollX = 0;
      this.#scrollY = 0;
      return this.#changed(true);
    }
    const value = this.#state.doc.toString();
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
      const points = boundaries(value);
      const index = points.indexOf(selection.head);
      const other = command.direction === "backward"
        ? points[Math.max(0, index - 1)]!
        : points[Math.min(points.length - 1, index + 1)]!;
      return this.#replace(Math.min(other, selection.head), Math.max(other, selection.head), "", true);
    }
    if (command.type === "move") {
      return this.#move(command.direction, command.extend ?? false);
    }
    return this.snapshot();
  }

  #replace(from: number, to: number, insert: string, addToHistory: boolean) {
    const value = this.#state.doc.toString();
    const safeFrom = normalizeGraphemeOffset(value, from, "backward");
    const safeTo = normalizeGraphemeOffset(value, to, "forward");
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
    this.#state = transaction.state;
    this.#desiredColumn = null;
    return this.#changed(true);
  }

  #select(anchor: number, head: number) {
    const value = this.#state.doc.toString();
    const safeAnchor = normalizeGraphemeOffset(value, anchor, "backward");
    const safeHead = normalizeGraphemeOffset(
      value,
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
    const value = this.#state.doc.toString();
    const current = selectionOf(this.#state);
    const head = current.head;
    let next = head;
    if (direction === "left" || direction === "right") {
      const points = boundaries(value);
      const index = points.indexOf(head);
      next = direction === "left"
        ? points[Math.max(0, index - 1)]!
        : points[Math.min(points.length - 1, index + 1)]!;
      this.#desiredColumn = null;
    } else {
      const line = lineAt(value, head);
      if (direction === "line-start") next = line.from;
      else if (direction === "line-end") next = line.to;
      else {
        const lines = logicalLines(value);
        const targetLine = lines[Math.max(
          0,
          Math.min(lines.length - 1, line.number + (direction === "up" ? -1 : 1))
        )]!;
        const desired = this.#desiredColumn ?? columnAt(value, line, head);
        this.#desiredColumn = desired;
        next = offsetAtColumn(value, targetLine, desired);
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
    this.#state = this.#state.update({ changes, selection }).state;
    target.push(entry);
    this.#composition = null;
    return this.#changed(true);
  }

  #changed(reveal: boolean, increment = true): CellTextSnapshot {
    if (increment) this.#revision += 1;
    if (reveal) this.#revealCaret();
    return this.snapshot();
  }

  #revealCaret(): void {
    const snapshot = this.snapshot();
    const shown = presentation(snapshot);
    const line = lineAt(shown.value, shown.caret);
    const column = columnAt(shown.value, line, shown.caret);
    if (column < this.#scrollX) this.#scrollX = column;
    else if (column >= this.#scrollX + this.#viewport.columns) {
      this.#scrollX = column - this.#viewport.columns + 1;
    }
    if (line.number < this.#scrollY) this.#scrollY = line.number;
    else if (line.number >= this.#scrollY + this.#viewport.rows) {
      this.#scrollY = line.number - this.#viewport.rows + 1;
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
  const lines = logicalLines(layout.value);
  return lines[Math.max(0, Math.min(lines.length - 1, line))]?.to ?? layout.value.length;
};

export const createCellTextLayout = (
  id: WidgetId,
  bounds: CellRect,
  contentBounds: CellRect,
  snapshot: CellTextSnapshot
): CellTextLayoutSnapshot => {
  const shown = presentation(snapshot);
  const selectionFrom = Math.min(snapshot.selection.anchor, snapshot.selection.head);
  const selectionTo = Math.max(snapshot.selection.anchor, snapshot.selection.head);
  const glyphs: CellTextGlyph[] = [];
  let caret = { x: contentBounds.x, y: contentBounds.y };
  for (const line of logicalLines(shown.value)) {
    let column = 0;
    for (const { index, segment } of segmentGraphemes(shown.value.slice(line.from, line.to))) {
      const from = line.from + index;
      const to = from + segment.length;
      const width = graphemeWidthAt(segment, column);
      const point = {
        x: contentBounds.x + column - snapshot.scrollX,
        y: contentBounds.y + line.number - snapshot.scrollY,
      };
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
      column += width;
    }
    if (shown.caret >= line.from && shown.caret <= line.to) {
      caret = {
        x: contentBounds.x + columnAt(shown.value, line, shown.caret) - snapshot.scrollX,
        y: contentBounds.y + line.number - snapshot.scrollY,
      };
    }
  }
  return {
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
};
