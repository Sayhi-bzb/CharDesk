import {
  EDITOR_PERSISTENCE_VERSION,
  getCanvasSessionDescriptor,
  isSourceBackedCanvasSession,
  withActiveCanvasSnapshot,
  type CanvasSessionDescriptor,
  type CanvasSessionSnapshot,
} from "@/domains/sessions/public";
import {
  buildStructuredTemplate,
  normalizeStructuredComponents,
} from "@/domains/structured-content/public";
import { COLOR_PRIMARY_TEXT, DEFAULT_BRUSH_CHAR } from "@/shared/lib/constants";
import { normalizeBrushChar } from "@/shared/utils/characters";
import { DEFAULT_DEMO_GRID } from "./helpers/defaultDemo";
import {
  cloneScene,
} from "./helpers/snapshotHelpers";
import {
  buildSessionSnapshot,
  DEFAULT_MODE,
  DEFAULT_SESSION_ID,
  DEFAULT_SESSION_NAME,
  DEFAULT_STRUCTURED_SESSION_ID,
  DEFAULT_STRUCTURED_SESSION_NAME,
  getSessionCanvasDocumentId,
  resolveSessionDescriptorRuntime,
} from "./helpers/storeUtils";
import type { EditorState } from "./interfaces";
import type { CanvasDocumentRegistry } from "./CanvasDocumentRegistry";
import {
  createStructuredContentSurface,
} from "./helpers/gridHelpers";
import {
  materializeSlideDeckContent,
  readSlideDeckDescriptor,
} from "./slideDocumentPages";
import { toSlideDeckDescriptor } from "@/domains/slides/public";

const DEFAULT_STRUCTURED_SAFARI_TEMPLATE = buildStructuredTemplate(
  "safari",
  { x: 4, y: 2 },
  { brushColor: COLOR_PRIMARY_TEXT, startOrder: 1 }
);
export const createDefaultCanvasSessions = (): CanvasSessionSnapshot[] => [
  {
    id: DEFAULT_SESSION_ID,
    name: DEFAULT_SESSION_NAME,
    mode: DEFAULT_MODE,
    scene: [],
    grid: DEFAULT_DEMO_GRID,
  },
  {
    id: DEFAULT_STRUCTURED_SESSION_ID,
    name: DEFAULT_STRUCTURED_SESSION_NAME,
    mode: "structured",
    scene: DEFAULT_STRUCTURED_SAFARI_TEMPLATE.nodes,
    components: DEFAULT_STRUCTURED_SAFARI_TEMPLATE.components,
    grid: [],
  },
];

export const recoverPersistedEditorState = (
  hydratedState: EditorState,
  activeSnapshot?: CanvasSessionSnapshot
): EditorState => {
  const state = { ...hydratedState };
  state.brushChar = normalizeBrushChar(state.brushChar, DEFAULT_BRUSH_CHAR);
  state.brushColor =
    typeof state.brushColor === "string" ? state.brushColor : COLOR_PRIMARY_TEXT;
  state.brushBackgroundColor =
    typeof state.brushBackgroundColor === "string"
      ? state.brushBackgroundColor
      : state.brushColor;
  state.showGrid = typeof state.showGrid === "boolean" ? state.showGrid : false;
  state.exportShowGrid =
    typeof state.exportShowGrid === "boolean" ? state.exportShowGrid : false;

  const sessions =
    state.canvasSessions.length > 0
      ? state.canvasSessions
      : createDefaultCanvasSessions().map(getCanvasSessionDescriptor);

  const activeCanvasId =
    typeof state.activeCanvasId === "string" &&
    sessions.some((session) => session.id === state.activeCanvasId)
      ? state.activeCanvasId
      : sessions[0].id;
  const activeSession =
    sessions.find((session) => session.id === activeCanvasId) ?? sessions[0];
  const runtime = resolveSessionDescriptorRuntime(
    activeSession,
    state.tool || "select"
  );

  state.canvasSessions = sessions;
  state.activeCanvasId = activeCanvasId;
  state.canvasMode = runtime.nextMode;
  state.slideDeck =
    activeSnapshot?.mode === "slide"
      ? toSlideDeckDescriptor(activeSnapshot.slideDeck)
      : state.canvasMode === "slide"
        ? state.slideDeck
        : null;
  state.selectedStructuredNodeIds = [];
  state.selectedStructuredBoxId = null;
  state.selectedStructuredSplitHandle = null;
  state.structuredContextPoint = null;
  state.contentSurface = runtime.nextMode === "structured"
    ? createStructuredContentSurface(state.structuredScene)
    : state.contentSurface;
  state.tool = runtime.nextTool;
  state.offset = runtime.nextOffset;
  state.zoom = runtime.nextZoom;
  return state;
};

