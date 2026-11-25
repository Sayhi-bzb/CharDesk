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

export type { ClipboardCommandResult } from "@chardesk/editor-core/clipboard/commands";

export type CanvasViewportState = {
  offset: Point;
  zoom: number;
};

export type PendingCanvasCameraPlacement = {
  sessionId: string;
  kind: "content-start";
};

export type EditorState = {
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

export type CanvasState = EditorState;

export interface CanvasStateStore {
  getState(): CanvasState;
  getInitialState(): CanvasState;
  subscribe(
    listener: (state: CanvasState, previousState: CanvasState) => void
  ): () => void;
}
