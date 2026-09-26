import type { CanvasMode } from "./mode";
import type {
  CanvasImportSnapshot,
  CanvasSessionDescriptor,
  CanvasSourceBinding,
} from "./model";
import type { CollaborationDescriptor } from "@/domains/collaboration/public";
import type { SlideSize } from "@/domains/slides/public";
import type { Point } from "@/shared/types";

type CreateCanvasSessionOptions = {
  slideSize?: SlideSize;
  name?: string;
};

export interface SessionCommands {
  createCanvasSession: (
    mode?: CanvasMode,
    options?: CreateCanvasSessionOptions
  ) => void;
  openSourceSession: (
    sourceBinding: CanvasSourceBinding,
    options?: { name?: string; initialMode?: "freeform" | "slide" }
  ) => void;
  importCanvasSession: (
    raw: string | unknown,
    options?: { name?: string; sourceName?: string }
  ) => Promise<CanvasSessionDescriptor>;
  replaceCanvasSessionSnapshot: (
    sessionId: string,
    snapshot: CanvasImportSnapshot,
    options: { preserveViewport: boolean; resetHistory: boolean }
  ) => void;
  applySourceProjection: (
    sessionId: string,
    snapshot: Extract<CanvasImportSnapshot, { mode: "freeform" | "slide" }>,
    options?: { title?: string; preserveViewport?: boolean; resetHistory?: boolean }
  ) => void;
  switchCanvasSession: (canvasId: string) => Promise<boolean>;
  removeCanvasSession: (canvasId: string) => Promise<boolean>;
  saveCanvasSessionViewport: (
    canvasId: string,
    viewport: { offset: Point; zoom: number }
  ) => void;
  renameCanvasSession: (canvasId: string, nextName: string) => void;
  setCanvasSessionCollaboration: (
    canvasId: string,
    collaboration: CollaborationDescriptor | null,
    role?: "host" | "guest"
  ) => void;
  joinCanvasSessionCollaboration: (collaboration: CollaborationDescriptor) => void;
}
