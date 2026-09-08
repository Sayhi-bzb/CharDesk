import type { CollaborationIntegrityIssue } from "@/domains/collaboration/public";
import type { CanvasSessionSourceParser } from "./state/sessionImportPort";
import type { SelectionCommandFactory } from "./state/selectionCommandPort";
import { CanvasDocumentRegistry } from "./state/CanvasDocumentRegistry";
import {
  createEditorStore,
  type CanvasStorePersistence,
} from "./state/editorStore";
import {
  createCanvasCommands,
  createCanvasQueries,
} from "./state/canvasCommands";
import {
  isSourceBackedCanvasSession,
  type CanvasMode,
  type CanvasSessionSnapshot,
} from "@/domains/sessions/public";
import type { SlideDeckSnapshot } from "@/domains/slides/public";
import type {
  StructuredComponentInstance,
  StructuredNode,
} from "@/domains/structured-content/public";
import {
  createGridSurfaceReader,
  type CanvasSurfaceReader,
} from "./cell-plane/model";
import { createStructuredSceneSurface } from "@/domains/structured-content/public";
import {
  materializeSlideDeckContent,
  readSlideDeckDescriptor,
} from "./state/slideDocumentPages";
import { createDefaultCanvasSessions } from "./state/editorPersistence";
import {
  createBrowserCanvasPersistence,
  type BrowserCanvasPersistence,
  type CanvasPersistenceStatus,
} from "./state/browserPersistence";
import { CanvasViewportRuntime, normalizeCanvasViewport } from "./viewportRuntime";
import type { CanvasState } from "./state/interfaces";

const DISABLED_PERSISTENCE_STATUS: CanvasPersistenceStatus = {
  phase: "ready",
  restore: {
    phase: "ready",
    reason: null,
    error: null,
    temporaryDirty: false,
  },
  save: "saved",
  coordination: "coordinator",
  error: null,
};

type CanvasRuntimeOptions = {
  documents?: CanvasDocumentRegistry;
  persistence: CanvasStorePersistence;
  selectionCommands: SelectionCommandFactory;
  parseSessionSource: CanvasSessionSourceParser;
  reportIntegrityIssues?: (issues: CollaborationIntegrityIssue[]) => void;
  initialSessions?: readonly CanvasSessionSnapshot[];
};

export type CanvasSessionMaterialization = {
  id: string;
  name: string;
  mode: CanvasMode;
  surface: CanvasSurfaceReader;
  structuredScene: StructuredNode[];
  structuredComponents: StructuredComponentInstance[];
  slideDeck: SlideDeckSnapshot | null;
};

export class CanvasRuntime {
  readonly documents: CanvasDocumentRegistry;
  readonly store;
  readonly commands;
  readonly queries;
  readonly viewport: CanvasViewportRuntime;
  readonly persistence: BrowserCanvasPersistence | null;
  readonly ready: Promise<void>;
  readonly #disposeStore: () => void;
  readonly #disposeViewportPersistence: () => void;
  #disposed = false;

