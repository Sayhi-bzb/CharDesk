import { create, type StateCreator, type StoreApi, type UseBoundStore } from "zustand";
import { persist } from "zustand/middleware";
import { MIN_ZOOM, MAX_ZOOM, COLOR_PRIMARY_TEXT, DEFAULT_BRUSH_CHAR } from "@/shared/lib/constants";
import { CanvasDocumentRegistry } from "./CanvasDocumentRegistry";
import type { EditorState } from "./interfaces";
import {
  EDITOR_PERSISTENCE_VERSION,
  flattenPersistedEditorState,
  decodePersistedEditorState,
  migrateLegacyEditorPersistence,
  migratePersistedStateToV6,
} from "@/domains/sessions/public";
import {
  createDrawingSlice,
  createTextSlice,
  createSelectionSlice,
  createSessionSlice,
  createStaticGridSlice,
  createSlideSlice,
} from "./slices";
import {
  createMapFromEntries,
  normalizeGridEntries,
} from "./helpers/snapshotHelpers";
import {
  cloneStructuredNode,
  deriveStructuredComponentsFromScene,
  normalizeScene,
  normalizeStructuredComponents,
} from "@/domains/structured-content/public";
import { areJsonValuesEqual } from "@/shared/utils/equality";
import { normalizeBrushChar } from "@/shared/utils/characters";
import { subscribeCanvasDocumentProjection } from "./canvasDocumentProjection";
import {
  createCanvasContentSurface,
  createStructuredContentSurface,
} from "./helpers/gridHelpers";
import {
  createDefaultCanvasSessions,
  createPersistedEditorSnapshot,
  recoverPersistedEditorState,
  shouldScheduleEditorPersistence,
  syncHydratedStateToCanvasDocument,
} from "./editorPersistence";

import {
  getSessionCanvasDocumentId,
  resolveSessionRuntime,
  stripSessionContent,
} from "./helpers/storeUtils";
import { isToolAllowedForMode } from "../model/tool";
import { createDeferredSnapshotPersistStorage } from "./persistenceCoordinator";
import { createStructuredGridFocusPatch } from "./transitions/editorTransitions";
import { resolveEditorDocumentAddress } from "./helpers/gridHelpers";
import type { CollaborationIntegrityIssue } from "@/domains/collaboration/public";
import type { SelectionCommandFactory } from "./selectionCommandPort";
import type { CanvasSessionSourceParser } from "./sessionImportPort";
import type { CanvasSession } from "@/domains/sessions/public";
import { createGridSurfaceReader } from "../cell-plane/model";
import type { CanvasDocumentResidency } from "./documentResidencyPort";

export type CanvasStore = UseBoundStore<StoreApi<EditorState>>;

export type CanvasStorePersistence = false | {
  storage: Storage;
  key: string;
  migrateLegacy?: boolean;
};

type CanvasStoreDependencies = {
  documents: CanvasDocumentRegistry;
  selectionCommands: SelectionCommandFactory;
  parseSessionSource: CanvasSessionSourceParser;
  reportIntegrityIssues: (issues: CollaborationIntegrityIssue[]) => void;
  persistence: CanvasStorePersistence;
  initialSessions?: readonly CanvasSession[];
  documentResidency?: CanvasDocumentResidency;
};

const seedSessionDocuments = (
  documents: CanvasDocumentRegistry,
  session: CanvasSession,
  runtime: ReturnType<typeof resolveSessionRuntime>
) => {
  if (session.mode === "slide" && runtime.nextSlideDeck) {
    documents.activateDocument(session.id, {
      mode: "slide",
      activePageId: runtime.nextSlideDeck.activeSlideId,
      pages: runtime.nextSlideDeck.slides.map((slide) => ({
        id: slide.id,
        name: slide.name,
        size: slide.size,
        kind: "cell-plane",
        grid: slide.grid,
      })),
      grid: [],
      scene: [],
      components: [],
    });
    return;
  }
  documents.activateDocument(
    getSessionCanvasDocumentId(session),
    {
      grid: runtime.nextMode === "structured" ? [] : runtime.nextGridEntries,
      scene: runtime.nextMode === "structured" ? runtime.nextScene : [],
      components: runtime.nextComponents,
      mode: runtime.nextMode,
    }
  );
};

