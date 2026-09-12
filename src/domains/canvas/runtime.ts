import type { CollaborationIntegrityIssue } from "@/domains/collaboration/public";
import type { CanvasSessionSourceParser } from "./state/sessionImportPort";
import type { SelectionCommandFactory } from "./state/selectionCommandPort";
import { CanvasDocumentRegistry } from "./state/CanvasDocumentRegistry";
import {
  createEditorStore,
  type CanvasStore,
  type CanvasStorePersistence,
} from "./state/editorStore";
import { createCanvasFacade } from "./state/canvasCommands";
import {
  isSourceBackedCanvasSession,
  type CanvasMode,
  type CanvasSessionSnapshot,
} from "@/domains/sessions/public";
import type { SlideDeckSnapshot } from "@/domains/slides/public";
import {
  createGridSurfaceReader,
  type CanvasSurfaceReader,
} from "./cell-plane/model";
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
import type { CanvasState, CanvasStateStore } from "./state/interfaces";
import type { CanvasStateCommitCoordinator } from "./state/CanvasStateCommitCoordinator";

const mutableCanvasStores = new WeakMap<object, CanvasStore>();

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
  slideDeck: SlideDeckSnapshot | null;
};

export class CanvasRuntime {
  readonly documents: CanvasDocumentRegistry;
  readonly store: CanvasStateStore;
  readonly commands;
  readonly queries;
  readonly viewport: CanvasViewportRuntime;
  readonly persistence: BrowserCanvasPersistence | null;
  readonly ready: Promise<void>;
  readonly #disposeStore: () => void;
  readonly #disposeViewportPersistence: () => void;
  readonly #commits: CanvasStateCommitCoordinator;
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
      reportIntegrityIssues: options.reportIntegrityIssues ?? (() => undefined),
      // Browser content persistence is coordinated against the authoritative
      // Yjs documents. Zustand remains an in-memory projection.
      persistence: false,
      initialSessions,
      viewport: this.viewport,
      documentResidency: this.persistence ?? undefined,
    });
    const mutableStore = storeInstance.store;
    mutableCanvasStores.set(this, mutableStore);
    this.store = Object.freeze({
      getState: mutableStore.getState,
      getInitialState: mutableStore.getInitialState,
      subscribe: mutableStore.subscribe,
    });
    this.#commits = storeInstance.commits;
    this.#disposeStore = storeInstance.dispose;
    const facade = createCanvasFacade(
      this.#commits,
      this.documents,
      this.viewport,
      options.selectionCommands,
      options.parseSessionSource,
      this.persistence ?? undefined
    );
    this.commands = facade.commands;
    this.queries = facade.queries;
    let restoringViewport = this.persistence !== null;
    this.#disposeViewportPersistence = this.viewport.subscribe(() => {
      if (restoringViewport) return;
      const state = this.#commits.getState();
      this.commands.sessions.saveViewport(
        state.activeCanvasId,
        this.viewport.getSnapshot()
      );
    });
    this.ready = this.persistence
      ? this.persistence.initialize(
          this.documents,
          mutableStore,
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

  getState = (): CanvasState => this.#commits.getState();
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
        slideDeck: null,
      };
    }

    const seed = this.documents.getDocumentSeed(session.id, session.mode);
    if (!seed) return null;
    return {
      id: session.id,
      name: session.name,
      mode: session.mode,
      surface: createGridSurfaceReader(new Map(seed.grid)),
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

/** Internal test seam; intentionally absent from the Canvas public barrel. */
export const getMutableCanvasStoreForTesting = (runtime: CanvasRuntime) => {
  const store = mutableCanvasStores.get(runtime);
  if (!store) throw new Error("Canvas runtime Store is unavailable");
  return store;
};

export const createCanvasRuntime = (options: CanvasRuntimeOptions) =>
  new CanvasRuntime(options);
