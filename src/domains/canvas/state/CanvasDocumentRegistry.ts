import * as Y from "yjs";
import type { CollaborationIntegrityIssue } from "@/domains/collaboration/public";
import type {
  StructuredComponentInstance,
  StructuredNode,
} from "@/domains/structured-content/public";
import type { GridCell } from "@/shared/types";
import {
  CellPlaneIndex,
  CanvasProjectionCacheBudget,
  cellPlanePatchToOperation,
  gridChangesToCellPlaneOperation,
  gridEntriesToCellPlaneOperation,
  isEncodedCellPlaneOperation,
  isCellPlaneOperation,
  toLegacyCellPlaneOperation,
  type CellPlaneOperation,
  type CellPlanePatch,
  type CanvasSurfaceReader,
} from "../cell-plane/model";
import { areJsonValuesEqual } from "@/shared/utils/equality";
import { GridManager } from "@/shared/utils/grid";
import type { CanvasMode } from "@/domains/sessions/public";
import {
  createCanvasYPage,
  getCanvasDocumentRoot,
  getDefaultCanvasPageId,
  readCanvasPageOrder,
  readCanvasYPage,
  writeCanvasDocumentMetadata,
  type CanvasDocumentAddress,
  type CanvasDocumentDraft,
  type CanvasPageDescriptor,
  type CanvasPageDraft,
  type CanvasYDocumentRoot,
  type CanvasYPage,
} from "./canvasDocumentModel";
import { CanvasHistoryJournal } from "./CanvasHistoryJournal";
import { CanvasMutationPerformance } from './CanvasMutationPerformance';
import type { CanvasMutationEnvelope } from "./canvasMutationEnvelope";
export type CanvasHistoryMode = "save" | "merge" | "none" | "reset";
export type CanvasHistoryCheckpoint = {
  commit: () => void;
  cancel: () => void;
};

type CanvasMutationListener = (envelope: CanvasMutationEnvelope) => void;

type CanvasStructuredContentPatch = {
  nodes?: {
    upsert?: readonly StructuredNode[];
    deleteIds?: readonly string[];
  };
  components?: {
    upsert?: readonly StructuredComponentInstance[];
    deleteIds?: readonly string[];
  };
};

const LOCAL_ORIGIN = Symbol("canvas-local-origin");
const HISTORY_IGNORED_ORIGIN = Symbol("canvas-history-ignored");
const MAX_RESIDENT_PAGE_INDEXES = 4;

export type CanvasDocumentSeed = {
  grid: [string, GridCell][];
  scene: StructuredNode[];
  components?: StructuredComponentInstance[];
  mode?: CanvasMode;
  activePageId?: string;
  pages?: CanvasPageDraft[];
};

type CanvasCollaborationPreparation = {
  mode: "freeform" | "structured";
  documentVersion: number;
  roomId: string;
  sharedDocumentId: string;
};

type CanvasCollaborationBinding = CanvasCollaborationPreparation & {
  pageId: string;
};

type CanvasDocumentLifecycle = {
  onCreate: (id: string, doc: Y.Doc) => void;
  onDelete: (id: string) => void;
};

type CanvasPageRuntime = CanvasYPage & {
  cellPlaneIndex: CellPlaneIndex | null;
  undoManager: Y.UndoManager;
  dispose: () => void;
};

type CanvasYDocument = {
  id: string;
  doc: Y.Doc;
  root: CanvasYDocumentRoot;
  pages: Map<string, CanvasPageRuntime>;
  activePageId: string;
  operations: Y.Array<CellPlaneOperation>;
  cellPlaneIndex: CellPlaneIndex;
  scene: Y.Map<StructuredNode>;
  components: Y.Map<StructuredComponentInstance>;
  meta: Y.Map<unknown>;
  integrityIssues: Map<string, CollaborationIntegrityIssue>;
  undoManager: Y.UndoManager;
  operationFormat: "encoded" | "legacy";
  collaboration: CanvasCollaborationBinding | null;
  repairingCollaborationPage: boolean;
};

type CanvasDocumentTransaction = {
  address: CanvasDocumentAddress;
  sceneChanged: boolean;
  sceneChangedIds: readonly string[];
  componentsChanged: boolean;
  componentChangedIds: readonly string[];
  contentChanged: boolean;
  pagesChanged: boolean;
};

type CanvasGridWriter = {
  get: (key: string) => GridCell | undefined;
  set: (key: string, value: GridCell) => void;
  delete: (key: string) => void;
  clear: () => void;
};

const applyYMapValueDiff = <T extends { id: string }>(
  map: Y.Map<T>,
  values: T[]
) => {
  const nextIds = new Set(values.map((value) => value.id));
  Array.from(map.keys()).forEach((id) => {
    if (!nextIds.has(id)) map.delete(id);
  });
  values.forEach((value) => {
    const current = map.get(value.id);
    if (!areJsonValuesEqual(current, value)) map.set(value.id, value);
  });
};

const applyYMapPatch = <T extends { id: string }>(
  map: Y.Map<T>,
  patch: {
    upsert?: readonly T[];
    deleteIds?: readonly string[];
  } | undefined
) => {
  patch?.deleteIds?.forEach((id) => map.delete(id));
  patch?.upsert?.forEach((value) => map.set(value.id, value));
};

const createProxy = <T extends object>(resolve: () => T): T =>
  new Proxy({} as T, {
    get: (_target, property) => {
      const value = resolve();
      const member = Reflect.get(value, property, value);
      return typeof member === "function" ? member.bind(value) : member;
    },
  });

const normalizeHistoryMode = (
  history: CanvasHistoryMode | boolean = "save"
): CanvasHistoryMode => {
  if (history === true) return "save";
  if (history === false) return "merge";
  return history;
};