export const createEditorStore = ({
  documents,
  selectionCommands,
  parseSessionSource,
  reportIntegrityIssues,
  persistence,
  initialSessions: configuredInitialSessions,
  documentResidency,
}: CanvasStoreDependencies): { store: CanvasStore; dispose: () => void } => {
  if (persistence && persistence.key.trim().length === 0) {
    throw new Error("Canvas persistence requires a non-empty instance key");
  }
  if (configuredInitialSessions?.length === 0) {
    throw new Error("Canvas runtime requires at least one initial session");
  }
  const initialSessions = configuredInitialSessions
    ? configuredInitialSessions.map((session) => structuredClone(session))
    : createDefaultCanvasSessions();
  const initialSession = initialSessions[0]!;
  const initialRuntime = resolveSessionRuntime(initialSession, "select");
  const disposers: Array<() => void> = [];
  const stateCreator: StateCreator<EditorState> = (set, get, ...a) => {
      seedSessionDocuments(documents, initialSession, initialRuntime);
      if (!documentResidency) {
        initialSessions.slice(1).forEach((session) => {
          const runtime = resolveSessionRuntime(session, "select");
          seedSessionDocuments(documents, session, runtime);
        });
      }
      const initialAddress = documents.getDocumentAddress(
        initialSession.id,
        initialSession.mode === "slide"
          ? initialRuntime.nextSlideDeck?.activeSlideId
          : undefined
      );
      if (!initialAddress || !documents.activatePage(
        initialAddress.documentId,
        initialAddress.pageId
      )) {
        throw new Error(`Failed to activate initial Canvas session: ${initialSession.id}`);
      }

      disposers.push(subscribeCanvasDocumentProjection(
        documents,
        reportIntegrityIssues,
        set,
        get
      ));

      disposers.push(documents.subscribeHistoryAvailability(
        (availability) => set(availability)
      ));

      return {
        offset: initialRuntime.nextOffset,
        zoom: initialRuntime.nextZoom,
        contentSurface:
          initialRuntime.nextMode === "structured"
            ? createStructuredContentSurface(initialRuntime.nextScene)
            : createCanvasContentSurface(documents.getContentReader()),
        canvasMode: initialRuntime.nextMode,
        structuredScene: initialRuntime.nextScene,
        structuredComponents: initialRuntime.nextComponents,
        selectedStructuredNodeIds: [],
        selectedStructuredBoxId: null,
        selectedStructuredSplitHandle: null,
        structuredContextPoint: null,
        structuredGridFocus: null,
        canvasSessions: initialSessions.map(stripSessionContent),
        activeCanvasId: initialSession.id,
        pendingCameraPlacement: null,
        ...documents.getHistoryAvailability(),
        tool: initialRuntime.nextTool,
        brushChar: DEFAULT_BRUSH_CHAR,
        brushColor: COLOR_PRIMARY_TEXT,
        brushBackgroundColor: COLOR_PRIMARY_TEXT,
        showGrid: false,
        exportShowGrid: false,
        hoveredGrid: null,
        canvasColorPickerTarget: null,

        setOffset: (updater) => set((state) => ({ offset: updater(state.offset) })),
        setZoom: (updater) =>
          set((state) => ({
            zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, updater(state.zoom))),
          })),
        setViewport: (updater) =>
          set((state) => {
            const viewport = updater({ offset: state.offset, zoom: state.zoom });
            return {
              offset: viewport.offset,
              zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom)),
            };
          }),
        consumePendingCameraPlacement: (sessionId) =>
          set((state) =>
            state.pendingCameraPlacement?.sessionId === sessionId
              ? { pendingCameraPlacement: null }
              : {}
          ),
        setTool: (tool) =>
          set((state) => {
            if (!isToolAllowedForMode(tool, state.canvasMode)) return state;
            return {
              tool,
              textCursor: null,
              editingStructuredTextNodeId: null,
              structuredTextSelection: null,
              hoveredGrid: null,
            };
          }),
        applyStructuredScene: (scene, history = "save", components) => {
          const current = get();
          const normalizedScene = normalizeScene(scene);
          const componentSource = components ?? [
            ...current.structuredComponents,
            ...deriveStructuredComponentsFromScene(normalizedScene).filter(
              (component) =>
                !current.structuredComponents.some((existing) => existing.id === component.id)
            ),
          ];
          const normalizedComponents = normalizeStructuredComponents(
            componentSource,
            normalizedScene
          );
          const currentNodes = new Map(current.structuredScene.map((node) => [node.id, node]));
          const nextNodeIds = new Set(normalizedScene.map((node) => node.id));
          const nodeUpserts = normalizedScene.flatMap((node) => {
            const existing = currentNodes.get(node.id);
            if (existing === node || areJsonValuesEqual(existing, node)) return [];
            return [cloneStructuredNode(node)];
          });
          const nodeDeleteIds = current.structuredScene
            .filter((node) => !nextNodeIds.has(node.id))
            .map((node) => node.id);

          const currentComponents = new Map(
            current.structuredComponents.map((component) => [component.id, component])
          );
          const nextComponentIds = new Set(normalizedComponents.map((component) => component.id));
          const componentUpserts = normalizedComponents.filter(
            (component) =>
              !areJsonValuesEqual(currentComponents.get(component.id), component)
          );
          const componentDeleteIds = current.structuredComponents
            .filter((component) => !nextComponentIds.has(component.id))
            .map((component) => component.id);

          if (
            nodeUpserts.length === 0 &&
            nodeDeleteIds.length === 0 &&
            componentUpserts.length === 0 &&
            componentDeleteIds.length === 0
          ) return;

          documents.patchStructuredContentAt(
            resolveEditorDocumentAddress(documents, current),
            {
              nodes: { upsert: nodeUpserts, deleteIds: nodeDeleteIds },
              components: {
                upsert: componentUpserts,
                deleteIds: componentDeleteIds,
              },
            },
            history
          );
        },
        getNextStructuredOrder: () => {
          const scene = get().structuredScene;
          if (scene.length === 0) return 1;
          return Math.max(...scene.map((node) => node.order)) + 1;
        },
        setBrushChar: (char) =>
          set((state) => ({
            brushChar: normalizeBrushChar(char, state.brushChar),
          })),
        setBrushColor: (color) => set({ brushColor: color }),
        setBrushBackgroundColor: (color) =>
          set({ brushBackgroundColor: color }),
        setCanvasColorPickerTarget: (target) => set({ canvasColorPickerTarget: target }),
        setStructuredContextPoint: (point) =>
          set({ structuredContextPoint: point ? { ...point } : null }),
        setShowGrid: (show) => set({ showGrid: show }),
        setExportShowGrid: (show) => set({ exportShowGrid: show }),
        setHoveredGrid: (pos) => set({ hoveredGrid: pos }),
        setStructuredGridFocus: (point) =>
          set(createStructuredGridFocusPatch(point)),
        moveStructuredGridFocus: (dx, dy) =>
          set((state) => {
            const current = state.structuredGridFocus ?? { x: 0, y: 0 };
            return {
              structuredGridFocus: {
                x: current.x + dx,
                y: current.y + dy,
              },
            };
          }),
        ...createSessionSlice(documents, parseSessionSource, documentResidency)(set, get, ...a),
        ...createStaticGridSlice(set, get, ...a),
        ...createSlideSlice(documents)(set, get, ...a),

        ...createDrawingSlice(documents)(set, get, ...a),
        ...createTextSlice(documents)(set, get, ...a),
        ...createSelectionSlice(documents, selectionCommands)(set, get, ...a),
      };
    };
  const store = persistence
    ? create<EditorState>()(persist(stateCreator, {
      name: persistence.key,
      version: EDITOR_PERSISTENCE_VERSION,
      storage: createDeferredSnapshotPersistStorage({
        getStorage: () => {
          if (persistence.migrateLegacy) {
            migrateLegacyEditorPersistence(persistence.storage);
          }
          return persistence.storage;
        },
        createSnapshot: createPersistedEditorSnapshot,
        shouldSchedule: shouldScheduleEditorPersistence,
      }),
      migrate: (persistedState, version) => {
        // Zustand types migrations as runtime state, while storage owns the V6 DTO.
        return migratePersistedStateToV6(
          persistedState,
          version,
        ) as unknown as EditorState;
      },
      merge: (persistedState, currentState) => {
        if (!persistedState) return currentState;
        const normalizedPersistedState = decodePersistedEditorState(persistedState);
        const flattened = flattenPersistedEditorState(normalizedPersistedState);
        const mergedState = {
          ...currentState,
          ...flattened,
          contentSurface: createCanvasContentSurface(createGridSurfaceReader(
            createMapFromEntries(normalizeGridEntries(flattened.grid))
          )),
        } as EditorState;
        return recoverPersistedEditorState(mergedState);
      },
      onRehydrateStorage: () => (hydratedState, error) => {
        if (error || !hydratedState) return;
        syncHydratedStateToCanvasDocument(documents, hydratedState);
      },
    }))
    : create<EditorState>()(stateCreator);
  return {
    store,
    dispose: () => {
      disposers.splice(0).reverse().forEach((dispose) => dispose());
    },
  };
};
