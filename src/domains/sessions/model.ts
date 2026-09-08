import type { GridCell, Point } from "@/shared/types";
import type { StructuredComponentInstance, StructuredNode } from "@/domains/structured-content/public";
import type { CollaborationDescriptor } from "@/domains/collaboration/public";
import type {
  SlideDeckSnapshot,
} from "@/domains/slides/public";

interface CanvasViewport {
  offset: Point;
  zoom: number;
}

interface CanvasSessionDescriptorBase {
  id: string;
  name: string;
  viewport?: CanvasViewport;
  sourceBinding?: CanvasSourceBinding;
  collaboration?: CollaborationDescriptor;
  collaborationRole?: "host" | "guest";
}

export type CanvasSourceBinding = Readonly<{
  kind: "blackboard";
  provider: "browser-workspace" | "local-reader";
  id: string;
}>;

export type FreeformCanvasSessionDescriptor = CanvasSessionDescriptorBase & {
  mode: "freeform";
};

export type StructuredCanvasSessionDescriptor = CanvasSessionDescriptorBase & {
  mode: "structured";
  sourceBinding?: never;
};

export type SlideCanvasSessionDescriptor = CanvasSessionDescriptorBase & {
  mode: "slide";
};

export type CanvasSessionDescriptor =
  | FreeformCanvasSessionDescriptor
  | StructuredCanvasSessionDescriptor
  | SlideCanvasSessionDescriptor;

interface StaticCanvasSessionSnapshotContent {
  scene: StructuredNode[];
  components?: StructuredComponentInstance[];
  grid: [string, GridCell][];
}

export type FreeformCanvasSessionSnapshot = CanvasSessionDescriptorBase &
  StaticCanvasSessionSnapshotContent &
  { mode: "freeform" };

export type StructuredCanvasSessionSnapshot = CanvasSessionDescriptorBase &
  StaticCanvasSessionSnapshotContent &
  { mode: "structured"; sourceBinding?: never };

export interface SlideCanvasSessionSnapshot extends CanvasSessionDescriptorBase {
  mode: "slide";
  slideDeck: SlideDeckSnapshot;
  scene: [];
  components?: [];
  grid: [];
}

export type SourceBackedCanvasSessionDescriptor =
  | (FreeformCanvasSessionDescriptor & { sourceBinding: CanvasSourceBinding })
  | (SlideCanvasSessionDescriptor & { sourceBinding: CanvasSourceBinding });

export type SourceBackedCanvasSessionSnapshot =
  | (FreeformCanvasSessionSnapshot & { sourceBinding: CanvasSourceBinding })
  | (SlideCanvasSessionSnapshot & { sourceBinding: CanvasSourceBinding });

export type CanvasSessionSnapshot =
  | FreeformCanvasSessionSnapshot
  | StructuredCanvasSessionSnapshot
  | SlideCanvasSessionSnapshot;

export type CanvasSessionRestoreRecord = Readonly<{
  descriptor: CanvasSessionDescriptor;
  fallbackSnapshot?: CanvasImportSnapshot;
}>;

export const getCanvasSessionDescriptor = (
  session: CanvasSessionSnapshot
): CanvasSessionDescriptor => {
  const metadata = {
    id: session.id,
    name: session.name,
    ...(session.viewport ? { viewport: session.viewport } : {}),
    ...(session.collaboration ? { collaboration: session.collaboration } : {}),
    ...(session.collaborationRole
      ? { collaborationRole: session.collaborationRole }
      : {}),
  };
  switch (session.mode) {
    case "freeform":
      return {
        ...metadata,
        mode: "freeform",
        ...(session.sourceBinding ? { sourceBinding: session.sourceBinding } : {}),
      };
    case "structured":
      return { ...metadata, mode: "structured" };
    case "slide":
      return {
        ...metadata,
        mode: "slide",
        ...(session.sourceBinding ? { sourceBinding: session.sourceBinding } : {}),
      };
  }
};

export const getCanvasSessionFallbackSnapshot = (
  session: CanvasSessionSnapshot
): CanvasImportSnapshot =>
  session.mode === "slide"
    ? { mode: "slide", slideDeck: session.slideDeck }
    : {
        mode: session.mode,
        scene: session.scene,
        components: session.components ?? [],
        grid: session.grid,
      };

export const getCanvasSessionRestoreRecord = (
  session: CanvasSessionSnapshot
): CanvasSessionRestoreRecord => ({
  descriptor: getCanvasSessionDescriptor(session),
  fallbackSnapshot: getCanvasSessionFallbackSnapshot(session),
});

export function isSourceBackedCanvasSession(
  session: CanvasSessionSnapshot | null | undefined
): session is SourceBackedCanvasSessionSnapshot;
export function isSourceBackedCanvasSession(
  session: CanvasSessionDescriptor | null | undefined,
): session is SourceBackedCanvasSessionDescriptor;
export function isSourceBackedCanvasSession(
  session: CanvasSessionDescriptor | CanvasSessionSnapshot | null | undefined
) {
  return !!session && !!session.sourceBinding;
}

type StaticCanvasImportSnapshotBase = {
  scene: StructuredNode[];
  components: StructuredComponentInstance[];
  grid: [string, GridCell][];
  name?: string;
};

export type FreeformCanvasImportSnapshot = StaticCanvasImportSnapshotBase & {
  mode: "freeform";
};

export type StructuredCanvasImportSnapshot = StaticCanvasImportSnapshotBase & {
  mode: "structured";
};

export type CanvasImportSnapshot =
  | FreeformCanvasImportSnapshot
  | StructuredCanvasImportSnapshot
  | {
      mode: "slide";
      slideDeck: SlideDeckSnapshot;
      name?: string;
    };