export class CanvasDocumentRegistry {
  readonly #documents = new Map<string, CanvasYDocument>();
  readonly #derivedSurfaces = new Map<string, CanvasSurfaceReader>();
  readonly #activeListeners = new Set<(
    next: CanvasYDocument,
    previous: CanvasYDocument
  ) => void>();
  readonly #historyListeners = new Set<(
    availability: { canUndo: boolean; canRedo: boolean }
  ) => void>();
  readonly #mutationListeners = new Set<CanvasMutationListener>();
  #active: CanvasYDocument;
  #lifecycle: CanvasDocumentLifecycle | null = null;
  #operationSequence = 0;
  readonly #historyJournal: CanvasHistoryJournal;
  readonly #recentPageIndexes: Array<{ documentId: string; pageId: string }> = [];
  readonly #projectionCacheBudget = new CanvasProjectionCacheBudget();
  readonly #mutationPerformance = new CanvasMutationPerformance();
  #disposed = false;

  readonly yCellPlaneOperations: Y.Array<CellPlaneOperation>;
  readonly yStructuredScene: Y.Map<StructuredNode>;
  readonly yStructuredComponents: Y.Map<StructuredComponentInstance>;

  constructor(initialId = "canvas-initial") {
    this.#historyJournal = new CanvasHistoryJournal({
      apply: (envelope) => this.#applyMutationEnvelope(envelope),
    });
    this.#active = this.#createDocument(initialId);
    this.#documents.set(initialId, this.#active);
    this.yCellPlaneOperations = createProxy(() => this.#active.operations);
    this.yStructuredScene = createProxy(() => this.#active.scene);
    this.yStructuredComponents = createProxy(() => this.#active.components);
  }

  getHistoryAvailability = () => ({
    ...this.#historyJournal.getAvailability(
      this.#historyKey(this.getActiveAddress())
    ),
  });

  subscribeHistoryAvailability = (
    listener: (availability: { canUndo: boolean; canRedo: boolean }) => void
  ) => {
    this.#historyListeners.add(listener);
    return () => this.#historyListeners.delete(listener);
  };

  subscribeMutations = (listener: CanvasMutationListener) => {
    this.#mutationListeners.add(listener);
    return () => this.#mutationListeners.delete(listener);
  };

  getActiveDocumentId = () => this.#active.id;
  getActiveAddress = (): CanvasDocumentAddress => ({
    documentId: this.#active.id,
    pageId: this.#active.activePageId,
  });
  getActivePageId = () => this.#active.activePageId;
  getDocumentAddress = (
    documentId: string,
    pageId?: string
  ): CanvasDocumentAddress | null => {
    const document = this.#documents.get(documentId);
    const resolvedPageId = pageId ?? document?.activePageId;
    return document && resolvedPageId && document.pages.has(resolvedPageId)
      ? { documentId, pageId: resolvedPageId }
      : null;
  };
  getDocument = (id: string) => this.#documents.get(id) ?? null;
  getDocumentIds = () => Array.from(this.#documents.keys());
  getCollaborationDocument = (id: string) => this.#documents.get(id)?.doc ?? null;
  getProjectionCacheStats = () => this.#projectionCacheBudget.getStats();
  setProjectionCacheBudget = (bytes: number) =>
    this.#projectionCacheBudget.setByteBudget(bytes);
  subscribeProjectionCache = (listener: () => void) =>
    this.#projectionCacheBudget.subscribe(listener);
  setMutationPerformanceEnabled = (enabled: boolean) =>
    this.#mutationPerformance.setEnabled(enabled);
  resetMutationPerformance = () => this.#mutationPerformance.reset();
  getMutationPerformanceStats = () => this.#mutationPerformance.getStats();
  getMemoryStats = () => {
    let yjsStructs = 0;
    let pages = 0;
    let operations = 0;
    let encodedOperations = 0;
    let encodedPayloadBytes = 0;
    let legacyOperations = 0;
    let indexDirectoryChunks = 0;
    let indexDirectoryRowReferences = 0;
    let indexResidentBytes = 0;
    let indexCachedChunks = 0;
    let indexCachedCells = 0;
    let indexPreparedTextEntries = 0;
    let indexPreparedTextBytes = 0;
    let residentPageIndexes = 0;
    this.#documents.forEach((document) => {
      document.doc.store.clients.forEach((structs) => { yjsStructs += structs.length; });
      document.pages.forEach((page) => {
        pages += 1;
        page.operations.forEach((operation) => {
          operations += 1;
          if (isEncodedCellPlaneOperation(operation)) {
            encodedOperations += 1;
            encodedPayloadBytes += operation.payload.byteLength;
          } else legacyOperations += 1;
        });
        const stats = page.cellPlaneIndex?.getStats();
        if (!stats) return;
        residentPageIndexes += 1;
        indexDirectoryChunks += stats.directoryChunks;
        indexDirectoryRowReferences += stats.directoryRowReferences;
        indexResidentBytes += stats.residentBytes;
        indexCachedChunks += stats.cachedChunks;
        indexCachedCells += stats.cachedCells;
        indexPreparedTextEntries += stats.preparedTextEntries;
        indexPreparedTextBytes += stats.preparedTextBytes;
      });
    });
    let structuredSurfaceCount = 0;
    let structuredResidentChunks = 0;
    let structuredResidentBytes = 0;
    this.#derivedSurfaces.forEach((surface) => {
      if (!("getStats" in surface) || typeof surface.getStats !== "function") return;
      const stats = surface.getStats() as Record<string, number>;
      if (typeof stats.residentBytes !== "number") return;
      structuredSurfaceCount += 1;
      structuredResidentChunks += stats.residentChunks ?? 0;
      structuredResidentBytes += stats.residentBytes;
    });
    const projectionCache = this.#projectionCacheBudget.getStats();
    const history = this.#historyJournal.getStats();
    const attributedProjectionCacheEntries =
      indexCachedChunks + indexPreparedTextEntries;
    const attributedProjectionCacheBytes =
      indexResidentBytes + indexPreparedTextBytes;
    return {
      documents: this.#documents.size,
      pages,
      yjsStructs,
      operations,
      encodedOperations,
      encodedPayloadBytes,
      legacyOperations,
      indexDirectoryChunks,
      indexDirectoryRowReferences,
      indexResidentBytes,
      indexCachedChunks,
      indexCachedCells,
      indexPreparedTextEntries,
      indexPreparedTextBytes,
      residentPageIndexes,
      structuredSurfaceCount,
      structuredResidentChunks,
      structuredResidentBytes,
      estimatedProjectionBytes:
        indexResidentBytes + indexPreparedTextBytes + structuredResidentBytes,
      historyDocuments: history.documents,
      historyGroups: history.groups,
      historyActions: history.actions,
      historyBytes: history.bytes,
      projectionCacheBudgetBytes: projectionCache.bytes,
      projectionCacheBudgetLimit: projectionCache.byteBudget,
      projectionCacheEntries: projectionCache.entries,
      projectionCacheEvictions: projectionCache.evictions,
      attributedProjectionCacheEntries,
      attributedProjectionCacheBytes,
      unattributedProjectionCacheEntries: Math.max(
        0,
        projectionCache.entries - attributedProjectionCacheEntries
      ),
      unattributedProjectionCacheBytes: Math.max(
        0,
        projectionCache.bytes - attributedProjectionCacheBytes
      ),
    };
  };
  getActiveCellCount = () => {
    const derived = this.#derivedSurfaces.get(this.#active.id);
    return derived
      ? derived.materialize().size
      : this.#ensurePageIndex(
          this.#active,
          this.#active.pages.get(this.#active.activePageId)!
        ).countCells();
  };
  getContentReader(): CanvasSurfaceReader;
  getContentReader(id: string, pageId?: string): CanvasSurfaceReader | null;
  getContentReader(id?: string, pageId?: string): CanvasSurfaceReader | null {
    if (!id) {
      return this.#derivedSurfaces.get(this.#active.id) ?? this.#active.cellPlaneIndex;
    }
    const derived = this.#derivedSurfaces.get(id);
    if (derived && !pageId) return derived;
    const document = this.#documents.get(id);
    if (!document) return null;
    if (!pageId) {
      const activePage = document.pages.get(document.activePageId);
      return activePage ? this.#ensurePageIndex(document, activePage) : null;
    }
    const page = document.pages.get(pageId);
    return page ? this.#ensurePageIndex(document, page) : null;
  }

  setDerivedSurface = (id: string, surface: CanvasSurfaceReader) => {
    if (!this.#documents.has(id)) {
      throw new Error(`Canvas document not found for derived surface: ${id}`);
    }
    this.#derivedSurfaces.set(id, surface);
  };

  clearDerivedSurface = (id: string) => this.#derivedSurfaces.delete(id);

  getPageDescriptors = (documentId = this.#active.id): CanvasPageDescriptor[] => {
    const document = this.#documents.get(documentId);
    if (!document) return [];
    return readCanvasPageOrder(document.root).flatMap((pageId) => {
      const page = document.pages.get(pageId);
      return page ? [page.descriptor] : [];
    });
  };
  getPageDescriptor = (documentId: string, pageId: string) =>
    this.#documents.get(documentId)?.pages.get(pageId)?.descriptor ?? null;

  getDocumentDraft = (documentId = this.#active.id): CanvasDocumentDraft | null => {
    const document = this.#documents.get(documentId);
    if (!document) return null;
    const mode = document.root.meta.get("mode");
    if (mode !== "freeform" && mode !== "structured" && mode !== "slide") {
      return null;
    }
    return {
      id: document.id,
      mode,
      activePageId: document.activePageId,
      pages: readCanvasPageOrder(document.root).flatMap((pageId) => {
        const page = document.pages.get(pageId);
        if (!page) return [];
        return [{
          ...page.descriptor,
          ...(page.operations
            ? { grid: Array.from(this.#ensurePageIndex(document, page).materialize()) }
            : {
                scene: Array.from(page.scene?.values() ?? []),
                components: Array.from(page.components?.values() ?? []),
              }),
        }];
      }),
    };
  };

  activatePage = (documentId: string, pageId: string) => {
    const document = this.#documents.get(documentId);
    const page = document?.pages.get(pageId);
    if (!document || !page) return false;
    if (document.root.meta.get("activePageId") !== pageId) {
      document.doc.transact(() => {
        document.root.meta.set("activePageId", pageId);
      }, HISTORY_IGNORED_ORIGIN);
    }
    const previous = this.#active;
    this.#active = document;
    this.#setActivePage(document, pageId);
    if (document !== previous) {
      this.#activeListeners.forEach((listener) => listener(document, previous));
    }
    this.#emitHistory();
    return true;
  };

  configureDocumentLifecycle = (lifecycle: CanvasDocumentLifecycle | null) => {
    this.#lifecycle = lifecycle;
  };

  /** Installs a document that has already completed external persistence restore. */
  adoptDocument = (id: string, doc: Y.Doc) => {
    this.#assertActive();
    const previous = this.#documents.get(id);
    const wasActive = previous === this.#active;
    const next = this.#createDocument(id, undefined, doc, false);
    this.#documents.set(id, next);
    if (wasActive) {
      this.#active = next;
      this.#activeListeners.forEach((listener) => listener(next, previous));
    }
    if (previous) {
      previous.pages.forEach((page) => page.dispose());
      previous.doc.destroy();
    }
    this.#emitHistory();
    return next;
  };

  getDocumentSeed = (
    id: string,
    mode: "freeform" | "structured",
    pageId?: string
  ): CanvasDocumentSeed | null => {
    const document = this.#documents.get(id);
    if (!document) return null;
    const page = document.pages.get(pageId ?? document.activePageId);
    if (!page) return null;
    return {
      grid:
        mode === "freeform" && page.operations
          ? Array.from(this.#ensurePageIndex(document, page).materialize().entries())
          : [],
      scene:
        mode === "structured" && page.scene
          ? Array.from(page.scene.values())
          : [],
      components:
        mode === "structured" && page.components
          ? Array.from(page.components.values())
          : [],
      mode,
      activePageId: page.descriptor.id,
    };
  };

  setIntegrityIssue = (
    channel: CollaborationIntegrityIssue["channel"],
    key: string,
    issue: CollaborationIntegrityIssue | null
  ) => {
    const pageId = issue?.pageId ?? this.#active.activePageId;
    const issueKey = `${pageId}:${channel}:${key}`;
    if (issue) {
      this.#active.integrityIssues.set(issueKey, {
        ...issue,
        pageId,
      });
    }
    else this.#active.integrityIssues.delete(issueKey);
  };

  getIntegrityIssues = () => Array.from(this.#active.integrityIssues.values());

  activateDocument = (
    id: string,
    seed: CanvasDocumentSeed,
    options?: { replace?: boolean }
  ) => {
    this.#assertActive();
    const previous = this.#active;
    let next = this.#documents.get(id);
    if (!next) {
      next = this.#createDocument(id, seed);
      this.#documents.set(id, next);
    } else if (options?.replace) {
      this.#replaceDocument(next, seed);
    }
    this.#active = next;
    const requestedPageId = seed.activePageId;
    if (requestedPageId && next.pages.has(requestedPageId)) {
      this.#setActivePage(next, requestedPageId);
    }
    if (next !== previous) {
      this.#activeListeners.forEach((listener) => listener(next!, previous));
    }
    this.#emitHistory();
    return next;
  };

  ensurePage = (
    documentId: string,
    draft: CanvasPageDraft,
    options?: { activate?: boolean }
  ) => {
    const document = this.#documents.get(documentId);
    if (!document) return false;
    if (!document.pages.has(draft.id)) {
      document.doc.transact(() => {
        createCanvasYPage(
          document.root,
          draft,
          `bootstrap:${documentId}:${draft.id}:${this.#operationSequence++}`
        );
      }, HISTORY_IGNORED_ORIGIN);
      this.#syncDocumentPages(document);
      this.#emitMutation({ kind: "page-upsert", documentId, page: draft });
    }
    return options?.activate ? this.activatePage(documentId, draft.id) : true;
  };

  removePage = (documentId: string, pageId: string) => {
    const document = this.#documents.get(documentId);
    if (!document || document.pages.size <= 1 || !document.pages.has(pageId)) {
      return false;
    }
    const previousOrder = readCanvasPageOrder(document.root);
    document.doc.transact(() => {
      document.root.pages.delete(pageId);
      const index = document.root.pageOrder.toArray().indexOf(pageId);
      if (index >= 0) document.root.pageOrder.delete(index, 1);
    }, HISTORY_IGNORED_ORIGIN);
    this.#syncDocumentPages(document);
    if (document.activePageId === pageId) {
      const previousIndex = previousOrder.indexOf(pageId);
      const nextOrder = readCanvasPageOrder(document.root);
      const nextId = nextOrder[Math.min(previousIndex, nextOrder.length - 1)];
      if (nextId) this.#setActivePage(document, nextId);
    }
    this.#emitMutation({ kind: "page-delete", documentId, pageId });
    return true;
  };

  updatePage = (
    documentId: string,
    pageId: string,
    patch: Pick<Partial<CanvasPageDescriptor>, "name" | "size">
  ) => {
    const document = this.#documents.get(documentId);
    const page = document?.pages.get(pageId);
    if (!document || !page) return false;
    document.doc.transact(() => {
      document.root.pages.set(pageId, {
        ...page.descriptor,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.size ? { size: patch.size } : {}),
      });
    }, HISTORY_IGNORED_ORIGIN);
    this.#syncDocumentPages(document);
    this.#emitMutation({
      kind: "page-metadata",
      documentId,
      page: document.pages.get(pageId)?.descriptor ?? page.descriptor,
    });
    return true;
  };

  reorderPages = (documentId: string, pageIds: string[]) => {
    const document = this.#documents.get(documentId);
    if (!document) return false;
    const current = readCanvasPageOrder(document.root);
    if (
      current.length !== pageIds.length ||
      current.some((id) => !pageIds.includes(id))
    ) return false;
    document.doc.transact(() => {
      document.root.pageOrder.delete(0, document.root.pageOrder.length);
      document.root.pageOrder.push(pageIds);
    }, HISTORY_IGNORED_ORIGIN);
    this.#emitMutation({
      kind: "page-order",
      documentId,
      pageIds,
      activePageId: document.activePageId,
      mode: this.#readDocumentMode(document),
    });
    return true;
  };

  initializeCollaborativeDocument = (
    id: string,
    seed: CanvasDocumentSeed = { grid: [], scene: [], components: [] }
  ) => {
    const previous = this.#active;
    const existing = this.#documents.get(id);
    if (existing) this.#clearDocumentHistory(existing);
    existing?.pages.forEach((page) => page.dispose());
    existing?.doc.destroy();
    const next = this.#createDocument(id, seed);
    this.#documents.set(id, next);
    this.#active = next;
    this.#activeListeners.forEach((listener) => listener(next, previous));
    this.#emitHistory();
    return next;
  };

  prepareDocumentForCollaboration = (
    id: string,
    preparation: CanvasCollaborationPreparation
  ) => {
    const document = this.#documents.get(id);
    if (!document) return false;
    const { mode, documentVersion, roomId, sharedDocumentId } = preparation;
    const sharedPageId = getDefaultCanvasPageId(sharedDocumentId);
    document.collaboration = { ...preparation, pageId: sharedPageId };
    const activePage =
      document.pages.get(sharedPageId) ??
      document.pages.get(document.activePageId);

    const sharedPage: CanvasPageDraft = !activePage
      ? {
          id: sharedPageId,
          kind: mode === "structured" ? "structured" : "cell-plane",
        }
      : activePage.descriptor.id === sharedPageId
        ? activePage.descriptor
        : activePage.descriptor.kind === "cell-plane"
          ? {
              ...activePage.descriptor,
              id: sharedPageId,
              grid: Array.from(
                this.#ensurePageIndex(document, activePage).materialize()
              ),
            }
          : {
              ...activePage.descriptor,
              id: sharedPageId,
              scene: Array.from(activePage.scene.values()),
              components: Array.from(activePage.components.values()),
            };

    document.doc.transact(() => {
      if (
        activePage?.descriptor.id !== sharedPageId ||
        readCanvasPageOrder(document.root).length !== 1
      ) {
        document.root.pages.clear();
        document.root.pageOrder.delete(0, document.root.pageOrder.length);
        createCanvasYPage(
          document.root,
          sharedPage,
          `collaboration:v${documentVersion}:${sharedDocumentId}:${sharedPageId}:${this.#operationSequence++}`
        );
      }
      const page = readCanvasYPage(document.root, sharedPageId);
      if (!page) {
        throw new Error(`Failed to prepare collaboration page: ${sharedPageId}`);
      }
      if (mode === "structured") {
        page.operations.delete(0, page.operations.length);
      } else {
        page.scene.clear();
        page.components.clear();
      }
      writeCanvasDocumentMetadata(
        document.root,
        sharedDocumentId,
        mode,
        sharedPageId
      );
      document.root.meta.set("documentVersion", documentVersion);
      document.root.meta.set("roomId", roomId);
      document.root.meta.delete("lastMigration");
    }, HISTORY_IGNORED_ORIGIN);
    this.#syncDocumentPages(document);
    document.operationFormat = "encoded";
    document.undoManager.clear();
    this.#clearDocumentHistory(document);
    return true;
  };

  clearDocumentCollaboration = (id: string) => {
    const document = this.#documents.get(id);
    if (!document) return false;
    document.collaboration = null;
    return true;
  };

  resetDocument = (id: string, seed: CanvasDocumentSeed) => {
    const document = this.#documents.get(id);
    if (!document) return false;
    this.#clearDocumentHistory(document);
    this.#replaceDocument(document, seed);
    return true;
  };

  #disposeDocument = (id: string, deletePersisted: boolean) => {
    const document = this.#documents.get(id);
    if (!document || document === this.#active) return false;
    if (deletePersisted) this.#clearDocumentHistory(document);
    document.pages.forEach((page) => page.dispose());
    document.doc.destroy();
    this.#documents.delete(id);
    this.#derivedSurfaces.delete(id);
    for (let index = this.#recentPageIndexes.length - 1; index >= 0; index -= 1) {
      if (this.#recentPageIndexes[index]?.documentId === id) {
        this.#recentPageIndexes.splice(index, 1);
      }
    }
    if (deletePersisted) this.#lifecycle?.onDelete(id);
    return true;
  };

  /** Releases an inactive runtime document without deleting persisted content. */
  releaseDocument = (id: string) => this.#disposeDocument(id, false);

  destroyDocument = (id: string) => this.#disposeDocument(id, true);

  observeActiveTransactions = (
    listener: (transaction: CanvasDocumentTransaction) => void
  ) => {
    let observed = this.#active;
    const handle = (transaction: Y.Transaction) => {
      this.#syncDocumentPages(observed);
      const change = this.#readTransaction(observed, transaction);
      if (
        change.contentChanged ||
        change.sceneChanged ||
        change.componentsChanged ||
        change.pagesChanged
      ) listener(change);
    };
    observed.doc.on("afterTransaction", handle);
    const switchListener = (next: CanvasYDocument, previous: CanvasYDocument) => {
      previous.doc.off("afterTransaction", handle);
      observed = next;
      next.doc.on("afterTransaction", handle);
    };
    this.#activeListeners.add(switchListener);
    return () => {
      this.#activeListeners.delete(switchListener);
      observed.doc.off("afterTransaction", handle);
    };
  };

  undo = () => {
    const changed = this.#historyJournal.undo(
      this.#historyKey(this.getActiveAddress())
    );
    if (changed) this.#emitHistory();
    return changed;
  };
  redo = () => {
    const changed = this.#historyJournal.redo(
      this.#historyKey(this.getActiveAddress())
    );
    if (changed) this.#emitHistory();
    return changed;
  };
  clearHistory = () => {
    this.#historyJournal.clear(this.#historyKey(this.getActiveAddress()));
    this.#active.pages.forEach((page) => page.undoManager.clear());
    this.#emitHistory();
  };
  clearDocumentHistory = (id: string) => {
    const document = this.#documents.get(id);
    if (!document) return false;
    this.#clearDocumentHistory(document);
    if (document === this.#active) this.#emitHistory();
    return true;
  };
  finishHistoryCapture = () => {
    this.#active.undoManager.stopCapturing();
    this.#historyJournal.finishCapture(this.#historyKey(this.getActiveAddress()));
  };

  beginHistoryCheckpoint = (): CanvasHistoryCheckpoint => {
    const document = this.#active;
    const historyKey = this.#historyKey(this.getActiveAddress());
    document.undoManager.stopCapturing();
    const undoDepth = this.#historyJournal.getUndoDepth(historyKey);
    let settled = false;
    const finish = () => {
      document.undoManager.stopCapturing();
      this.#historyJournal.finishCapture(historyKey);
      if (document === this.#active) this.#emitHistory();
    };
    return {
      commit: () => {
        if (settled) return;
        settled = true;
        finish();
      },
      cancel: () => {
        if (settled) return;
        settled = true;
        document.undoManager.stopCapturing();
        this.#historyJournal.rollbackTo(historyKey, undoDepth);
        finish();
      },
    };
  };

  runTransaction = <Result,>(
    fn: () => Result,
    history: CanvasHistoryMode | boolean = "save"
  ): Result => this.runTransactionAt(this.getActiveAddress(), fn, history);

  runTransactionAt = <Result,>(
    address: CanvasDocumentAddress,
    fn: () => Result,
    history: CanvasHistoryMode | boolean = "save"
  ): Result => {
    const document = this.#documents.get(address.documentId);
    const page = document?.pages.get(address.pageId);
    if (!document || !page) {
      throw new Error(
        `Canvas page not found: ${address.documentId}/${address.pageId}`
      );
    }
    const mode = normalizeHistoryMode(history);
    const origin =
      mode === "none" || mode === "reset" ? HISTORY_IGNORED_ORIGIN : LOCAL_ORIGIN;
    if (mode === "save" || mode === "reset") page.undoManager.stopCapturing();
    let result!: Result;
    document.doc.transact(() => {
      result = fn();
    }, origin);
    if (mode === "save") page.undoManager.stopCapturing();
    else if (mode === "reset") {
      page.undoManager.clear();
      this.#historyJournal.clear(this.#historyKey(address));
      if (address.documentId === this.#active.id) this.#emitHistory();
    }
    return result;
  };

  mutateGrid = (
    mutation: (grid: CanvasGridWriter) => void,
    history: CanvasHistoryMode | boolean = "save"
  ) => this.mutateGridAt(this.getActiveAddress(), mutation, history);

  mutateGridAt = (
    address: CanvasDocumentAddress,
    mutation: (grid: CanvasGridWriter) => void,
    history: CanvasHistoryMode | boolean = "save"
  ) => {
    const document = this.#documents.get(address.documentId);
    const page = document?.pages.get(address.pageId);
    if (!document || !page || page.descriptor.kind !== "cell-plane") {
      throw new Error(
        `Cell Plane page not found: ${address.documentId}/${address.pageId}`
      );
    }
    let emittedOperation: CellPlaneOperation | null = null;
    let inverseOperation: CellPlaneOperation | null = null;
    const profiling = this.#mutationPerformance.isEnabled();
    const totalStartedAt = profiling ? performance.now() : 0;
    const timings = profiling ? {
      mutationMs: 0,
      normalizeMs: 0,
      forwardEncodeMs: 0,
      inverseEncodeMs: 0,
      yjsPushMs: 0,
      historyCaptureMs: 0,
      transactionOverheadMs: 0,
      notifyMs: 0,
      changedCells: 0,
    } : null;
    const transactionStartedAt = profiling ? performance.now() : 0;
    const result = this.runTransactionAt(address, () => {
      const reader = this.#ensurePageIndex(document, page);
      const changes = new Map<
        string,
        { before?: GridCell; after?: GridCell }
      >();
      const remember = (key: string) => {
        if (changes.has(key)) return;
        const before = reader.getCell(GridManager.fromKey(key));
        changes.set(key, before ? { before } : {});
      };
      const read = (key: string) => {
        const changed = changes.get(key);
        return changed ? changed.after : reader.getCell(GridManager.fromKey(key));
      };
      const writer: CanvasGridWriter = {
        get: read,
        set: (key, value) => {
          remember(key);
          changes.get(key)!.after = value;
        },
        delete: (key) => {
          remember(key);
          delete changes.get(key)!.after;
        },
        clear: () => {
          reader.materialize().forEach((_cell, key) => {
            remember(key);
            delete changes.get(key)!.after;
          });
        },
      };
      const mutationStartedAt = profiling ? performance.now() : 0;
      mutation(writer);
      if (timings) timings.mutationMs = performance.now() - mutationStartedAt;
      const normalizeStartedAt = profiling ? performance.now() : 0;
      changes.forEach((change, key) => {
        if (areJsonValuesEqual(change.before, change.after)) changes.delete(key);
      });
      if (timings) {
        timings.normalizeMs = performance.now() - normalizeStartedAt;
        timings.changedCells = changes.size;
      }
      const forwardStartedAt = profiling ? performance.now() : 0;
      const operation = gridChangesToCellPlaneOperation(
        `${document.doc.clientID}:${this.#operationSequence++}`,
        changes
      );
      if (timings) timings.forwardEncodeMs = performance.now() - forwardStartedAt;
      if (operation) {
        const pushStartedAt = profiling ? performance.now() : 0;
        page.operations.push([
          document.operationFormat === "legacy"
            ? toLegacyCellPlaneOperation(operation)
            : operation,
        ]);
        if (timings) timings.yjsPushMs = performance.now() - pushStartedAt;
      }
      emittedOperation = operation;
      if (operation) {
        const inverseStartedAt = profiling ? performance.now() : 0;
        const inverse = gridChangesToCellPlaneOperation(
          `history:${document.doc.clientID}:${this.#operationSequence++}`,
          new Map(Array.from(changes, ([key, change]) => [
            key,
            { before: change.after, after: change.before },
          ]))
        );
        inverseOperation = inverse;
        if (timings) timings.inverseEncodeMs = performance.now() - inverseStartedAt;
        if (inverse) {
          const historyStartedAt = profiling ? performance.now() : 0;
          this.#captureHistory(
            address,
            operation,
            inverse,
            normalizeHistoryMode(history)
          );
          if (timings) {
            timings.historyCaptureMs = performance.now() - historyStartedAt;
          }
        }
      }
    }, history);
    if (timings) {
      const measuredInsideTransaction =
        timings.mutationMs +
        timings.normalizeMs +
        timings.forwardEncodeMs +
        timings.inverseEncodeMs +
        timings.yjsPushMs +
        timings.historyCaptureMs;
      timings.transactionOverheadMs = Math.max(
        0,
        performance.now() - transactionStartedAt - measuredInsideTransaction
      );
    }
    if (emittedOperation) {
      const notifyStartedAt = profiling ? performance.now() : 0;
      this.#emitMutation({
        kind: "cell-plane",
        ...address,
        operation: emittedOperation,
      });
      if (timings) timings.notifyMs = performance.now() - notifyStartedAt;
    }
    if (timings) {
      const operationBytes = (operation: CellPlaneOperation | null) =>
        operation && 'payload' in operation
          ? operation.payload.byteLength
          : operation
            ? JSON.stringify(operation.rows).length * 2
            : 0;
      this.#mutationPerformance.record({
        totalMs: performance.now() - totalStartedAt,
        ...timings,
        forwardBytes: operationBytes(emittedOperation),
        inverseBytes: operationBytes(inverseOperation),
      });
    }
    return result;
  };

  applyCellPlanePatch = (
    patch: CellPlanePatch,
    history: CanvasHistoryMode | boolean = "save"
  ) => this.applyCellPlanePatchAt(this.getActiveAddress(), patch, history);

  applyCellPlanePatchAt = (
    address: CanvasDocumentAddress,
    patch: CellPlanePatch,
    history: CanvasHistoryMode | boolean = "save"
  ) => {
    const document = this.#documents.get(address.documentId);
    const page = document?.pages.get(address.pageId);
    if (!document || !page || page.descriptor.kind !== "cell-plane") {
      throw new Error(
        `Cell Plane page not found: ${address.documentId}/${address.pageId}`
      );
    }
    const operation = cellPlanePatchToOperation(
      `${document.doc.clientID}:${this.#operationSequence++}`,
      patch
    );
    if (!operation) return null;
    const inverse = this.#createInverseCellPlaneOperation(document, page, operation);
    this.runTransactionAt(address, () => {
      page.operations.push([
        document.operationFormat === "legacy"
          ? toLegacyCellPlaneOperation(operation)
          : operation,
      ]);
    }, history);
    if (inverse) this.#captureHistory(
      address,
      operation,
      inverse,
      normalizeHistoryMode(history)
    );
    this.#emitMutation({ kind: "cell-plane", ...address, operation });
    return operation;
  };

  replaceStructuredContent = (
    scene: StructuredNode[],
    components: StructuredComponentInstance[],
    history: CanvasHistoryMode | boolean = "save"
  ) => this.replaceStructuredContentAt(
    this.getActiveAddress(),
    scene,
    components,
    history
  );

  replaceStructuredContentAt = (
    address: CanvasDocumentAddress,
    scene: StructuredNode[],
    components: StructuredComponentInstance[],
    history: CanvasHistoryMode | boolean = "save"
  ) => {
    const document = this.#documents.get(address.documentId);
    const page = document?.pages.get(address.pageId);
    if (!document || !page) {
      throw new Error(
        `Structured page not found: ${address.documentId}/${address.pageId}`
      );
    }
    if (page.descriptor.kind !== "structured") {
      return this.replacePage(address.documentId, {
        ...page.descriptor,
        kind: "structured",
        scene,
        components,
      });
    }
    const forward = this.#createStructuredReplacementPatch(page, scene, components);
    const inverse = this.#invertStructuredPatch(page, forward);
    const result = this.runTransactionAt(address, () => {
      applyYMapValueDiff(page.scene, scene);
      applyYMapValueDiff(page.components, components);
      this.#captureStructuredHistory(
        address,
        forward,
        inverse,
        normalizeHistoryMode(history)
      );
    }, history);
    this.#emitMutation({ kind: "structured", ...address, ...forward });
    return result;
  };

  patchStructuredContentAt = (
    address: CanvasDocumentAddress,
    patch: CanvasStructuredContentPatch,
    history: CanvasHistoryMode | boolean = "save"
  ) => {
    const document = this.#documents.get(address.documentId);
    const page = document?.pages.get(address.pageId);
    if (!document || !page || page.descriptor.kind !== "structured") {
      throw new Error(
        `Structured page not found: ${address.documentId}/${address.pageId}`
      );
    }
    const inverse = this.#invertStructuredPatch(page, patch);
    const result = this.runTransactionAt(address, () => {
      applyYMapPatch(page.scene, patch.nodes);
      applyYMapPatch(page.components, patch.components);
      this.#captureStructuredHistory(
        address,
        patch,
        inverse,
        normalizeHistoryMode(history)
      );
    }, history);
    this.#emitMutation({ kind: "structured", ...address, ...patch });
    return result;
  };

  replaceCellPage = (
    address: CanvasDocumentAddress,
    entries: [string, GridCell][]
  ) => {
    const document = this.#documents.get(address.documentId);
    const page = document?.pages.get(address.pageId);
    if (!document || !page || page.descriptor.kind !== "cell-plane") return false;
    this.runTransactionAt(address, () => {
      page.operations.delete(0, page.operations.length);
      const bootstrap = gridEntriesToCellPlaneOperation(
        `bootstrap:${address.documentId}:${address.pageId}:${this.#operationSequence++}`,
        entries
      );
      if (bootstrap) page.operations.push([
        document.operationFormat === "legacy"
          ? toLegacyCellPlaneOperation(bootstrap)
          : bootstrap,
      ]);
    }, "reset");
    this.#emitMutation({
      kind: "page-upsert",
      documentId: address.documentId,
      page: { ...page.descriptor, grid: entries },
    });
    return true;
  };

  replacePage = (documentId: string, draft: CanvasPageDraft) => {
    const document = this.#documents.get(documentId);
    const page = document?.pages.get(draft.id);
    if (!document || !page) return false;
    if (page.descriptor.kind !== draft.kind) {
      document.doc.transact(() => {
        page.operations.delete(0, page.operations.length);
        page.scene.clear();
        page.components.clear();
        document.root.pages.set(draft.id, {
          id: draft.id,
          kind: draft.kind,
          ...(draft.name ? { name: draft.name } : {}),
          ...(draft.size ? { size: draft.size } : {}),
        });
        if (draft.kind === "cell-plane") {
          const bootstrap = gridEntriesToCellPlaneOperation(
            `replace:${documentId}:${draft.id}:${this.#operationSequence++}`,
            draft.grid ?? []
          );
          if (bootstrap) page.operations.push([
            document.operationFormat === "legacy"
              ? toLegacyCellPlaneOperation(bootstrap)
              : bootstrap,
          ]);
        } else {
          draft.scene?.forEach((node) => page.scene.set(node.id, node));
          draft.components?.forEach((component) =>
            page.components.set(component.id, component)
          );
        }
      }, HISTORY_IGNORED_ORIGIN);
      page.dispose();
      document.pages.delete(draft.id);
      this.#syncDocumentPages(document);
      this.#emitMutation({ kind: "page-upsert", documentId, page: draft });
      return true;
    }
    this.updatePage(documentId, draft.id, {
      ...(draft.name !== undefined ? { name: draft.name } : {}),
      ...(draft.size ? { size: draft.size } : {}),
    });
    if (draft.kind === "cell-plane") {
      return this.replaceCellPage(
        { documentId, pageId: draft.id },
        draft.grid ?? []
      );
    }
    this.replaceStructuredContentAt(
      { documentId, pageId: draft.id },
      draft.scene ?? [],
      draft.components ?? [],
      "reset"
    );
    return true;
  };

  dispose = () => {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#activeListeners.clear();
    this.#historyListeners.clear();
    this.#mutationListeners.clear();
    this.#documents.forEach((document) => {
      document.pages.forEach((page) => page.dispose());
      document.doc.destroy();
    });
    this.#documents.clear();
    this.#derivedSurfaces.clear();
    this.#recentPageIndexes.length = 0;
    this.#projectionCacheBudget.clear();
  };

  #createDocument(
    id: string,
    seed?: CanvasDocumentSeed,
    source?: Y.Doc,
    notifyLifecycle = true
  ): CanvasYDocument {
    const doc = source ?? new Y.Doc({ guid: id });
    const root = getCanvasDocumentRoot(doc);
    const legacyOperations = doc.share.get("cell-plane-operations");
    const legacyScene = doc.share.get("structured-scene");
    const legacyComponents = doc.share.get("structured-components");
    const storedMode = root.meta.get("mode");
    const inferredMode: CanvasMode =
      seed?.mode ??
      (storedMode === "freeform" || storedMode === "structured" || storedMode === "slide"
        ? storedMode
        : legacyScene instanceof Y.Map && legacyScene.size > 0
          ? "structured"
          : seed?.scene.length
            ? "structured"
            : "freeform");
    if (root.pages.size === 0) {
      doc.transact(() => {
        const pages = seed?.pages?.length
          ? seed.pages
          : [{
              id: seed?.activePageId ?? getDefaultCanvasPageId(id),
              kind: inferredMode === "structured" ? "structured" as const : "cell-plane" as const,
              grid:
                seed?.grid ??
                (legacyOperations instanceof Y.Array
                  ? Array.from(new CellPlaneIndex(
                      legacyOperations.toArray().filter(isCellPlaneOperation)
                    ).materialize())
                  : []),
              scene:
                seed?.scene ??
                (legacyScene instanceof Y.Map
                  ? Array.from(legacyScene.values()) as StructuredNode[]
                  : []),
              components:
                seed?.components ??
                (legacyComponents instanceof Y.Map
                  ? Array.from(legacyComponents.values()) as StructuredComponentInstance[]
                  : []),
            }];
        pages.forEach((page) =>
          createCanvasYPage(
            root,
            page,
            `bootstrap:${id}:${page.id}:${this.#operationSequence++}`
          )
        );
        const activePageId =
          seed?.activePageId && pages.some((page) => page.id === seed.activePageId)
            ? seed.activePageId
            : pages[0]!.id;
        writeCanvasDocumentMetadata(root, id, inferredMode, activePageId);
        if (legacyOperations instanceof Y.Array) {
          legacyOperations.delete(0, legacyOperations.length);
        }
        if (legacyScene instanceof Y.Map) legacyScene.clear();
        if (legacyComponents instanceof Y.Map) legacyComponents.clear();
      }, HISTORY_IGNORED_ORIGIN);
    }
    const integrityIssues = new Map<string, CollaborationIntegrityIssue>();
    const document: CanvasYDocument = {
      id,
      doc,
      root,
      pages: new Map(),
      activePageId: "",
      operations: null!,
      cellPlaneIndex: null!,
      scene: null!,
      components: null!,
      meta: root.meta,
      integrityIssues,
      undoManager: null!,
      operationFormat: "encoded",
      collaboration: null,
      repairingCollaborationPage: false,
    };
    this.#syncDocumentPages(document);
    if (seed?.activePageId && document.pages.has(seed.activePageId)) {
      this.#setActivePage(document, seed.activePageId);
    }
    if (notifyLifecycle) this.#lifecycle?.onCreate(id, doc);
    return document;
  }

  #createPageRuntime(
    document: CanvasYDocument,
    page: CanvasYPage
  ): CanvasPageRuntime {
    const { operations, scene, components } = page;
    const rebuildContentIndex = () => {
      const valid: CellPlaneOperation[] = [];
      operations.toArray().forEach((operation, index) => {
        const key = String(index);
        const issueKey = `${page.descriptor.id}:cell-plane-operations:${key}`;
        if (isCellPlaneOperation(operation)) {
          document.integrityIssues.delete(issueKey);
          valid.push(operation);
        } else {
          document.integrityIssues.set(issueKey, {
            channel: "cell-plane-operations",
            key,
            pageId: page.descriptor.id,
            reason: "Invalid CellPlane operation",
          });
        }
      });
      return new CellPlaneIndex(valid, this.#projectionCacheBudget);
    };
    const runtime: CanvasPageRuntime = {
      ...page,
      cellPlaneIndex: null,
      undoManager: new Y.UndoManager(
        page.descriptor.kind === "cell-plane"
          ? [operations]
          : [scene, components],
        {
          captureTimeout: 500,
          trackedOrigins: new Set([LOCAL_ORIGIN]),
        }
      ),
      dispose: () => undefined,
    };
    const observeOperations = (event: Y.YArrayEvent<CellPlaneOperation>) => {
      const delta = event.changes.delta;
      const insertedCount = delta.reduce(
        (count, item) => count + (item.insert?.length ?? 0),
        0
      );
      const deletedCount = delta.reduce(
        (count, item) => count + (item.delete ?? 0),
        0
      );
      const previousLength = operations.length - insertedCount + deletedCount;
      let position = 0;
      let appendOnly = deletedCount === 0;
      const appended: CellPlaneOperation[] = [];
      for (const item of delta) {
        position += item.retain ?? 0;
        if (item.insert) {
          if (position !== previousLength + appended.length) appendOnly = false;
          appended.push(...item.insert);
          position += item.insert.length;
        }
      }
      if (appendOnly && appended.every(isCellPlaneOperation)) {
        appended.forEach((operation) => runtime.cellPlaneIndex?.append(operation));
      } else if (runtime.cellPlaneIndex) {
        runtime.cellPlaneIndex.dispose();
        runtime.cellPlaneIndex = rebuildContentIndex();
        if (
          document === this.#active &&
          runtime.descriptor.id === document.activePageId
        ) {
          document.cellPlaneIndex = runtime.cellPlaneIndex;
        }
      }
    };
    operations.observe(observeOperations);
    const notify = () => {
      if (
        document === this.#active &&
        runtime.descriptor.id === document.activePageId
      ) this.#emitHistory();
    };
    runtime.undoManager.on("stack-item-added", notify);
    runtime.undoManager.on("stack-item-popped", notify);
    runtime.undoManager.on("stack-cleared", notify);
    runtime.undoManager.on("stack-item-updated", notify);
    runtime.dispose = () => {
      operations.unobserve(observeOperations);
      runtime.undoManager.off("stack-item-added", notify);
      runtime.undoManager.off("stack-item-popped", notify);
      runtime.undoManager.off("stack-cleared", notify);
      runtime.undoManager.off("stack-item-updated", notify);
      runtime.undoManager.destroy();
      runtime.cellPlaneIndex?.dispose();
      runtime.cellPlaneIndex = null;
    };
    return runtime;
  }

  #syncDocumentPages(document: CanvasYDocument) {
    const readPages = () => {
      const pages = new Map<string, CanvasPageRuntime>();
      for (const pageId of readCanvasPageOrder(document.root)) {
        const page = readCanvasYPage(document.root, pageId);
        if (!page) continue;
        const existing = document.pages.get(pageId);
        if (
          existing?.operations === page.operations &&
          existing.descriptor.kind === page.descriptor.kind
        ) {
          existing.descriptor = page.descriptor;
          pages.set(pageId, existing);
        } else {
          pages.set(pageId, this.#createPageRuntime(document, page));
        }
      }
      return pages;
    };

    let nextPages = readPages();
    if (
      nextPages.size === 0 &&
      document.collaboration &&
      !document.repairingCollaborationPage
    ) {
      const binding = document.collaboration;
      document.repairingCollaborationPage = true;
      try {
        document.doc.transact(() => {
          createCanvasYPage(
            document.root,
            {
              id: binding.pageId,
              kind:
                binding.mode === "structured" ? "structured" : "cell-plane",
            },
            `collaboration-repair:v${binding.documentVersion}:${binding.sharedDocumentId}:${binding.pageId}:${this.#operationSequence++}`
          );
          writeCanvasDocumentMetadata(
            document.root,
            binding.sharedDocumentId,
            binding.mode,
            binding.pageId
          );
          document.root.meta.set(
            "documentVersion",
            binding.documentVersion
          );
          document.root.meta.set("roomId", binding.roomId);
        }, HISTORY_IGNORED_ORIGIN);
      } finally {
        document.repairingCollaborationPage = false;
      }
      nextPages = readPages();
    }
    if (nextPages.size === 0) {
      throw new Error(`Canvas document has no valid pages: ${document.id}`);
    }

    document.pages.forEach((page, pageId) => {
      if (!nextPages.has(pageId)) page.dispose();
    });
    document.pages = nextPages;
    const storedActivePageId = document.root.meta.get("activePageId");
    const nextActivePageId =
      document.activePageId && nextPages.has(document.activePageId)
        ? document.activePageId
        : typeof storedActivePageId === "string" && nextPages.has(storedActivePageId)
        ? storedActivePageId
        : nextPages.keys().next().value;
    if (!nextActivePageId) {
      throw new Error(`Canvas document has no valid pages: ${document.id}`);
    }
    this.#setActivePage(document, nextActivePageId);
  }

  #ensurePageIndex(document: CanvasYDocument, page: CanvasPageRuntime) {
    if (!page.cellPlaneIndex) {
      page.cellPlaneIndex = new CellPlaneIndex(
        page.operations.toArray().filter(isCellPlaneOperation),
        this.#projectionCacheBudget
      );
    }
    const existing = this.#recentPageIndexes.findIndex(
      (entry) =>
        entry.documentId === document.id && entry.pageId === page.descriptor.id
    );
    if (existing >= 0) this.#recentPageIndexes.splice(existing, 1);
    this.#recentPageIndexes.push({
      documentId: document.id,
      pageId: page.descriptor.id,
    });
    while (this.#recentPageIndexes.length > MAX_RESIDENT_PAGE_INDEXES) {
      const victim = this.#recentPageIndexes.shift();
      if (!victim) break;
      const victimDocument = this.#documents.get(victim.documentId);
      const victimPage = victimDocument?.pages.get(victim.pageId);
      if (!victimPage?.cellPlaneIndex) continue;
      if (
        victimDocument === this.#active &&
        victimPage.descriptor.id === victimDocument.activePageId
      ) {
        this.#recentPageIndexes.push(victim);
        continue;
      }
      victimPage.cellPlaneIndex.dispose();
      victimPage.cellPlaneIndex = null;
    }
    return page.cellPlaneIndex;
  }

  #setActivePage(document: CanvasYDocument, pageId: string) {
    const page = document.pages.get(pageId);
    if (!page) throw new Error(`Canvas page not found: ${document.id}/${pageId}`);
    document.activePageId = pageId;
    document.operations = page.operations;
    document.cellPlaneIndex = this.#ensurePageIndex(document, page);
    document.scene = page.scene;
    document.components = page.components;
    document.undoManager = page.undoManager;
  }

  #replaceDocument(document: CanvasYDocument, seed: CanvasDocumentSeed) {
    const mode =
      seed.mode ?? (seed.scene.length > 0 ? "structured" : "freeform");
    const pages = seed.pages?.length
      ? seed.pages
      : [{
          id: seed.activePageId ?? getDefaultCanvasPageId(document.id),
          kind: mode === "structured" ? "structured" as const : "cell-plane" as const,
          grid: seed.grid,
          scene: seed.scene,
          components: seed.components,
        }];
    document.pages.forEach((page) => page.dispose());
    document.pages.clear();
    document.doc.transact(() => {
      document.root.pages.clear();
      document.root.pageOrder.delete(0, document.root.pageOrder.length);
      pages.forEach((page) =>
        createCanvasYPage(
          document.root,
          page,
          `bootstrap:${document.id}:${page.id}:${this.#operationSequence++}`
        )
      );
      const activePageId =
        seed.activePageId && pages.some((page) => page.id === seed.activePageId)
          ? seed.activePageId
          : pages[0]!.id;
      writeCanvasDocumentMetadata(document.root, document.id, mode, activePageId);
    }, HISTORY_IGNORED_ORIGIN);
    this.#syncDocumentPages(document);
  }

  #readTransaction(document: CanvasYDocument, transaction: Y.Transaction) {
    const change: CanvasDocumentTransaction = {
      address: {
        documentId: document.id,
        pageId: document.activePageId,
      },
      sceneChanged: false,
      sceneChangedIds: [],
      componentsChanged: false,
      componentChangedIds: [],
      contentChanged: false,
      pagesChanged: false,
    };
    const activePage = document.pages.get(document.activePageId);
    for (const [type, keys] of transaction.changed) {
      if (Object.is(type, activePage?.operations)) change.contentChanged = true;
      else if (Object.is(type, activePage?.scene)) {
        change.sceneChanged = true;
        change.sceneChangedIds = [...keys].filter(
          (key): key is string => typeof key === "string"
        );
      }
      else if (Object.is(type, activePage?.components)) {
        change.componentsChanged = true;
        change.componentChangedIds = [...keys].filter(
          (key): key is string => typeof key === "string"
        );
      }
      else if (
        Object.is(type, document.root.pages) ||
        Object.is(type, document.root.pageOrder)
      ) change.pagesChanged = true;
    }
    return change;
  }

  #captureHistory(
    address: CanvasDocumentAddress,
    forward: CellPlaneOperation,
    inverse: CellPlaneOperation,
    mode: CanvasHistoryMode
  ) {
    if (mode !== "save" && mode !== "merge") return;
    this.#historyJournal.capture(this.#historyKey(address), {
      forward: { kind: "cell-plane", ...address, operation: forward },
      inverse: { kind: "cell-plane", ...address, operation: inverse },
    }, mode);
    if (address.documentId === this.#active.id) this.#emitHistory();
  }

  #captureStructuredHistory(
    address: CanvasDocumentAddress,
    forward: CanvasStructuredContentPatch,
    inverse: CanvasStructuredContentPatch,
    mode: CanvasHistoryMode
  ) {
    if (mode !== "save" && mode !== "merge") return;
    this.#historyJournal.capture(this.#historyKey(address), {
      forward: { kind: "structured", ...address, ...forward },
      inverse: { kind: "structured", ...address, ...inverse },
    }, mode);
    if (address.documentId === this.#active.id) this.#emitHistory();
  }

  #createInverseCellPlaneOperation(
    document: CanvasYDocument,
    page: CanvasPageRuntime,
    operation: CellPlaneOperation
  ) {
    const bounds = {
      x: operation.bounds.x - 1,
      y: operation.bounds.y,
      width: operation.bounds.width + 2,
      height: operation.bounds.height,
    };
    const before = this.#ensurePageIndex(document, page).materialize(bounds);
    const bootstrap = gridEntriesToCellPlaneOperation(
      `history-base:${document.doc.clientID}:${this.#operationSequence++}`,
      Array.from(before)
    );
    const projection = new CellPlaneIndex([
      ...(bootstrap ? [bootstrap] : []),
      operation,
    ]);
    const after = projection.materialize(bounds);
    projection.dispose();
    const keys = new Set([...before.keys(), ...after.keys()]);
    const changes = new Map<string, { before?: GridCell; after?: GridCell }>();
    keys.forEach((key) => {
      const previous = before.get(key);
      const next = after.get(key);
      if (!areJsonValuesEqual(previous, next)) {
        changes.set(key, { before: next, after: previous });
      }
    });
    return gridChangesToCellPlaneOperation(
      `history:${document.doc.clientID}:${this.#operationSequence++}`,
      changes
    );
  }

  #createStructuredReplacementPatch(
    page: CanvasPageRuntime,
    scene: readonly StructuredNode[],
    components: readonly StructuredComponentInstance[]
  ): CanvasStructuredContentPatch {
    const sceneIds = new Set(scene.map(({ id }) => id));
    const componentIds = new Set(components.map(({ id }) => id));
    return {
      nodes: {
        upsert: scene,
        deleteIds: Array.from(page.scene.keys()).filter((id) => !sceneIds.has(id)),
      },
      components: {
        upsert: components,
        deleteIds: Array.from(page.components.keys()).filter(
          (id) => !componentIds.has(id)
        ),
      },
    };
  }

  #invertStructuredPatch(
    page: CanvasPageRuntime,
    patch: CanvasStructuredContentPatch
  ): CanvasStructuredContentPatch {
    const invert = <T extends { id: string }>(
      map: Y.Map<T>,
      valuePatch: { upsert?: readonly T[]; deleteIds?: readonly string[] } | undefined
    ) => {
      if (!valuePatch) return undefined;
      const ids = new Set([
        ...(valuePatch.deleteIds ?? []),
        ...(valuePatch.upsert ?? []).map(({ id }) => id),
      ]);
      const upsert: T[] = [];
      const deleteIds: string[] = [];
      ids.forEach((id) => {
        const current = map.get(id);
        if (current) upsert.push(current);
        else deleteIds.push(id);
      });
      return { upsert, deleteIds };
    };
    return {
      nodes: invert(page.scene, patch.nodes),
      components: invert(page.components, patch.components),
    };
  }

  #applyMutationEnvelope(envelope: CanvasMutationEnvelope) {
    const document = this.#documents.get(envelope.documentId);
    if (!document) return;
    if (envelope.kind === "cell-plane") {
      const page = document.pages.get(envelope.pageId);
      if (!page || page.descriptor.kind !== "cell-plane") return;
      document.doc.transact(() => page.operations.push([
        document.operationFormat === "legacy"
          ? toLegacyCellPlaneOperation(envelope.operation)
          : envelope.operation,
      ]), HISTORY_IGNORED_ORIGIN);
      this.#emitMutation(envelope);
      return;
    }
    if (envelope.kind === "structured") {
      const page = document.pages.get(envelope.pageId);
      if (!page || page.descriptor.kind !== "structured") return;
      document.doc.transact(() => {
        applyYMapPatch(page.scene, envelope.nodes);
        applyYMapPatch(page.components, envelope.components);
      }, HISTORY_IGNORED_ORIGIN);
      this.#emitMutation(envelope);
      return;
    }
    if (envelope.kind === "page-metadata") {
      document.doc.transact(() => {
        document.root.pages.set(envelope.page.id, envelope.page);
      }, HISTORY_IGNORED_ORIGIN);
      this.#syncDocumentPages(document);
      this.#emitMutation(envelope);
      return;
    }
    if (envelope.kind === "page-upsert") {
      document.doc.transact(() => {
        const current = readCanvasYPage(document.root, envelope.page.id);
        if (current) {
          current.operations.delete(0, current.operations.length);
          current.scene.clear();
          current.components.clear();
        }
        createCanvasYPage(
          document.root,
          envelope.page,
          `history:${document.id}:${this.#operationSequence++}`
        );
      }, HISTORY_IGNORED_ORIGIN);
      this.#syncDocumentPages(document);
      this.#emitMutation(envelope);
      return;
    }
    if (envelope.kind === "page-delete") {
      document.doc.transact(() => {
        document.root.pages.delete(envelope.pageId);
        const index = document.root.pageOrder.toArray().indexOf(envelope.pageId);
        if (index >= 0) document.root.pageOrder.delete(index, 1);
      }, HISTORY_IGNORED_ORIGIN);
      this.#syncDocumentPages(document);
      this.#emitMutation(envelope);
      return;
    }
    document.doc.transact(() => {
      document.root.pageOrder.delete(0, document.root.pageOrder.length);
      document.root.pageOrder.push([...envelope.pageIds]);
      writeCanvasDocumentMetadata(
        document.root,
        document.id,
        envelope.mode,
        envelope.activePageId
      );
    }, HISTORY_IGNORED_ORIGIN);
    this.#syncDocumentPages(document);
    this.#emitMutation(envelope);
  }

  #historyKey(address: CanvasDocumentAddress) {
    return `${address.documentId}\u0000${address.pageId}`;
  }

  #clearDocumentHistory(document: CanvasYDocument) {
    document.pages.forEach((_page, pageId) => {
      this.#historyJournal.clear(this.#historyKey({
        documentId: document.id,
        pageId,
      }));
    });
  }

  #emitHistory() {
    const availability = this.getHistoryAvailability();
    this.#historyListeners.forEach((listener) => listener(availability));
  }

  #emitMutation(envelope: CanvasMutationEnvelope) {
    this.#mutationListeners.forEach((listener) => listener(envelope));
  }

  #readDocumentMode(document: CanvasYDocument): CanvasMode {
    const mode = document.root.meta.get("mode");
    return mode === "freeform" || mode === "structured" || mode === "slide"
      ? mode
      : "freeform";
  }

  #assertActive() {
    if (this.#disposed) throw new Error("CanvasDocumentRegistry is disposed");
  }
}
