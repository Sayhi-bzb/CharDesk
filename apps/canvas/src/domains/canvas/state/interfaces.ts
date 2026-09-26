import type { Point } from "@/shared/types";
import type { CanvasMode } from "@/domains/sessions/public";
import type { ToolType } from "../model/tool";
import type { CanvasSessionDescriptor } from "@/domains/sessions/public";
import type { SlideDeckDescriptor } from "@/domains/slides/public";
import type { CanvasSurfaceReader } from "../cell-plane/model";
import type { CanvasInteractionSnapshot } from "./canvasInteractionState";

export type CanvasContentSurfaceState = Readonly<{
  reader: CanvasSurfaceReader;
  revision: number;
}>;

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
  slideDeck: SlideDeckDescriptor | null;
  canUndo: boolean;
  canRedo: boolean;
};

/** Read-only shape exposed to Canvas consumers. Mutations live in canvasCommands. */
export type CanvasState = EditorState;

/** Zustand-compatible read port. The mutable Store remains inside CanvasRuntime. */
export interface CanvasStateStore {
  getState(): CanvasState;
  getInitialState(): CanvasState;
  subscribe(
    listener: (state: CanvasState, previousState: CanvasState) => void
  ): () => void;
}
