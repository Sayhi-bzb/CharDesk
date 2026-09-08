import { isCollaborationDescriptor } from "@/domains/collaboration/public";
import { normalizeSlideDeckSnapshot } from "@/domains/slides/public";
import {
  cloneStructuredNode,
  decodeStructuredComponents,
  decodeStructuredNode,
  normalizeScene,
  type StructuredComponentInstance,
  type StructuredNode,
} from "@/domains/structured-content/public";
import type { GridCell, Point } from "@/shared/types";
import { decodeGridEntries } from "@/shared/utils/grid-codec";
import type { CanvasMode } from "./mode";
import type { CanvasSessionSnapshot, CanvasSourceBinding } from "./model";
import {
  migrateLegacyGridOffset,
  migrateLegacyGridViewport,
} from "./viewportMigration";

export const EDITOR_PERSISTENCE_VERSION = 6;
export const PREVIOUS_EDITOR_PERSISTENCE_VERSION = 5;
export const LEGACY_EDITOR_PERSISTENCE_VERSION = 4;
export const EDITOR_PERSISTENCE_KEY = "chardesk-persistence";
export const LEGACY_EDITOR_PERSISTENCE_KEY = "ascii-canvas-persistence";

interface PersistedEditorStateV6 {
  schemaVersion: 6;
  workspace: {
    offset: Point;
    zoom: number;
    canvasMode: CanvasMode;
    grid: [string, GridCell][];
    structuredScene: StructuredNode[];
    structuredComponents: StructuredComponentInstance[];
  };
  sessions: {
    items: CanvasSessionSnapshot[];
    activeId: string;
  };
  preferences: {
    brushChar: string;
    brushColor: string;
    brushBackgroundColor?: string;
    showGrid: boolean;
    exportShowGrid: boolean;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const decodePoint = (value: unknown): Point | null =>
  isRecord(value) &&
  typeof value.x === "number" &&
  Number.isFinite(value.x) &&
  typeof value.y === "number" &&
  Number.isFinite(value.y)
    ? { x: value.x, y: value.y }
    : null;

const isCanvasMode = (value: unknown): value is CanvasMode =>
  value === "freeform" || value === "structured" || value === "slide";

const decodeSourceBinding = (value: unknown): CanvasSourceBinding | undefined => {
  if (!isRecord(value) || value.kind !== "blackboard" ||
      (value.provider !== "browser-workspace" && value.provider !== "local-reader") ||
      typeof value.id !== "string" || !value.id.trim()) return undefined;
  return { kind: "blackboard", provider: value.provider, id: value.id };
};

const decodeLegacySourceBinding = (value: Record<string, unknown>) => {
  const current = decodeSourceBinding(value.sourceBinding);
  if (current) return current;
  if (typeof value.workspaceId !== "string" || !value.workspaceId.trim()) return undefined;
  return {
    kind: "blackboard" as const,
    provider: value.workspaceId === "local-reader"
      ? "local-reader" as const
      : "browser-workspace" as const,
    id: value.workspaceId,
  };
};

const decodeViewport = (value: unknown): CanvasSessionSnapshot["viewport"] | undefined => {
  if (!isRecord(value)) return undefined;
  const offset = decodePoint(value.offset);
  return offset && typeof value.zoom === "number" && Number.isFinite(value.zoom)
    ? { offset, zoom: value.zoom }
    : undefined;
};

const decodeScene = (value: unknown): StructuredNode[] =>
  normalizeScene(
    (Array.isArray(value) ? value : [])
      .map(decodeStructuredNode)
      .filter((node): node is StructuredNode => node !== null)
      .map(cloneStructuredNode)
  );

const decodeCanvasSession = (value: unknown): CanvasSessionSnapshot | null => {
  if (!isRecord(value) || typeof value.id !== "string" ||
      (!isCanvasMode(value.mode) && value.mode !== "blackboard")) {
    return null;
  }
  const viewport = decodeViewport(value.viewport);
  const sourceBinding = decodeLegacySourceBinding(value);
  if (value.mode === "slide") {
    return {
      id: value.id,
      name:
        typeof value.name === "string" && value.name.trim()
          ? value.name
          : "Slides",
      mode: "slide",
      slideDeck: normalizeSlideDeckSnapshot(value.slideDeck, `${value.id}-slide-1`),
      ...(sourceBinding ? { sourceBinding } : {}),
      scene: [],
      components: [],
      grid: [],
      ...(viewport ? { viewport } : {}),
    };
  }

  if (value.mode === "blackboard") {
    return {
      id: value.id,
      name:
        typeof value.name === "string" && value.name.trim()
          ? value.name
          : "Blackboard",
      mode: "freeform",
      sourceBinding: sourceBinding ?? {
        kind: "blackboard",
        provider: "browser-workspace",
        id: value.id,
      },
      scene: [],
      components: [],
      grid: [],
      ...(viewport ? { viewport } : {}),
    };
  }

  const scene = decodeScene(value.scene);
  const collaboration = !sourceBinding && isCollaborationDescriptor(value.collaboration)
    ? value.collaboration
    : undefined;
  const collaborationRole: "host" | "guest" | undefined =
    collaboration && value.collaborationRole === "guest"
    ? "guest"
    : collaboration
      ? "host"
      : undefined;
  const base = {
    id: value.id,
    name:
      typeof value.name === "string" && value.name.trim()
        ? value.name
        : "Canvas",
    scene,
    components: decodeStructuredComponents(value.components, scene),
    grid: decodeGridEntries(value.grid),
    ...(viewport ? { viewport } : {}),
    ...(collaboration ? { collaboration } : {}),
    ...(collaborationRole ? { collaborationRole } : {}),
  };
  return value.mode === "structured"
    ? { ...base, mode: "structured" }
    : {
        ...base,
        mode: "freeform",
        ...(sourceBinding ? { sourceBinding } : {}),
      };
};

const createBlankSession = (): CanvasSessionSnapshot => ({
  id: "canvas-1",
  name: "Canvas 1",
  mode: "freeform",
  scene: [],
  components: [],
  grid: [],
});

export const decodePersistedEditorState = (
  value: unknown
): PersistedEditorStateV6 => {
  const state = isRecord(value) ? value : {};
  const workspace = isRecord(state.workspace) ? state.workspace : state;
  const sessions = isRecord(state.sessions) ? state.sessions : {};
  const preferences = isRecord(state.preferences) ? state.preferences : state;
  const rawItems = Array.isArray(sessions.items)
    ? sessions.items
    : Array.isArray(state.canvasSessions)
      ? state.canvasSessions
      : [];
  const items = rawItems
    .map(decodeCanvasSession)
    .filter((session): session is CanvasSessionSnapshot => session !== null);
  if (items.length === 0) items.push(createBlankSession());

  const requestedActiveId =
    typeof sessions.activeId === "string"
      ? sessions.activeId
      : typeof state.activeCanvasId === "string"
        ? state.activeCanvasId
        : "";
  const activeId = items.some((item) => item.id === requestedActiveId)
    ? requestedActiveId
    : items[0].id;
  const activeSession = items.find((item) => item.id === activeId) ?? items[0];
  const workspaceMode = isCanvasMode(workspace.canvasMode)
    ? workspace.canvasMode
    : null;
  const useWorkspace = workspaceMode === activeSession.mode;
  const workspaceScene = decodeScene(workspace.structuredScene);
  const useWorkspaceGrid = useWorkspace && Array.isArray(workspace.grid);
  const useWorkspaceScene =
    useWorkspace && Array.isArray(workspace.structuredScene);
  const useWorkspaceComponents =
    useWorkspaceScene && Array.isArray(workspace.structuredComponents);
  const viewport = activeSession.viewport;

  return {
    schemaVersion: EDITOR_PERSISTENCE_VERSION,
    workspace: {
      offset:
        (useWorkspace ? decodePoint(workspace.offset) : null) ??
        viewport?.offset ??
        { x: 0, y: 0 },
      zoom:
        useWorkspace &&
        typeof workspace.zoom === "number" &&
        Number.isFinite(workspace.zoom)
          ? workspace.zoom
          : viewport?.zoom ?? 1,
      canvasMode: activeSession.mode,
      grid: useWorkspaceGrid
        ? decodeGridEntries(workspace.grid)
        : activeSession.grid,
      structuredScene: useWorkspaceScene ? workspaceScene : activeSession.scene,
      structuredComponents: useWorkspaceComponents
        ? decodeStructuredComponents(workspace.structuredComponents, workspaceScene)
        : activeSession.components ?? [],
    },
    sessions: { items, activeId },
    preferences: {
      brushChar:
        typeof preferences.brushChar === "string" ? preferences.brushChar : "#",
      brushColor:
        typeof preferences.brushColor === "string"
          ? preferences.brushColor
          : "#000000",
      brushBackgroundColor:
        typeof preferences.brushBackgroundColor === "string"
          ? preferences.brushBackgroundColor
          : typeof preferences.brushColor === "string"
            ? preferences.brushColor
            : "#000000",
      showGrid:
        typeof preferences.showGrid === "boolean" ? preferences.showGrid : false,
      exportShowGrid:
        typeof preferences.exportShowGrid === "boolean"
          ? preferences.exportShowGrid
          : false,
    },
  };
};

export class UnsupportedEditorPersistenceVersionError extends Error {
  readonly version: number;

  constructor(version: number) {
    super(`Unsupported editor persistence version: ${version}`);
    this.name = "UnsupportedEditorPersistenceVersionError";
    this.version = version;
  }
}

const assertSupportedPersistenceVersion = (version: number) => {
  if (
    version !== EDITOR_PERSISTENCE_VERSION &&
    version !== PREVIOUS_EDITOR_PERSISTENCE_VERSION &&
    version !== LEGACY_EDITOR_PERSISTENCE_VERSION
  ) {
    throw new UnsupportedEditorPersistenceVersionError(version);
  }
};

export const migratePersistedStateToV6 = (
  value: unknown,
  version = PREVIOUS_EDITOR_PERSISTENCE_VERSION,
) => {
  assertSupportedPersistenceVersion(version);
  const decoded = decodePersistedEditorState(value);
  if (version === EDITOR_PERSISTENCE_VERSION) return decoded;
  return {
    ...decoded,
    workspace: {
      ...decoded.workspace,
      offset: migrateLegacyGridOffset(decoded.workspace.offset),
    },
    sessions: {
      ...decoded.sessions,
      items: decoded.sessions.items.map((session) =>
        session.viewport
          ? {
              ...session,
              viewport: migrateLegacyGridViewport(session.viewport),
            }
          : session
      ),
    },
  } satisfies PersistedEditorStateV6;
};

export const isPersistedEditorStateV6 = (
  value: unknown
): value is PersistedEditorStateV6 => {
  if (!isRecord(value) || value.schemaVersion !== EDITOR_PERSISTENCE_VERSION) {
    return false;
  }
  if (!isRecord(value.workspace) || !isRecord(value.sessions) || !isRecord(value.preferences)) {
    return false;
  }
  return (
    decodePoint(value.workspace.offset) !== null &&
    typeof value.workspace.zoom === "number" &&
    Number.isFinite(value.workspace.zoom) &&
    isCanvasMode(value.workspace.canvasMode) &&
    Array.isArray(value.workspace.grid) &&
    Array.isArray(value.workspace.structuredScene) &&
    Array.isArray(value.workspace.structuredComponents) &&
    Array.isArray(value.sessions.items) &&
    value.sessions.items.every((item) => decodeCanvasSession(item) !== null) &&
    typeof value.sessions.activeId === "string" &&
    typeof value.preferences.brushChar === "string" &&
    typeof value.preferences.brushColor === "string" &&
    (!("brushBackgroundColor" in value.preferences) ||
      typeof value.preferences.brushBackgroundColor === "string") &&
    typeof value.preferences.showGrid === "boolean" &&
    typeof value.preferences.exportShowGrid === "boolean"
  );
};

const decodePersistedEnvelope = (raw: string | null) => {
  if (!raw) return null;
  try {
    const envelope: unknown = JSON.parse(raw);
    if (
      !isRecord(envelope) ||
      !("state" in envelope) ||
      !isRecord(envelope.state) ||
      ("version" in envelope && typeof envelope.version !== "number")
    ) {
      return null;
    }
    return envelope;
  } catch {
    return null;
  }
};

const isCurrentPersistedEnvelope = (raw: string | null) => {
  const envelope = decodePersistedEnvelope(raw);
  return !!envelope &&
    envelope.version === EDITOR_PERSISTENCE_VERSION &&
    isPersistedEditorStateV6(envelope.state);
};

/** Moves same-origin pre-CharDesk editor data only after a verified V6 write. */
export const migrateLegacyEditorPersistence = (storage: Storage): boolean => {
  try {
    const currentRaw = storage.getItem(EDITOR_PERSISTENCE_KEY);
    if (isCurrentPersistedEnvelope(currentRaw)) {
      storage.removeItem(LEGACY_EDITOR_PERSISTENCE_KEY);
      return true;
    }

    const legacyEnvelope = decodePersistedEnvelope(
      storage.getItem(LEGACY_EDITOR_PERSISTENCE_KEY)
    );
    if (
      !legacyEnvelope ||
      legacyEnvelope.version !== LEGACY_EDITOR_PERSISTENCE_VERSION
    ) return false;

    const migratedState = migratePersistedStateToV6(
      legacyEnvelope.state,
      LEGACY_EDITOR_PERSISTENCE_VERSION
    );
    storage.setItem(
      EDITOR_PERSISTENCE_KEY,
      JSON.stringify({
        state: migratedState,
        version: EDITOR_PERSISTENCE_VERSION,
      })
    );
    if (!isCurrentPersistedEnvelope(storage.getItem(EDITOR_PERSISTENCE_KEY))) {
      return false;
    }
    storage.removeItem(LEGACY_EDITOR_PERSISTENCE_KEY);
    return true;
  } catch {
    return false;
  }
};

export const flattenPersistedEditorState = (
  value: PersistedEditorStateV6
) => ({
  ...value.workspace,
  canvasSessions: value.sessions.items,
  activeCanvasId: value.sessions.activeId,
  ...value.preferences,
});