export const syncHydratedStateToCanvasDocument = (
  documents: CanvasDocumentRegistry,
  hydratedState: EditorState,
  activeSnapshot?: CanvasSessionSnapshot
) => {
  const activeSession = hydratedState.canvasSessions.find(
    (session) => session.id === hydratedState.activeCanvasId
  );
  if (!activeSession) return;
  if (isSourceBackedCanvasSession(activeSession)) {
    documents.activateDocument(activeSession.id, {
      mode: activeSession.mode,
      grid: [],
      scene: [],
      components: [],
    }, { replace: true });
    return;
  }
  if (activeSession.mode !== "slide" && activeSession.collaboration) {
    documents.initializeCollaborativeDocument(activeSession.id, {
      mode: activeSession.mode,
      grid: [],
      scene: [],
      components: [],
    });
    return;
  }
  if (activeSession.mode === "slide" && activeSnapshot?.mode === "slide") {
    documents.activateDocument(activeSession.id, {
      mode: "slide",
      activePageId: activeSnapshot.slideDeck.activeSlideId,
      pages: activeSnapshot.slideDeck.slides.map((slide) => ({
        id: slide.id,
        name: slide.name,
        size: slide.size,
        kind: "cell-plane",
        grid: slide.grid,
      })),
      grid: [],
      scene: [],
      components: [],
    }, { replace: true });
    return;
  }
  documents.activateDocument(
    getSessionCanvasDocumentId(activeSession),
    {
      grid:
        hydratedState.canvasMode === "structured"
          ? []
          : Array.from(hydratedState.contentSurface.reader.materialize()),
      scene:
        hydratedState.canvasMode === "structured" ? hydratedState.structuredScene : [],
      components: hydratedState.structuredComponents,
    },
    { replace: true }
  );
};

const materializeSessionSnapshot = (
  documents: CanvasDocumentRegistry,
  session: CanvasSessionDescriptor
): CanvasSessionSnapshot => {
  if (session.mode === "slide") {
    const deck = readSlideDeckDescriptor(documents, session.id);
    if (!deck) {
      throw new Error(`Slide document not loaded: ${session.id}`);
    }
    return {
      ...session,
      slideDeck: materializeSlideDeckContent(documents, session.id, deck),
      grid: [],
      scene: [],
      components: [],
    };
  }
  const seed = documents.getDocumentSeed(session.id, session.mode);
  return {
    ...session,
    grid: seed?.grid ?? [],
    scene: seed?.scene ?? [],
    components: seed?.components ?? [],
  };
};

const stripExternallyOwnedSessionContent = (
  session: CanvasSessionSnapshot
): CanvasSessionSnapshot => {
  if (!isSourceBackedCanvasSession(getCanvasSessionDescriptor(session)) &&
      !(session.mode !== "slide" && session.collaboration)) {
    return session;
  }
  return session.mode === "slide"
    ? {
        ...session,
        slideDeck: {
          ...session.slideDeck,
          slides: session.slideDeck.slides.map((slide) => ({
            ...slide,
            grid: [],
          })),
        },
      }
    : { ...session, grid: [], scene: [], components: [] };
};

export const createPersistedEditorSnapshot = (
  state: EditorState,
  documents: CanvasDocumentRegistry
) => {
  const activeSession = state.canvasSessions.find(
    (session) => session.id === state.activeCanvasId
  );
  const activeIsExternallyOwned = isSourceBackedCanvasSession(activeSession) ||
    (activeSession?.mode !== "slide" && !!activeSession?.collaboration);
  const persistedSessions = withActiveCanvasSnapshot(
    state.canvasSessions.map((session) =>
      materializeSessionSnapshot(documents, session)
    ),
    state.activeCanvasId,
    buildSessionSnapshot(state, documents)
  ).map(stripExternallyOwnedSessionContent);
  return {
    schemaVersion: EDITOR_PERSISTENCE_VERSION,
    workspace: {
      offset: state.offset,
      zoom: state.zoom,
      canvasMode: state.canvasMode,
      structuredScene: activeIsExternallyOwned ? [] : cloneScene(state.structuredScene),
      structuredComponents: activeIsExternallyOwned
        ? []
        : normalizeStructuredComponents(state.structuredComponents, state.structuredScene),
      grid: activeIsExternallyOwned
        ? []
        : state.canvasMode === "structured"
          ? []
          : Array.from(state.contentSurface.reader.materialize()),
    },
    sessions: { items: persistedSessions, activeId: state.activeCanvasId },
    preferences: {
      brushChar: state.brushChar,
      brushColor: state.brushColor,
      brushBackgroundColor: state.brushBackgroundColor,
      showGrid: state.showGrid,
      exportShowGrid: state.exportShowGrid,
    },
  };
};

export const shouldScheduleEditorPersistence = (
  previous: EditorState | null,
  next: EditorState
): boolean =>
  !previous ||
  previous.offset !== next.offset ||
  previous.zoom !== next.zoom ||
  previous.contentSurface !== next.contentSurface ||
  previous.canvasMode !== next.canvasMode ||
  previous.slideDeck !== next.slideDeck ||
  previous.structuredScene !== next.structuredScene ||
  previous.structuredComponents !== next.structuredComponents ||
  previous.canvasSessions !== next.canvasSessions ||
  previous.activeCanvasId !== next.activeCanvasId ||
  previous.brushChar !== next.brushChar ||
  previous.brushColor !== next.brushColor ||
  previous.brushBackgroundColor !== next.brushBackgroundColor ||
  previous.showGrid !== next.showGrid ||
  previous.exportShowGrid !== next.exportShowGrid;
