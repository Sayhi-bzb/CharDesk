import type { Point, TextAttributes } from "@/shared/types";
import type { CanvasMode } from "@/domains/sessions/public";
import type { ToolType } from "../model/tool";
import type { CanvasSessionDescriptor } from "@/domains/sessions/public";
import type { SessionCommands } from "@/domains/sessions/public";
import type { SlideDeckDescriptor, SlideSize } from "@/domains/slides/public";
import type { CanvasSurfaceReader } from "../cell-plane/model";
import type { CanvasInteractionSnapshot } from "./canvasInteractionState";

export type CanvasContentSurfaceState = Readonly<{
  reader: CanvasSurfaceReader;
  revision: number;
}>;

export interface RichTextCell {
  x: number;
  y: number;
  char: string;
  color: string;
  bgColor?: string;
  attrs?: TextAttributes;
  href?: string;
}

export interface RichTextSpan extends Omit<RichTextCell, "y" | "char"> {
  text: string;
  width: number;
}

export interface RichTextRow {
  y: number;
  spans: RichTextSpan[];
}

export type ClipboardCommandResult =
  | { status: "applied"; changed: boolean }
  | {
      status: "noop";
      reason: "empty-source" | "empty-clipboard" | "unsupported-data";
    }
  | {
      status: "failed";
      reason: "clipboard-failed" | "stale-target";
    };

export interface DrawingSlice {
  clearCanvas: () => void;
}

export interface SlideSlice {
  slideDeck: SlideDeckDescriptor | null;
  addSlide: () => void;
  duplicateSlide: (slideId: string) => void;
  removeSlide: (slideId: string) => void;
  renameSlide: (slideId: string, name: string) => void;
  moveSlide: (slideId: string, targetIndex: number) => void;
  activateSlide: (slideId: string) => void;
  resizeSlide: (slideId: string, size: SlideSize) => void;
}

export interface TextSlice {
  writeTextString: (
    str: string,
    startPos?: Point,
    options?: {
      preserveTargetBackground?: boolean;
      selectResult?: boolean;
    }
  ) => void;
  pasteRichData: (
    cells: RichTextCell[],
    startPos?: Point,
    options?: { selectResult?: boolean }
  ) => void;
  pasteRichRows: (
    rows: readonly RichTextRow[],
    startPos?: Point,
    options?: { selectResult?: boolean }
  ) => void;
  moveTextCursor: (dx: number, dy: number) => void;
  newlineText: () => void;
  indentText: () => void;
}

export type CanvasViewportState = {
  offset: Point;
  zoom: number;
};

export type PendingCanvasCameraPlacement = {
  sessionId: string;
  kind: "content-start";
};

export type EditorState = {
  /** Atomic, page-scoped interaction authority. */
  interaction: CanvasInteractionSnapshot;
  tool: ToolType;
  canvasMode: CanvasMode;
  brushChar: string;
  brushColor: string;
  brushBackgroundColor: string;
  contentSurface: CanvasContentSurfaceState;
  showGrid: boolean;
  exportShowGrid: boolean;
  canvasSessions: CanvasSessionDescriptor[];
  activeCanvasId: string;
  canUndo: boolean;
  canRedo: boolean;
} & DrawingSlice &
  SlideSlice &
  TextSlice &
  SessionCommands;

type FunctionPropertyKeys<T> = {
  [Key in keyof T]-?: T[Key] extends (...args: never[]) => unknown
    ? Key
    : never;
}[keyof T];

/** Read-only shape exposed to Canvas consumers. Mutations live in canvasCommands. */
export type CanvasState = Omit<EditorState, FunctionPropertyKeys<EditorState>>;