  constructor(options: CanvasRuntimeOptions) {
    if (
      options.persistence &&
      options.persistence.key.trim().length === 0
    ) {
      throw new Error("Canvas persistence requires a non-empty instance key");
    }
    this.documents = options.documents ?? new CanvasDocumentRegistry();
    this.persistence = options.persistence
      ? createBrowserCanvasPersistence({
          legacyStorage: options.persistence.storage,
          legacyKey: options.persistence.key,
        })
      : null;
    const initialSessions = options.initialSessions ?? createDefaultCanvasSessions();
    this.viewport = new CanvasViewportRuntime(
      normalizeCanvasViewport(initialSessions[0]?.viewport)
    );
    const storeInstance = createEditorStore({
      documents: this.documents,
      selectionCommands: options.selectionCommands,
      parseSessionSource: options.parseSessionSource,
      reportIntegrityIssues: options.reportIntegrityIssues ?? (() => undefined),
      // Browser content persistence is coordinated against the authoritative
      // Yjs documents. Zustand remains an in-memory projection.
      persistence: false,
      initialSessions,
      viewport: this.viewport,
      documentResidency: this.persistence ?? undefined,
    });
    this.store = storeInstance.store;
    this.#disposeStore = storeInstance.dispose;
    this.commands = createCanvasCommands(this.store, this.documents, this.viewport);
    this.queries = createCanvasQueries(this.store, this.documents);
    let restoringViewport = this.persistence !== null;
    this.#disposeViewportPersistence = this.viewport.subscribe(() => {
      if (restoringViewport) return;
      const state = this.store.getState();
      this.commands.sessions.saveViewport(
        state.activeCanvasId,
        this.viewport.getSnapshot()
      );
    });
    this.ready = this.persistence
      ? this.persistence.initialize(
          this.documents,
          this.store,
          initialSessions
        ).then(() => {
          const state = this.store.getState();
          const activeSession = state.canvasSessions.find(
            (session) => session.id === state.activeCanvasId
          );
          this.viewport.resetFallback(
            normalizeCanvasViewport(activeSession?.viewport)
          );
        })
        .finally(() => {
          restoringViewport = false;
        })
      : Promise.resolve();
  }

  getState = (): CanvasState => this.store.getState();
  subscribe = (
    listener: (state: CanvasState, previousState: CanvasState) => void
  ) => this.store.subscribe(listener);

  getPersistenceSnapshot = (): CanvasPersistenceStatus =>
    this.persistence?.getSnapshot() ?? DISABLED_PERSISTENCE_STATUS;

  subscribePersistence = (listener: () => void): (() => void) =>
    this.persistence?.subscribe(listener) ?? (() => undefined);

  retryPersistence = () => this.persistence?.retry() ?? Promise.resolve();

  retryRestore = () => this.persistence?.retryRestore() ?? Promise.resolve(false);

  setRetainedCanvasIds = (ids: readonly string[]) =>
    this.persistence?.setPinnedCanvasIds(ids);

  getProjectionCacheStats = () => this.documents.getProjectionCacheStats();

  setProjectionCacheBudget = (bytes: number) =>
    this.documents.setProjectionCacheBudget(bytes);

  subscribeProjectionCache = (listener: () => void) =>
    this.documents.subscribeProjectionCache(listener);

  materializeSession = async (
    sessionId: string
  ): Promise<CanvasSessionMaterialization | null> => {
    const session = this.store
      .getState()
      .canvasSessions.find((candidate) => candidate.id === sessionId);
    if (!session) return null;
    if (
      !this.documents.getDocument(session.id) &&
      !(await this.persistence?.ensureLoaded({ descriptor: session }))
    ) {
      return null;
    }

    if (session.mode === "slide") {
      const descriptor = readSlideDeckDescriptor(this.documents, session.id);
      if (!descriptor) return null;
      const slideDeck = materializeSlideDeckContent(
        this.documents,
        session.id,
        descriptor
      );
      const activeSlide = slideDeck.slides.find(
        (slide) => slide.id === slideDeck.activeSlideId
      );
      return {
        id: session.id,
        name: session.name,
        mode: session.mode,
        surface: createGridSurfaceReader(new Map(activeSlide?.grid ?? [])),
        structuredScene: [],
        structuredComponents: [],
        slideDeck,
      };
    }

    if (isSourceBackedCanvasSession(session) && session.mode === "freeform") {
      const surface = this.documents.getContentReader(session.id);
      if (!surface) return null;
      return {
        id: session.id,
        name: session.name,
        mode: session.mode,
        surface,
        structuredScene: [],
        structuredComponents: [],
        slideDeck: null,
      };
    }

    const seed = this.documents.getDocumentSeed(session.id, session.mode);
    if (!seed) return null;
    const structuredScene = [...seed.scene];
    const structuredComponents = [...(seed.components ?? [])];
    return {
      id: session.id,
      name: session.name,
      mode: session.mode,
      surface: session.mode === "structured"
        ? createStructuredSceneSurface(structuredScene)
        : createGridSurfaceReader(new Map(seed.grid)),
      structuredScene,
      structuredComponents,
      slideDeck: null,
    };
  };

  dispose = () => {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#disposeViewportPersistence();
    this.#disposeStore();
    this.viewport.dispose();
    this.persistence?.dispose();
    this.documents.dispose();
  };
}

export const createCanvasRuntime = (options: CanvasRuntimeOptions) =>
  new CanvasRuntime(options);
