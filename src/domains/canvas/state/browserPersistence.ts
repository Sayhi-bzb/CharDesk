import * as Y from "yjs";
import {
  IndexeddbPersistence,
  clearDocument,
  storeState,
} from "y-indexeddb";
import {
  EDITOR_PERSISTENCE_KEY,
  EDITOR_PERSISTENCE_VERSION,
  LEGACY_EDITOR_PERSISTENCE_KEY,
  LEGACY_EDITOR_PERSISTENCE_VERSION,
  PREVIOUS_EDITOR_PERSISTENCE_VERSION,
  CANVAS_CATALOG_MARKER_KEY,
  CanvasCatalogOpenError,
  createSessionId,
  createIndexedDbCanvasCatalog,
  decodePersistedEditorState,
  migratePersistedStateToV6,
  isSourceBackedCanvasSession,
  getCanvasSessionFallbackSnapshot,
  getCanvasSessionRestoreRecord,
  type CanvasImportSnapshot,
  type CanvasCatalog,
  type CanvasCatalogFailureReason,
  type CanvasCatalogSnapshot,
  type CanvasSessionSnapshot,
  type CanvasSessionDescriptor,
  type SourceBackedCanvasSessionSnapshot,
} from "@/domains/sessions/public";
import {
  SLIDE_SIZE_PRESETS,
  type SlideDeckDescriptor,
} from "@/domains/slides/public";
import {
  getCollaborationDocumentId,
  isCollaborationDescriptor,
} from "@/domains/collaboration/public";
import type { GridCell } from "@/shared/types";
import {
  CellPlaneIndex,
  gridEntriesToCellPlaneOperation,
  isEncodedCellPlaneOperation,
  isCellPlaneOperation,
  type CellPlaneOperation,
} from "../cell-plane/model";
import type { CanvasStore } from "./editorStore";
import {
  CanvasDocumentRegistry,
  type CanvasDocumentSeed,
} from "./CanvasDocumentRegistry";
import {
  createPersistedEditorSnapshot,
  recoverPersistedEditorState,
} from "./editorPersistence";
import {
  getSessionCanvasDocumentId,
  resolveSessionDocumentRuntime,
} from "./helpers/storeUtils";
import {
  createStructuredContentSurface,
  rebuildContentSurface,
} from "./helpers/gridHelpers";
import { readSlideDeckDescriptor } from "./slideDocumentPages";
import {
  CANVAS_DOCUMENT_SCHEMA_VERSION,
  getCanvasDocumentRoot,
  getDefaultCanvasPageId,
  readCanvasPageDescriptor,
  readCanvasPageOrder,
  readCanvasYPage,
  writeCanvasDocumentMetadata,
} from "./canvasDocumentModel";
import type {
  CanvasDocumentLoadRequest,
  CanvasDocumentResidency,
} from "./documentResidencyPort";
import {
  applyCanvasDocumentSeed,
  createCompactedDocument,
  readDocumentSeed,
  resolveSeedPages,
} from "./canvasCheckpointDocument";
import {
  CanvasCheckpointWorkerClient,
} from "./canvasCheckpointWorkerClient";
import { encodeCanvasCheckpointSnapshot } from "./canvasCheckpointSnapshot";
import type { CanvasCheckpointTailEntry } from "./canvasCheckpointProtocol";
import {
  CanvasCheckpointService,
  type CanvasCheckpointCandidate,
  type CanvasCheckpointDiagnostics,
} from "./CanvasCheckpointService";
import { acquireOriginExclusiveLease } from "@/shared/services/originExclusiveLease";

const LOCAL_DOCUMENT_PREFIX = "chardesk-local-document-v1:";
const HISTORICAL_EDITOR_PERSISTENCE_KEYS = [
  "ascii-canvas-persistence-v4-backup",
] as const;
const CATALOG_INTENT_KEY = "chardesk-canvas-catalog-intent-v1";
const SAVE_DELAY = 500;
const DOCUMENT_GENERATION_SUFFIX = ":generation:";
const DOCUMENT_STRUCT_ROTATION_THRESHOLD = 10_000;
const CHECKPOINT_IDLE_DELAY = 5_000;
const COORDINATOR_LOCK_NAME = "chardesk-canvas-workspace-writer-v1";
const CATALOG_WRITE_LOCK_NAME = "chardesk-canvas-catalog-write-v1";
const CATALOG_WRITE_LEASE_KEY = "chardesk-canvas-catalog-write-lease-v1";
const LOCAL_DOCUMENT_SYNC_CHANNEL = "chardesk-canvas-document-sync-v1";
const COORDINATOR_LEASE_KEY = "chardesk-canvas-writer-lease-v1";
const COORDINATOR_LEASE_DURATION = 8_000;
const MAX_RESIDENT_CANVASES = 4;
const COORDINATOR_LOCK_TIMEOUT = 2_000;
const DOCUMENT_SYNC_TIMEOUT = 15_000;
const RESTORE_CLEANUP_TIMEOUT = 2_000;

export type CanvasRestoreFailureReason = CanvasCatalogFailureReason;

class CanvasRestoreError extends Error {
  readonly reason: CanvasRestoreFailureReason;

  constructor(reason: CanvasRestoreFailureReason, message: string) {
    super(message);
    this.name = "CanvasRestoreError";
    this.reason = reason;
  }
}

const withRestoreTimeout = <T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  message: string
) => new Promise<T>((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new CanvasRestoreError("storage-timeout", message));
  }, timeoutMs);
  Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timeout));
});

const bestEffortDestroyProvider = async (provider: IndexeddbPersistence) => {
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, RESTORE_CLEANUP_TIMEOUT);
    Promise.resolve()
      .then(() => provider.destroy())
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timeout);
        resolve();
      });
  });
};

const persistProviderState = async (
  provider: IndexeddbPersistence,
  forceStore: boolean
) => {
  if (!provider.db) return;
  try {
    await storeState(provider, forceStore);
  } catch (error) {
    if (!provider.db) return;
    throw error;
  }
};

const waitForDocumentSync = (
  provider: IndexeddbPersistence,
  databaseName: string
) => withRestoreTimeout(
  provider.whenSynced,
  DOCUMENT_SYNC_TIMEOUT,
  `Canvas document did not sync in time: ${databaseName}`
);

const getRestoreFailureReason = (
  error: unknown
): CanvasRestoreFailureReason =>
  error instanceof CanvasRestoreError || error instanceof CanvasCatalogOpenError
    ? error.reason
    : "storage-unavailable";

export type CanvasPersistenceStatus = {
  phase: "restoring" | "ready" | "degraded";
  restore: {
    phase: "initializing" | "ready" | "temporary" | "retrying";
    reason: CanvasRestoreFailureReason | null;
    error: string | null;
    temporaryDirty: boolean;
  };
  save: "saved" | "saving" | "error";
  coordination: "coordinator" | "peer";
  error: string | null;
};

type Listener = () => void;

type BrowserCanvasPersistenceOptions = {
  legacyStorage: Storage;
  legacyKey?: string;
};

type PersistedDocument = {
  doc: Y.Doc;
  provider: IndexeddbPersistence;
  updateListener: (update: Uint8Array, origin: unknown) => void;
};

type LocalDocumentSyncMessage = Readonly<{
  type: "document-update";
  senderId: string;
  documentId: string;
  generation: number;
  update: Uint8Array;
}>;

type BrowserCheckpointCandidate = CanvasCheckpointCandidate & {
  id: string;
  databaseName: string;
  taskId: number;
  doc: Y.Doc | null;
  provider: IndexeddbPersistence | null;
  digest: string | null;
  snapshotBytes: number;
  reclaimedBytes: number;
  committed: boolean;
};

type PersistedDocumentLocation = {
  id: string;
  generation: number;
};

type RestoredSessions = {
  sessions: CanvasSessionSnapshot[];
  activeDocument: Y.Doc;
  activeSessionId: string;
};

type ExclusiveLease = {
  held: boolean;
  release: () => void;
};

const acquireStorageLease = (
  storage: Storage,
  key: string,
  duration: number,
): ExclusiveLease => {
  const token = crypto.randomUUID();
  const read = () => {
    try {
      return JSON.parse(storage.getItem(key) ?? "null") as {
        token?: string;
        expires?: number;
      } | null;
    } catch {
      return null;
    }
  };
  const current = read();
  if (current?.token && (current.expires ?? 0) > Date.now()) {
    return { held: false, release: () => undefined };
  }
  const renew = () => storage.setItem(
    key,
    JSON.stringify({ token, expires: Date.now() + duration })
  );
  renew();
  if (read()?.token !== token) {
    return { held: false, release: () => undefined };
  }
  const timer = setInterval(renew, duration / 2);
  return {
    held: true,
    release: () => {
      clearInterval(timer);
      if (read()?.token === token) storage.removeItem(key);
    },
  };
};

const acquireCoordinatorLease = async (
  storage: Storage,
): Promise<ExclusiveLease> => {
  if (typeof navigator === "undefined" || !navigator.locks) {
    return acquireStorageLease(
      storage,
      COORDINATOR_LEASE_KEY,
      COORDINATOR_LEASE_DURATION,
    );
  }
  const lease = await withRestoreTimeout(
    acquireOriginExclusiveLease({
      manager: navigator.locks,
      name: COORDINATOR_LOCK_NAME,
    }),
    COORDINATOR_LOCK_TIMEOUT,
    "Canvas coordinator lock did not respond in time"
  );
  return {
    held: !!lease,
    release: lease?.release ?? (() => undefined),
  };
};

const waitForCatalog = async (catalog: CanvasCatalog) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const snapshot = await catalog.load();
    if (snapshot) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
};

const getDocumentDatabaseName = (id: string, generation = 0) =>
  `${LOCAL_DOCUMENT_PREFIX}${id}${generation > 0
    ? `${DOCUMENT_GENERATION_SUFFIX}${generation}`
    : ""}`;

const parseDocumentDatabaseName = (
  name: string
): PersistedDocumentLocation | null => {
  if (!name.startsWith(LOCAL_DOCUMENT_PREFIX)) return null;
  const rawId = name.slice(LOCAL_DOCUMENT_PREFIX.length);
  const generationMatch = /:generation:(\d+)$/.exec(rawId);
  const id = generationMatch
    ? rawId.slice(0, generationMatch.index)
    : rawId;
  if (!id || id.includes(":slide:")) return null;
  return {
    id,
    generation: generationMatch ? Number(generationMatch[1]) : 0,
  };
};

const emptySeed = (): CanvasDocumentSeed => ({
  grid: [],
  scene: [],
  components: [],
});

const PAGE_CHANNEL_PATTERN =
  /^canvas-page:([^:]+):(cell-plane-operations|structured-scene|structured-components)$/;

const readPageChannelIds = (doc: Y.Doc) => {
  const ids = new Set<string>();
  for (const name of doc.share.keys()) {
    const match = PAGE_CHANNEL_PATTERN.exec(name);
    if (!match) continue;
    try {
      const id = decodeURIComponent(match[1]!);
      if (id.length > 0) ids.add(id);
    } catch {
      // A malformed channel name is retained but cannot address a Canvas page.
    }
  }
  return ids;
};

const hasLegacyContent = (doc: Y.Doc) => {
  return doc.getMap("main-grid").size > 0 ||
    doc.getArray("cell-plane-operations").length > 0 ||
    doc.getMap("structured-scene").size > 0 ||
    doc.getMap("structured-components").size > 0;
};

const hasValidPages = (doc: Y.Doc) => {
  const root = getCanvasDocumentRoot(doc);
  return readCanvasPageOrder(root).some((id) => !!readCanvasYPage(root, id));
};

const isDocumentEmpty = (doc: Y.Doc) => {
  return !hasValidPages(doc) &&
    readPageChannelIds(doc).size === 0 &&
    !hasLegacyContent(doc);
};

const countDocumentStructs = (doc: Y.Doc) => {
  let count = 0;
  doc.store.clients.forEach((structs) => { count += structs.length; });
  return count;
};

const getDocumentAuthorityMetrics = (doc: Y.Doc) => {
  const root = getCanvasDocumentRoot(doc);
  let operations = 0;
  let authorityPayloadBytes = 0;
  readCanvasPageOrder(root).forEach((pageId) => {
    const page = readCanvasYPage(root, pageId);
    if (page?.descriptor.kind === "structured") {
      page.scene.forEach((value) => {
        authorityPayloadBytes += JSON.stringify(value).length * 2;
      });
      page.components.forEach((value) => {
        authorityPayloadBytes += JSON.stringify(value).length * 2;
      });
    }
    page?.operations.forEach((operation) => {
      if (!isCellPlaneOperation(operation)) return;
      operations += 1;
      authorityPayloadBytes += "payload" in operation
        ? operation.payload.byteLength
        : JSON.stringify(operation.rows).length * 2;
    });
  });
  return {
    yjsStructs: countDocumentStructs(doc),
    operations,
    authorityPayloadBytes,
  };
};

const hasLegacyCellPlaneOperations = (doc: Y.Doc) => {
  const root = getCanvasDocumentRoot(doc);
  return readCanvasPageOrder(root).some((pageId) => {
    const page = readCanvasYPage(root, pageId);
    return page?.operations.toArray().some(
      (operation) =>
        isCellPlaneOperation(operation) && !isEncodedCellPlaneOperation(operation)
    ) ?? false;
  });
};

const seedFromImportSnapshot = (
  snapshot: CanvasImportSnapshot
): CanvasDocumentSeed =>
  snapshot.mode === "slide"
    ? {
        mode: "slide",
        activePageId: snapshot.slideDeck.activeSlideId,
        pages: snapshot.slideDeck.slides.map((slide) => ({
          id: slide.id,
          name: slide.name,
          size: slide.size,
          kind: "cell-plane",
          grid: slide.grid,
        })),
        grid: [],
        scene: [],
        components: [],
      }
    : snapshot.mode === "structured"
      ? {
        mode: "structured",
        grid: [],
        scene: snapshot.scene,
        components: snapshot.components,
      }
    : { mode: "freeform", grid: snapshot.grid, scene: [], components: [] };

const seedFromSessionSnapshot = (
  session: CanvasSessionSnapshot
): CanvasDocumentSeed =>
  seedFromImportSnapshot(getCanvasSessionFallbackSnapshot(session));

const createBlankDescriptorSeed = (
  session: CanvasSessionDescriptor
): CanvasDocumentSeed =>
  session.mode === "slide"
    ? {
        mode: "slide",
        activePageId: `${session.id}-slide-1`,
        pages: [{
          id: `${session.id}-slide-1`,
          name: "Slide 1",
          size: { ...SLIDE_SIZE_PRESETS.widescreen },
          kind: "cell-plane",
          grid: [],
        }],
        grid: [],
        scene: [],
        components: [],
      }
    : {
        mode: session.mode,
        grid: [],
        scene: [],
        components: [],
      };

const readActiveSessionSeed = (doc: Y.Doc, id: string): CanvasDocumentSeed => {
  const seed = readDocumentSeed(doc, id);
  const page = seed.pages?.find(({ id: pageId }) => pageId === seed.activePageId) ??
    seed.pages?.[0];
  if (!page) return seed;
  return "grid" in page
    ? {
        mode: seed.mode,
        activePageId: page.id,
        grid: page.grid ?? [],
        scene: [],
        components: [],
      }
    : {
        mode: seed.mode,
        activePageId: page.id,
        grid: [],
        scene: page.scene ?? [],
        components: page.components ?? [],
      };
};

const readCellPlaneGrid = (doc: Y.Doc): [string, GridCell][] => {
  const root = getCanvasDocumentRoot(doc);
  const activePageId = root.meta.get("activePageId");
  const pageId =
    typeof activePageId === "string"
      ? activePageId
      : readCanvasPageOrder(root)[0];
  const page = pageId ? readCanvasYPage(root, pageId) : null;
  const operations = page?.operations ??
    doc.getArray<CellPlaneOperation>("cell-plane-operations");
  return Array.from(new CellPlaneIndex(operations.toArray()).materialize());
};

const readNestedType = (
  value: unknown,
  keys: string[]
) => {
  if (!(value instanceof Y.Map)) return null;
  for (const key of keys) {
    const candidate = value.get(key);
    if (candidate instanceof Y.AbstractType) return candidate;
  }
  return null;
};

const replacePageOrder = (
  order: Y.Array<string>,
  pageIds: string[]
) => {
  const current = order.toArray();
  if (
    current.length === pageIds.length &&
    current.every((id, index) => id === pageIds[index])
  ) return;
  order.delete(0, order.length);
  if (pageIds.length > 0) order.push(pageIds);
};

const migrateLegacyDocument = (
  doc: Y.Doc,
  id: string,
  seed: CanvasDocumentSeed
) => {
  const root = getCanvasDocumentRoot(doc);
  const seedPages = resolveSeedPages(id, seed);
  const seedById = new Map(seedPages.map((page) => [page.id, page]));
  const storedPageIds = readCanvasPageOrder(root)
    .filter((pageId) => pageId.length > 0);
  const pageIds = Array.from(new Set([
    ...storedPageIds,
    ...readPageChannelIds(doc),
  ]));
  const legacyGrid = doc.getMap<GridCell>("main-grid");
  const operations = doc.getArray<CellPlaneOperation>("cell-plane-operations");
  const legacyScene = doc.getMap<CanvasDocumentSeed["scene"][number]>(
    "structured-scene"
  );
  const legacyComponents = doc.getMap<NonNullable<CanvasDocumentSeed["components"]>[number]>(
    "structured-components"
  );
  const legacyContent = hasLegacyContent(doc);
  if (pageIds.length === 0 && legacyContent) {
    pageIds.push(seed.activePageId ?? getDefaultCanvasPageId(id));
  }
  if (pageIds.length === 0) return false;

  const validCurrentDocument =
    root.meta.get("schemaVersion") === CANVAS_DOCUMENT_SCHEMA_VERSION &&
    !legacyContent &&
    pageIds.every((pageId) => {
      const value = root.pages.get(pageId);
      return !(value instanceof Y.Map) &&
        !!readCanvasPageDescriptor(pageId, value);
    }) &&
    root.pageOrder.toArray().length === pageIds.length &&
    root.pageOrder.toArray().every((pageId, index) => pageId === pageIds[index]);
  if (validCurrentDocument) return false;

  doc.transact(() => {
    pageIds.forEach((pageId, index) => {
      const rawDescriptor = root.pages.get(pageId);
      const currentDescriptor = readCanvasPageDescriptor(pageId, rawDescriptor);
      const seedPage = seedById.get(pageId);
      const prefix = `canvas-page:${encodeURIComponent(pageId)}:`;
      const pageOperations = doc.getArray<CellPlaneOperation>(
        prefix + "cell-plane-operations"
      );
      const pageScene = doc.getMap<CanvasDocumentSeed["scene"][number]>(
        prefix + "structured-scene"
      );
      const pageComponents = doc.getMap<NonNullable<CanvasDocumentSeed["components"]>[number]>(
        prefix + "structured-components"
      );
      const nestedOperations = readNestedType(
        rawDescriptor,
        ["operations", "cell-plane-operations"]
      );
      const nestedScene = readNestedType(
        rawDescriptor,
        ["scene", "structured-scene"]
      );
      const nestedComponents = readNestedType(
        rawDescriptor,
        ["components", "structured-components"]
      );
      if (pageOperations.length === 0 && nestedOperations instanceof Y.Array) {
        const valid = nestedOperations.toArray().filter(isCellPlaneOperation);
        if (valid.length > 0) pageOperations.push(valid);
      }
      if (pageScene.size === 0 && nestedScene instanceof Y.Map) {
        nestedScene.forEach((value, key) => pageScene.set(key, value));
      }
      if (pageComponents.size === 0 && nestedComponents instanceof Y.Map) {
        nestedComponents.forEach((value, key) => pageComponents.set(key, value));
      }

      const rootMode = root.meta.get("mode");
      const kind = seedPage?.kind ?? currentDescriptor?.kind ??
        (seed.mode === "structured" || rootMode === "structured" ||
            pageScene.size > 0 || pageComponents.size > 0
          ? "structured"
          : "cell-plane");
      if (index === 0 && kind === "cell-plane" && pageOperations.length === 0) {
        const legacyOperation = legacyGrid.size > 0
          ? gridEntriesToCellPlaneOperation(
              `legacy-bootstrap:${id}:${pageId}`,
              Array.from(legacyGrid.entries()) as [string, GridCell][]
            )
          : null;
        if (legacyOperation) pageOperations.push([legacyOperation]);
        else {
          const valid = operations.toArray().filter(isCellPlaneOperation);
          if (valid.length > 0) pageOperations.push(valid);
        }
      }
      if (index === 0 && kind === "structured") {
        if (pageScene.size === 0) {
          legacyScene.forEach((value, key) => pageScene.set(key, value));
        }
        if (pageComponents.size === 0) {
          legacyComponents.forEach((value, key) => pageComponents.set(key, value));
        }
      }
      root.pages.set(pageId, {
        id: pageId,
        kind,
        ...(seedPage?.name ?? currentDescriptor?.name
          ? { name: seedPage?.name ?? currentDescriptor?.name }
          : {}),
        ...(seedPage?.size ?? currentDescriptor?.size
          ? { size: seedPage?.size ?? currentDescriptor?.size }
          : {}),
      });
    });
    Array.from(root.pages.keys()).forEach((pageId) => {
      if (!pageIds.includes(pageId)) root.pages.delete(pageId);
    });
    replacePageOrder(root.pageOrder, pageIds);
    const storedActivePageId = root.meta.get("activePageId");
    const activePageId =
      seed.activePageId && pageIds.includes(seed.activePageId)
        ? seed.activePageId
        : typeof storedActivePageId === "string" && pageIds.includes(storedActivePageId)
          ? storedActivePageId
          : pageIds[0]!;
    const activeDescriptor = readCanvasPageDescriptor(
      activePageId,
      root.pages.get(activePageId)
    );
    writeCanvasDocumentMetadata(
      root,
      id,
      seed.mode ??
        (activeDescriptor?.kind === "structured" ? "structured" : "freeform"),
      activePageId
    );
  }, "local-persistence-migration");
  if (!hasValidPages(doc)) {
    throw new Error(`Canvas document migration produced no valid pages: ${id}`);
  }
  return true;
};

type LegacySessionSnapshot = {
  key: string;
  state: ReturnType<typeof decodePersistedEditorState>;
};

const readLegacySessionSnapshots = (
  storage: Storage,
  key: string
): LegacySessionSnapshot[] => {
  const snapshots: LegacySessionSnapshot[] = [];
  for (const candidate of [
    key,
    LEGACY_EDITOR_PERSISTENCE_KEY,
    ...HISTORICAL_EDITOR_PERSISTENCE_KEYS,
  ]) {
    const raw = storage.getItem(candidate);
    if (!raw) continue;
    try {
      const envelope: unknown = JSON.parse(raw);
      const version = (envelope as { version?: unknown }).version;
      if (
        !envelope ||
        typeof envelope !== "object" ||
        !("state" in envelope) ||
        !("version" in envelope) ||
        (version !== LEGACY_EDITOR_PERSISTENCE_VERSION &&
          version !== PREVIOUS_EDITOR_PERSISTENCE_VERSION &&
          version !== EDITOR_PERSISTENCE_VERSION)
      ) {
        continue;
      }
      snapshots.push({
        key: candidate,
        state: migratePersistedStateToV6(
          (envelope as { state: unknown }).state,
          version
        ),
      });
    } catch {
      continue;
    }
  }
  return snapshots;
};

const listPersistedDocuments = async (): Promise<PersistedDocumentLocation[]> => {
  if (typeof indexedDB === "undefined" || !indexedDB.databases) return [];
  try {
    const databases = await indexedDB.databases();
    return databases.flatMap(({ name }) =>
      name ? [parseDocumentDatabaseName(name)].filter(
        (location): location is PersistedDocumentLocation => location !== null
      ) : []
    );
  } catch {
    return [];
  }
};

const readPersistedDocumentShell = async (
  id: string,
  recoveredIndex: number,
  generation = 0
): Promise<CanvasSessionSnapshot | null> => {
  const doc = new Y.Doc({ guid: id });
  const provider = new IndexeddbPersistence(
    getDocumentDatabaseName(id, generation),
    doc
  );
  try {
    await waitForDocumentSync(provider, getDocumentDatabaseName(id, generation));
    const root = getCanvasDocumentRoot(doc);
    const pageIds = readCanvasPageOrder(root);
    if (
      pageIds.length === 0 &&
      readPageChannelIds(doc).size === 0 &&
      !hasLegacyContent(doc)
    ) return null;
    const mode = root.meta.get("mode");
    const name = `Recovered Canvas ${recoveredIndex + 1}`;
    if (mode === "slide") {
      const slides = pageIds.flatMap((pageId, index) => {
        const descriptor = readCanvasPageDescriptor(pageId, root.pages.get(pageId));
        if (!descriptor) return [];
        return [{
          id: pageId,
          name: descriptor.name?.trim() || `Slide ${index + 1}`,
          size: descriptor.size ?? { ...SLIDE_SIZE_PRESETS.widescreen },
          grid: [],
        }];
      });
      if (slides.length === 0) return null;
      const activePageId = root.meta.get("activePageId");
      return {
        id,
        name,
        mode: "slide",
        slideDeck: {
          slides,
          activeSlideId:
            typeof activePageId === "string" &&
            slides.some((slide) => slide.id === activePageId)
              ? activePageId
              : slides[0]!.id,
        },
        scene: [],
        components: [],
        grid: [],
      };
    }
    const structured = mode === "structured" ||
      doc.getMap("structured-scene").size > 0 ||
      pageIds.some((pageId) =>
        readCanvasPageDescriptor(pageId, root.pages.get(pageId))?.kind ===
          "structured"
      );
    return {
      id,
      name,
      mode: structured ? "structured" : "freeform",
      scene: [],
      components: [],
      grid: [],
    };
  } finally {
    await bestEffortDestroyProvider(provider);
    doc.destroy();
  }
};

const resolveDocumentGenerations = async (
  storedCatalog: CanvasCatalogSnapshot | null,
  persistedDocuments: readonly PersistedDocumentLocation[]
) => {
  const persistedById = new Map<string, number[]>();
  persistedDocuments.forEach(({ id, generation }) => {
    const generations = persistedById.get(id) ?? [];
    generations.push(generation);
    persistedById.set(id, generations);
  });
  const catalogGenerations = new Map(
    storedCatalog?.sessions.map((session) => [
      session.id,
      session.documentGeneration ?? 0,
    ]) ?? []
  );
  const resolved = new Map<string, number>();
  for (const [id, generations] of persistedById) {
    const ordered = Array.from(new Set(generations)).sort((a, b) => b - a);
    const catalogGeneration = catalogGenerations.get(id);
    if (catalogGeneration === undefined) {
      resolved.set(id, ordered[0] ?? 0);
      continue;
    }
    const catalogExists = ordered.includes(catalogGeneration);
    const candidates = catalogExists
      ? ordered.filter((generation) => generation > catalogGeneration)
      : ordered;
    for (const generation of candidates) {
      const shell = await readPersistedDocumentShell(id, 0, generation);
      if (!shell) continue;
      resolved.set(id, generation);
      break;
    }
    if (!resolved.has(id)) resolved.set(id, catalogGeneration);
  }
  storedCatalog?.sessions.forEach((session) => {
    if (!resolved.has(session.id)) {
      resolved.set(session.id, session.documentGeneration ?? 0);
    }
  });
  return resolved;
};

const isBootstrapCatalogSession = (
  session: Pick<CanvasSessionSnapshot, "name" | "mode">,
  initial: CanvasSessionSnapshot | undefined
) => !!initial && session.name === initial.name && session.mode === initial.mode;

const mergeRecoverableSessions = (
  catalogSessions: CanvasSessionSnapshot[],
  snapshots: LegacySessionSnapshot[],
  persistedDocumentIds: readonly string[],
  initialSessions: readonly CanvasSessionSnapshot[]
) => {
  if (persistedDocumentIds.length === 0) return catalogSessions;
  const persisted = new Set(persistedDocumentIds);
  const catalog = new Map(catalogSessions.map((session) => [session.id, session]));
  const initial = new Map(initialSessions.map((session) => [session.id, session]));
  const recovered: CanvasSessionSnapshot[] = [];
  const seen = new Set<string>();

  for (const snapshot of snapshots) {
    for (const historical of snapshot.state.sessions.items) {
      if (seen.has(historical.id) || !persisted.has(historical.id)) continue;
      const current = catalog.get(historical.id);
      recovered.push(
        current && !isBootstrapCatalogSession(current, initial.get(current.id))
          ? current
          : historical
      );
      seen.add(historical.id);
    }
  }
  for (const session of catalogSessions) {
    if (seen.has(session.id)) continue;
    recovered.push(session);
    seen.add(session.id);
  }
  return recovered;
};

const sessionsFromCatalog = (catalog: CanvasCatalogSnapshot): CanvasSessionSnapshot[] =>
  catalog.sessions.map((session): CanvasSessionSnapshot => {
    const base = {
      id: session.id,
      name: session.name,
      viewport: session.viewport,
    };
    if (session.mode === "slide") {
      const slides = catalog.slides
        .filter((slide) => slide.sessionId === session.id)
        .sort((left, right) => left.order - right.order)
        .map((slide) => ({
          id: slide.id,
          name: slide.name,
          size: slide.size,
          grid: [],
        }));
      return {
        ...base,
        mode: "slide",
        ...(session.sourceBinding ? { sourceBinding: session.sourceBinding } : {}),
        slideDeck: {
          slides,
          activeSlideId: session.activeSlideId ?? slides[0]?.id ?? "slide-1",
        },
        scene: [],
        components: [],
        grid: [],
      };
    }
    if (session.mode === "structured") {
      return {
        ...base,
        mode: "structured",
        scene: [],
        components: [],
        grid: [],
      };
    }
    const collaboration = !session.sourceBinding &&
      isCollaborationDescriptor(session.collaboration)
      ? session.collaboration
      : undefined;
    return {
      ...base,
      mode: "freeform",
      ...(session.sourceBinding ? { sourceBinding: session.sourceBinding } : {}),
      collaboration,
      collaborationRole: collaboration
        ? session.collaborationRole ?? "host"
        : undefined,
      scene: [],
      components: [],
      grid: [],
    };
  });

const recoveredSessionName = (
  sessions: readonly CanvasSessionSnapshot[],
  index: number
) => {
  const base = index === 0 ? "Recovered Canvas" : `Recovered Canvas ${index + 1}`;
  if (!sessions.some(({ name }) => name === base)) return base;
  let suffix = index + 2;
  while (sessions.some(({ name }) => name === `Recovered Canvas ${suffix}`)) {
    suffix += 1;
  }
  return `Recovered Canvas ${suffix}`;
};

const hasRecoverableSessionContent = (session: CanvasSessionSnapshot) =>
  isSourceBackedCanvasSession(session)
    ? false
    : session.mode === "slide"
    ? session.slideDeck.slides.some((slide) => slide.grid.length > 0)
    : session.grid.length > 0 || session.scene.length > 0 ||
      (session.components?.length ?? 0) > 0;

const createSourceSessionSeed = (
  session: SourceBackedCanvasSessionSnapshot,
): CanvasDocumentSeed => session.mode === "slide"
  ? {
      mode: "slide",
      activePageId: session.slideDeck.activeSlideId,
      pages: session.slideDeck.slides.map((slide) => ({
        id: slide.id,
        name: slide.name,
        size: slide.size,
        kind: "cell-plane",
        grid: slide.grid,
      })),
      grid: [],
      scene: [],
      components: [],
    }
  : {
      mode: "freeform",
      grid: [],
      scene: [],
      components: [],
    };

const createSourceSessionDocument = (session: SourceBackedCanvasSessionSnapshot) => {
  const doc = new Y.Doc({ guid: session.id });
  applyCanvasDocumentSeed(doc, session.id, createSourceSessionSeed(session));
  return doc;
};

const recoverySourceId = (key: string, session: CanvasSessionSnapshot) => {
  const value = JSON.stringify(session);
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${key}:${session.id}:${(hash >>> 0).toString(36)}`;
};

const uniqueRecoveredName = (
  sessions: readonly CanvasSessionSnapshot[],
  originalName: string
) => {
  const base = `Recovered · ${originalName.trim() || "Canvas"}`;
  if (!sessions.some(({ name }) => name === base)) return base;
  let suffix = 2;
  while (sessions.some(({ name }) => name === `${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
};

const appendHistoricalRecoverySessions = (
  sessions: readonly CanvasSessionSnapshot[],
  snapshots: readonly LegacySessionSnapshot[],
  persistedDocumentIds: ReadonlySet<string>,
  initialSessions: readonly CanvasSessionSnapshot[],
  recoveredSources: Set<string>,
  deletedSessionIds: ReadonlySet<string>
) => {
  const recovered = [...sessions];
  let recoveredActiveId: string | null = null;
  const initial = new Map(initialSessions.map((session) => [session.id, session]));
  for (const snapshot of snapshots) {
    if (!HISTORICAL_EDITOR_PERSISTENCE_KEYS.includes(
      snapshot.key as (typeof HISTORICAL_EDITOR_PERSISTENCE_KEYS)[number]
    )) continue;
    for (const historical of snapshot.state.sessions.items) {
      if (!hasRecoverableSessionContent(historical)) continue;
      if (deletedSessionIds.has(historical.id)) continue;
      const source = recoverySourceId(snapshot.key, historical);
      if (recoveredSources.has(source)) continue;
      const current = sessions.find(({ id }) => id === historical.id);
      const represented = !!current &&
        !isBootstrapCatalogSession(current, initial.get(current.id));
      if (represented || persistedDocumentIds.has(historical.id)) continue;
      const id = createSessionId(recovered);
      const session: CanvasSessionSnapshot = historical.mode === "slide"
        ? {
            ...structuredClone(historical),
            id,
            name: uniqueRecoveredName(recovered, historical.name),
          }
        : {
            ...structuredClone(historical),
            id,
            name: uniqueRecoveredName(recovered, historical.name),
            collaboration: undefined,
          };
      recovered.push(session);
      recoveredSources.add(source);
      if (historical.id === snapshot.state.sessions.activeId) {
        recoveredActiveId = id;
      }
    }
  }
  return { sessions: recovered, recoveredActiveId };
};

const cloneRecoveredSessions = (
  source: readonly CanvasSessionSnapshot[],
  restored: readonly CanvasSessionSnapshot[],
  activeSessionId: string
) => {
  const sessions = [...restored];
  let recoveredActiveId: string | null = null;
  source.forEach((session, index) => {
    const id = createSessionId(sessions);
    const recovered: CanvasSessionSnapshot = session.mode === "slide"
      ? {
          ...structuredClone(session),
          id,
          name: recoveredSessionName(sessions, index),
        }
      : {
          ...structuredClone(session),
          id,
          name: recoveredSessionName(sessions, index),
          collaboration: undefined,
        };
    sessions.push(recovered);
    if (session.id === activeSessionId) recoveredActiveId = id;
  });
  return { sessions, recoveredActiveId };
};

const createCatalogSnapshot = (
  state: ReturnType<CanvasStore["getState"]>,
  getSlideDeck: (sessionId: string) => SlideDeckDescriptor | null,
  documentGenerations: ReadonlyMap<string, number> = new Map(),
  previousDocumentGenerations: ReadonlyMap<string, number> = new Map(),
  revision = 0,
  recoveredSources: ReadonlySet<string> = new Set(),
  deletedSessionIds: ReadonlySet<string> = new Set()
): CanvasCatalogSnapshot => {
  const slideDecks = new Map(
    state.canvasSessions.flatMap((session) => {
      if (session.mode !== "slide") return [];
      const deck = getSlideDeck(session.id);
      return deck ? [[session.id, deck] as const] : [];
    })
  );
  return {
  revision,
  activeSessionId: state.activeCanvasId,
  sessions: state.canvasSessions.map((session, order) => ({
    id: session.id,
    order,
    name: session.name,
    mode: session.mode,
    ...(session.sourceBinding ? { sourceBinding: session.sourceBinding } : {}),
    viewport:
      session.id === state.activeCanvasId
        ? { offset: { ...state.offset }, zoom: state.zoom }
        : session.viewport,
    ...(session.mode !== "slide" && session.collaboration
      ? {
          collaboration: session.collaboration,
          collaborationRole: session.collaborationRole ?? "host",
        }
      : {}),
    ...(session.mode === "slide" && slideDecks.has(session.id)
      ? { activeSlideId: slideDecks.get(session.id)!.activeSlideId }
      : {}),
    ...(documentGenerations.get(session.id)
      ? {
          documentGeneration: documentGenerations.get(session.id),
          ...(previousDocumentGenerations.has(session.id)
            ? {
                previousDocumentGeneration:
                  previousDocumentGenerations.get(session.id),
              }
            : {}),
        }
      : {}),
  })),
  slides: state.canvasSessions.flatMap((session) =>
    session.mode === "slide"
      ? (slideDecks.get(session.id)?.slides ?? []).map((slide, order) => ({
          id: slide.id,
          sessionId: session.id,
          name: slide.name,
          size: slide.size,
          order,
        }))
      : []
  ),
  preferences: {
    brushChar: state.brushChar,
    brushColor: state.brushColor,
    brushBackgroundColor: state.brushBackgroundColor,
    showGrid: state.showGrid,
    exportShowGrid: state.exportShowGrid,
  },
  recoveredSources: Array.from(recoveredSources).sort(),
  deletedSessionIds: Array.from(deletedSessionIds).sort(),
  };
};

const catalogStructureJson = (snapshot: CanvasCatalogSnapshot) => JSON.stringify({
  activeSessionId: snapshot.activeSessionId,
  sessions: snapshot.sessions.map((session) => ({
    id: session.id,
    order: session.order,
    name: session.name,
    mode: session.mode,
    sourceBinding: session.sourceBinding,
    collaboration: session.collaboration,
    collaborationRole: session.collaborationRole,
    activeSlideId: session.activeSlideId,
    documentGeneration: session.documentGeneration,
    previousDocumentGeneration: session.previousDocumentGeneration,
  })),
  slides: snapshot.slides,
  recoveredSources: snapshot.recoveredSources,
  deletedSessionIds: snapshot.deletedSessionIds,
});

const catalogSnapshotJson = (snapshot: CanvasCatalogSnapshot) => JSON.stringify({
  ...snapshot,
  slides: [...snapshot.slides].sort((left, right) => left.order - right.order),
  recoveredSources: [...snapshot.recoveredSources].sort(),
  deletedSessionIds: [...snapshot.deletedSessionIds].sort(),
});

const sameCatalogValue = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

const mergeCatalogSnapshot = (
  base: CanvasCatalogSnapshot | null,
  local: CanvasCatalogSnapshot,
  latest: CanvasCatalogSnapshot | null,
): CanvasCatalogSnapshot => {
  if (!latest) return { ...local, revision: Math.max(local.revision, 1) };
  const deletedSessionIds = new Set([
    ...latest.deletedSessionIds,
    ...local.deletedSessionIds,
  ]);
  const baseSessions = new Map(base?.sessions.map((session) => [session.id, session]));
  const sessions = new Map(latest.sessions.map((session) => [session.id, session]));
  local.sessions.forEach((session) => {
    if (!base || !sameCatalogValue(session, baseSessions.get(session.id))) {
      sessions.set(session.id, session);
    }
  });
  deletedSessionIds.forEach((id) => sessions.delete(id));

  const slideKey = (slide: CanvasCatalogSnapshot["slides"][number]) =>
    `${slide.sessionId}\u0000${slide.id}`;
  const baseSlides = new Map(base?.slides.map((slide) => [slideKey(slide), slide]));
  const slides = new Map(latest.slides.map((slide) => [slideKey(slide), slide]));
  local.slides.forEach((slide) => {
    const key = slideKey(slide);
    if (!base || !sameCatalogValue(slide, baseSlides.get(key))) slides.set(key, slide);
  });
  for (const [key, slide] of slides) {
    if (deletedSessionIds.has(slide.sessionId) || !sessions.has(slide.sessionId)) {
      slides.delete(key);
    }
  }

  const activeSessionId = (!base || local.activeSessionId !== base.activeSessionId)
    ? local.activeSessionId
    : latest.activeSessionId;
  return {
    revision: Math.max(local.revision, latest.revision) + 1,
    activeSessionId: sessions.has(activeSessionId)
      ? activeSessionId
      : sessions.keys().next().value ?? local.activeSessionId,
    sessions: [...sessions.values()].sort(
      (left, right) => (left.order ?? 0) - (right.order ?? 0),
    ),
    slides: [...slides.values()].sort((left, right) => left.order - right.order),
    preferences: !base || !sameCatalogValue(local.preferences, base.preferences)
      ? local.preferences
      : latest.preferences,
    recoveredSources: [...new Set([
      ...latest.recoveredSources,
      ...local.recoveredSources,
    ])].sort(),
    deletedSessionIds: [...deletedSessionIds].sort(),
  };
};

const withCatalogWriteLock = async <Value>(
  storage: Storage,
  task: () => Promise<Value>,
) => {
  const hasWebLocks = typeof navigator !== "undefined" && !!navigator.locks;
  const browserLease = hasWebLocks
    ? await acquireOriginExclusiveLease({
        manager: navigator.locks,
        name: CATALOG_WRITE_LOCK_NAME,
        wait: true,
      })
    : null;
  let lease: ExclusiveLease | null = browserLease
    ? { held: true, release: browserLease.release }
    : null;
  if (!hasWebLocks) {
    for (let attempt = 0; attempt < 100 && !lease?.held; attempt += 1) {
      lease = acquireStorageLease(storage, CATALOG_WRITE_LEASE_KEY, 4_000);
      if (!lease.held) await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  if (!lease?.held) throw new Error("Canvas catalog write lock is unavailable");
  try {
    return await task();
  } finally {
    lease.release();
  }
};

const readCatalogIntent = (storage: Storage): CanvasCatalogSnapshot | null => {
  try {
    const value: unknown = JSON.parse(storage.getItem(CATALOG_INTENT_KEY) ?? "null");
    if (!value || typeof value !== "object") return null;
    const intent = value as Partial<CanvasCatalogSnapshot>;
    if (
      typeof intent.revision !== "number" ||
      typeof intent.activeSessionId !== "string" ||
      !Array.isArray(intent.sessions) ||
      !Array.isArray(intent.slides) ||
      !intent.preferences ||
      !Array.isArray(intent.recoveredSources) ||
      !Array.isArray(intent.deletedSessionIds)
    ) return null;
    return intent as CanvasCatalogSnapshot;
  } catch {
    return null;
  }
};

export class BrowserCanvasPersistence implements CanvasDocumentResidency {
  readonly #legacyStorage: Storage;
  readonly #legacyKey: string;
  readonly #listeners = new Set<Listener>();
  readonly #documents = new Map<string, PersistedDocument>();
  readonly #dirtyDocuments = new Map<string, number>();
  readonly #fallbackSeeds = new Map<string, CanvasDocumentSeed>();
  readonly #documentGenerations = new Map<string, number>();
  readonly #previousDocumentGenerations = new Map<string, number>();
  readonly #documentRevisions = new Map<string, number>();
  readonly #checkpointServices = new Map<
    string,
    CanvasCheckpointService<BrowserCheckpointCandidate>
  >();
  readonly #checkpointTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #checkpointTails = new Map<string, CanvasCheckpointTailEntry[]>();
  readonly #checkpointWorker = new CanvasCheckpointWorkerClient();
  readonly #instanceId = crypto.randomUUID();
  readonly #documentSyncChannel = typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel(LOCAL_DOCUMENT_SYNC_CHANNEL);
  readonly #pendingDocumentUpdates = new Map<string, Uint8Array[]>();
  readonly #recoveredSources = new Set<string>();
  readonly #deletedSessionIds = new Set<string>();
  readonly #pinnedCanvasIds = new Set<string>();
  readonly #recentCanvasIds: string[] = [];
  #registry: CanvasDocumentRegistry | null = null;
  #catalog: CanvasCatalog | null = null;
  #store: CanvasStore | null = null;
  #unsubscribeStore: (() => void) | null = null;
  #unsubscribeMutations: (() => void) | null = null;
  #metadataTimer: ReturnType<typeof setTimeout> | null = null;
  #documentTimer: ReturnType<typeof setTimeout> | null = null;
  #evictionTask: Promise<void> = Promise.resolve();
  #catalogSaveTask: Promise<void> = Promise.resolve();
  #catalogRevision = 0;
  #lastCatalogJson = "";
  #lastCatalogStructureJson = "";
  #lastCatalogSnapshot: CanvasCatalogSnapshot | null = null;
  #coordinatorLease: ExclusiveLease | null = null;
  #coordinationWaitController: AbortController | null = null;
  #coordinationRetryTimer: ReturnType<typeof setTimeout> | null = null;
  #bootstrapSessions: readonly CanvasSessionSnapshot[] | undefined;
  #temporaryStoreSubscription: (() => void) | null = null;
  #temporaryMutationSubscription: (() => void) | null = null;
  #temporarySessionShell = "";
  #status: CanvasPersistenceStatus = {
    phase: "restoring",
    restore: {
      phase: "initializing",
      reason: null,
      error: null,
      temporaryDirty: false,
    },
    save: "saved",
    coordination: "coordinator",
    error: null,
  };

  constructor(options: BrowserCanvasPersistenceOptions) {
    this.#legacyStorage = options.legacyStorage;
    this.#legacyKey = options.legacyKey ?? EDITOR_PERSISTENCE_KEY;
    if (this.#documentSyncChannel) {
      this.#documentSyncChannel.onmessage = (event: MessageEvent<LocalDocumentSyncMessage>) => {
        const message = event.data;
        if (
          message?.type !== "document-update" ||
          message.senderId === this.#instanceId
        ) return;
        const generation = this.#documentGenerations.get(message.documentId) ?? 0;
        if (message.generation !== generation) return;
        const document = this.#documents.get(message.documentId)?.doc;
        if (document) {
          Y.applyUpdate(document, message.update, this.#documentSyncChannel);
          return;
        }
        const pending = this.#pendingDocumentUpdates.get(message.documentId) ?? [];
        pending.push(message.update);
        this.#pendingDocumentUpdates.set(message.documentId, pending);
      };
    }
  }

  getSnapshot = () => this.#status;

  #getSlideDeckDescriptor = (sessionId: string): SlideDeckDescriptor | null => {
    const resident = this.#registry
      ? readSlideDeckDescriptor(this.#registry, sessionId)
      : null;
    if (resident) return resident;
    const seed = this.#fallbackSeeds.get(sessionId);
    const pages = seed?.pages?.filter((page) => page.kind === "cell-plane") ?? [];
    if (pages.length === 0) return null;
    return {
      activeSlideId:
        pages.some((page) => page.id === seed?.activePageId)
          ? seed!.activePageId!
          : pages[0].id,
      slides: pages.map((page, index) => ({
        id: page.id,
        name: page.name?.trim() || `Slide ${index + 1}`,
        size: page.size ?? { ...SLIDE_SIZE_PRESETS.widescreen },
      })),
    };
  };

  subscribe = (listener: Listener) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  initialize = async (
    documents: CanvasDocumentRegistry,
    store: CanvasStore,
    bootstrapSessions?: readonly CanvasSessionSnapshot[]
  ) => {
    this.#registry = documents;
    this.#store = store;
    this.#bootstrapSessions = (
      bootstrapSessions ??
      createPersistedEditorSnapshot(store.getState(), documents).sessions.items
    ).map((session) => structuredClone(session));
    await this.#runRestore();
  };

  retryRestore = async () => {
    if (
      this.#status.restore.phase !== "temporary" ||
      !this.#registry ||
      !this.#store
    ) return false;
    const temporaryDirty = this.#status.restore.temporaryDirty;
    const recovery = temporaryDirty
      ? createPersistedEditorSnapshot(
          this.#store.getState(),
          this.#registry
        ).sessions
      : null;
    this.#stopTemporaryTracking();
    this.#publish({
      phase: "restoring",
      restore: {
        phase: "retrying",
        reason: null,
        error: null,
        temporaryDirty,
      },
      error: null,
    });
    return this.#runRestore(recovery);
  };

  async #runRestore(
    recovery: ReturnType<typeof createPersistedEditorSnapshot>["sessions"] | null = null
  ) {
    const documents = this.#registry;
    const store = this.#store;
    if (!documents || !store) return false;
    let committed = false;
    try {
      this.#coordinatorLease = await acquireCoordinatorLease(this.#legacyStorage);
      this.#publish({
        coordination: this.#coordinatorLease.held ? "coordinator" : "peer",
      });
      this.#catalog = await createIndexedDbCanvasCatalog({
        onUnavailable: () => this.#handleError(
          new Error("Canvas catalog connection was interrupted")
        ),
      });
      const persistedCatalog = this.#coordinatorLease.held
        ? await this.#catalog.load()
        : await waitForCatalog(this.#catalog);
      const catalogIntent = this.#coordinatorLease.held
        ? readCatalogIntent(this.#legacyStorage)
        : null;
      const storedCatalog = catalogIntent &&
          catalogIntent.revision > (persistedCatalog?.revision ?? -1)
        ? catalogIntent
        : persistedCatalog;
      this.#catalogRevision = storedCatalog?.revision ?? 0;
      storedCatalog?.recoveredSources.forEach((source) =>
        this.#recoveredSources.add(source)
      );
      storedCatalog?.deletedSessionIds.forEach((id) =>
        this.#deletedSessionIds.add(id)
      );
      const legacySnapshots = readLegacySessionSnapshots(
        this.#legacyStorage,
        this.#legacyKey
      );
      const legacy = storedCatalog
        ? null
        : legacySnapshots.find(({ key }) =>
            key === this.#legacyKey || key === LEGACY_EDITOR_PERSISTENCE_KEY
          ) ?? null;
      const legacySessions = legacy?.state.sessions.items.map((session) =>
        session.id === legacy.state.sessions.activeId
          ? {
              ...session,
              viewport: {
                offset: legacy.state.workspace.offset,
                zoom: legacy.state.workspace.zoom,
              },
          }
            : session
      );
      const initialSessions = (this.#bootstrapSessions ?? [])
        .map((session) => structuredClone(session));
      const catalogSessions = (storedCatalog
        ? sessionsFromCatalog(storedCatalog)
        : legacySessions ?? initialSessions).filter(
          ({ id }) => !this.#deletedSessionIds.has(id)
        );
      const persistedDocuments = (await listPersistedDocuments()).filter(
        ({ id }) => !this.#deletedSessionIds.has(id)
      );
      const latestPersistedGeneration = new Map<string, number>();
      persistedDocuments.forEach(({ id, generation }) => {
        latestPersistedGeneration.set(
          id,
          Math.max(latestPersistedGeneration.get(id) ?? 0, generation)
        );
      });
      const resolvedGenerations = await resolveDocumentGenerations(
        storedCatalog,
        persistedDocuments
      );
      resolvedGenerations.forEach((generation, id) =>
        this.#documentGenerations.set(id, generation)
      );
      storedCatalog?.sessions.forEach((session) => {
        const catalogGeneration = session.documentGeneration ?? 0;
        const resolvedGeneration = resolvedGenerations.get(session.id);
        if (
          resolvedGeneration !== undefined &&
          resolvedGeneration !== catalogGeneration
        ) {
          this.#previousDocumentGenerations.set(session.id, catalogGeneration);
        }
        if (session.previousDocumentGeneration !== undefined) {
          this.#previousDocumentGenerations.set(
            session.id,
            session.previousDocumentGeneration
          );
        }
      });
      const persistedDocumentIds = Array.from(latestPersistedGeneration.keys());
      const recoveredCatalogSessions = mergeRecoverableSessions(
        catalogSessions,
        legacySnapshots,
        persistedDocumentIds,
        initialSessions
      );
      const knownSessionIds = new Set(
        recoveredCatalogSessions.map(({ id }) => id)
      );
      const recoveredDocumentShells = (await Promise.all(
        persistedDocumentIds
          .filter((id) => !knownSessionIds.has(id))
          .map((id, index) => readPersistedDocumentShell(
            id,
            index,
            this.#documentGenerations.get(id) ?? 0
          ))
      )).filter((session): session is CanvasSessionSnapshot => session !== null);
      const historicalRecovery = appendHistoricalRecoverySessions(
        [...recoveredCatalogSessions, ...recoveredDocumentShells],
        legacySnapshots,
        new Set(persistedDocumentIds),
        initialSessions,
        this.#recoveredSources,
        this.#deletedSessionIds
      );
      const sourceSessions = [
        ...recoveredCatalogSessions,
        ...recoveredDocumentShells,
        ...historicalRecovery.sessions.slice(
          recoveredCatalogSessions.length + recoveredDocumentShells.length
        ),
      ];
      const catalogIsBootstrap = !!storedCatalog && storedCatalog.sessions.every(
        (session) => isBootstrapCatalogSession(
          session,
          initialSessions.find(({ id }) => id === session.id)
        )
      );
      const recoveredActiveId = legacySnapshots.find(({ state }) =>
        sourceSessions.some(({ id }) => id === state.sessions.activeId)
      )?.state.sessions.activeId;
      const activeSessionId = catalogIsBootstrap
        ? historicalRecovery.recoveredActiveId ?? recoveredActiveId ??
          storedCatalog?.activeSessionId ??
          store.getState().activeCanvasId
        : storedCatalog?.activeSessionId ??
          legacy?.state.sessions.activeId ??
          store.getState().activeCanvasId;
      let restored = await this.#restoreSessions(
        documents,
        sourceSessions,
        !storedCatalog && this.#coordinatorLease.held,
        activeSessionId
      );
      if (recovery && recovery.items.length > 0) {
        await this.#closePersistedDocument(
          restored.activeSessionId,
          restored.activeDocument
        );
        restored = await this.#prepareRecoveredSessions(
          restored.sessions,
          recovery.items,
          recovery.activeId
        );
      }
      const activeSession = restored.sessions.find(
        (session) => session.id === restored.activeSessionId
      ) ?? restored.sessions[0];
      if (!activeSession) throw new Error("Canvas persistence restored no sessions");

      const restoreRecords = restored.sessions.map(getCanvasSessionRestoreRecord);
      this.#fallbackSeeds.clear();
      restoreRecords.forEach(({ descriptor, fallbackSnapshot }) => {
        if (fallbackSnapshot) {
          this.#fallbackSeeds.set(
            descriptor.id,
            seedFromImportSnapshot(fallbackSnapshot)
          );
        }
      });
      const sessionDescriptors = restoreRecords.map(({ descriptor }) => descriptor);
      const activeDescriptor = restoreRecords.find(
        ({ descriptor }) => descriptor.id === activeSession.id
      )!.descriptor;

      const current = store.getState();
      const preferences = storedCatalog?.preferences ?? legacy?.state.preferences;
      const hydrated = recoverPersistedEditorState({
        ...current,
        canvasSessions: sessionDescriptors,
        activeCanvasId: activeSession.id,
        ...(preferences ?? {}),
      }, activeSession);
      documents.adoptDocument(activeSession.id, restored.activeDocument);
      if (activeDescriptor.mode !== "slide" && activeDescriptor.collaboration) {
        documents.prepareDocumentForCollaboration(
          activeDescriptor.id,
          {
            mode: activeDescriptor.mode,
            documentVersion: activeDescriptor.collaboration.documentVersion,
            roomId: activeDescriptor.collaboration.roomId,
            sharedDocumentId: getCollaborationDocumentId(activeDescriptor.collaboration),
          }
        );
      }
      documents.activateDocument(
        getSessionCanvasDocumentId(activeDescriptor),
        emptySeed()
      );
      if (
        activeSession.mode === "slide" &&
        !documents.activatePage(
          activeSession.id,
          activeSession.slideDeck.activeSlideId
        )
      ) {
        throw new Error(
          `Canvas persistence could not activate slide: ${activeSession.id}/${activeSession.slideDeck.activeSlideId}`
        );
      }
      for (const id of documents.getDocumentIds()) {
        if (id !== activeSession.id) await this.#releaseDocument(id);
      }
      this.touch(activeSession.id);
      const documentRuntime = resolveSessionDocumentRuntime(
        documents,
        activeDescriptor,
        hydrated.tool
      );
      hydrated.slideDeck = documentRuntime.nextSlideDeck;
      hydrated.structuredScene = documentRuntime.nextScene;
      hydrated.structuredComponents = documentRuntime.nextComponents;
      hydrated.contentSurface = activeDescriptor.mode === "structured"
        ? createStructuredContentSurface(documentRuntime.nextScene)
        : rebuildContentSurface(documents);
      store.setState(hydrated, true);
      committed = true;
      this.#publish({
        phase: "ready",
        restore: {
          phase: "ready",
          reason: null,
          error: null,
          temporaryDirty: false,
        },
        save: this.#coordinatorLease.held ? "saving" : "saved",
        error: null,
      });
      if (this.#coordinatorLease.held) {
        this.#enableCoordinatorServices();
        await this.#saveCatalog();
        if (legacy) {
          this.#legacyStorage.removeItem(legacy.key);
          this.#legacyStorage.removeItem(LEGACY_EDITOR_PERSISTENCE_KEY);
        }
        this.#legacyStorage.setItem(CANVAS_CATALOG_MARKER_KEY, "1");
      } else this.#waitForCoordinatorHandoff();
      documents.configureDocumentLifecycle({
        onCreate: (id, doc) => this.#attachDocument(id, doc),
        onDelete: (id) => { void this.#deleteDocument(id); },
      });
      this.#subscribeToStore();
      this.#publish({ phase: "ready", save: "saved", error: null });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Canvas persistence failed";
      if (committed) {
        this.#handleError(error);
        return true;
      }
      const reason = getRestoreFailureReason(error);
      await this.#cleanupRestoreAttempt();
      this.#enterTemporaryMode(message, recovery !== null, reason);
      return false;
    }
  }

  #temporaryShell(state: ReturnType<CanvasStore["getState"]>) {
    return JSON.stringify(state.canvasSessions.map((session) => ({
      id: session.id,
      name: session.name,
      mode: session.mode,
    })));
  }

  #markTemporaryDirty = () => {
    if (
      this.#status.restore.phase !== "temporary" ||
      this.#status.restore.temporaryDirty
    ) return;
    this.#publish({
      restore: {
        ...this.#status.restore,
        temporaryDirty: true,
      },
    });
  };

  #startTemporaryTracking(temporaryDirty: boolean) {
    this.#stopTemporaryTracking();
    const store = this.#store;
    const documents = this.#registry;
    if (!store || !documents) return;
    this.#temporarySessionShell = this.#temporaryShell(store.getState());
    this.#temporaryStoreSubscription = store.subscribe((state) => {
      const shell = this.#temporaryShell(state);
      if (shell === this.#temporarySessionShell) return;
      this.#temporarySessionShell = shell;
      this.#markTemporaryDirty();
    });
    this.#temporaryMutationSubscription = documents.subscribeMutations(
      this.#markTemporaryDirty
    );
    if (temporaryDirty) this.#markTemporaryDirty();
  }

  #stopTemporaryTracking() {
    this.#temporaryStoreSubscription?.();
    this.#temporaryStoreSubscription = null;
    this.#temporaryMutationSubscription?.();
    this.#temporaryMutationSubscription = null;
    this.#temporarySessionShell = "";
  }

  #enterTemporaryMode(
    error: string,
    temporaryDirty: boolean,
    reason: CanvasRestoreFailureReason
  ) {
    this.#publish({
      phase: "degraded",
      restore: {
        phase: "temporary",
        reason,
        error,
        temporaryDirty,
      },
      save: "error",
      error,
    });
    this.#startTemporaryTracking(temporaryDirty);
  }

  async #cleanupRestoreAttempt() {
    this.#registry?.configureDocumentLifecycle(null);
    this.#unsubscribeStore?.();
    this.#unsubscribeStore = null;
    this.#unsubscribeMutations?.();
    this.#unsubscribeMutations = null;
    if (this.#metadataTimer) clearTimeout(this.#metadataTimer);
    this.#metadataTimer = null;
    if (this.#documentTimer) clearTimeout(this.#documentTimer);
    this.#documentTimer = null;
    this.#checkpointTimers.forEach((timer) => clearTimeout(timer));
    this.#checkpointTimers.clear();
    this.#checkpointServices.forEach((service) => service.cancel());
    this.#checkpointServices.clear();
    this.#checkpointTails.clear();
    const persisted = Array.from(this.#documents.values());
    this.#documents.clear();
    await Promise.all(persisted.map(async ({ doc, provider, updateListener }) => {
      doc.off("update", updateListener);
      await bestEffortDestroyProvider(provider);
      doc.destroy();
    }));
    this.#dirtyDocuments.clear();
    this.#documentGenerations.clear();
    this.#previousDocumentGenerations.clear();
    this.#documentRevisions.clear();
    this.#recoveredSources.clear();
    this.#deletedSessionIds.clear();
    this.#catalogRevision = 0;
    this.#catalogSaveTask = Promise.resolve();
    this.#lastCatalogJson = "";
    this.#lastCatalogStructureJson = "";
    this.#lastCatalogSnapshot = null;
    this.#catalog?.close();
    this.#catalog = null;
    this.#coordinatorLease?.release();
    this.#coordinatorLease = null;
    this.#coordinationWaitController?.abort();
    this.#coordinationWaitController = null;
    if (this.#coordinationRetryTimer) clearTimeout(this.#coordinationRetryTimer);
    this.#coordinationRetryTimer = null;
  }

  retry = async () => {
    if (!this.#catalog || !this.#store) return;
    try {
      this.#publish({ save: "saving", error: null });
      const dirty = Array.from(this.#dirtyDocuments);
      await Promise.all(dirty.flatMap(([id]) => {
        const provider = this.#documents.get(id)?.provider;
        return provider ? [persistProviderState(provider, false)] : [];
      }));
      dirty.forEach(([id, revision]) => {
        if (this.#dirtyDocuments.get(id) === revision) {
          this.#dirtyDocuments.delete(id);
        }
      });
      await this.#saveCatalog();
      this.#publish({
        phase: "ready",
        save: this.#dirtyDocuments.size === 0 ? "saved" : "saving",
        error: null,
      });
    } catch (error) {
      this.#publish({
        phase: "degraded",
        save: "error",
        error: error instanceof Error ? error.message : "Canvas persistence failed",
      });
    }
  };

  getCheckpointDiagnostics = (
    id = this.#registry?.getActiveDocumentId()
  ): CanvasCheckpointDiagnostics | null =>
    id ? this.#checkpointServices.get(id)?.getDiagnostics() ?? null : null;

  runCheckpointNow = (
    id = this.#registry?.getActiveDocumentId()
  ) => id
    ? this.#checkpointServices.get(id)?.run() ?? Promise.resolve(false)
    : Promise.resolve(false);

  ensureLoaded = async ({
    descriptor: session,
    fallbackSeed,
  }: CanvasDocumentLoadRequest): Promise<boolean> => {
    const documents = this.#registry;
    if (!documents) return false;
    if (documents.getDocument(session.id)) {
      this.touch(session.id);
      return true;
    }
    try {
      const seed = fallbackSeed ?? this.#fallbackSeeds.get(session.id);
      let doc: Y.Doc;
      if (isSourceBackedCanvasSession(session)) {
        doc = new Y.Doc({ guid: session.id });
        applyCanvasDocumentSeed(
          doc,
          session.id,
          seed ?? createBlankDescriptorSeed(session)
        );
      } else {
        doc = session.collaboration
          ? new Y.Doc({ guid: session.id })
          : await this.#loadDescriptorDocument(session, seed);
      }
      documents.adoptDocument(session.id, doc);
      if (session.mode !== "slide" && session.collaboration) {
        documents.prepareDocumentForCollaboration(
          session.id,
          {
            mode: session.mode,
            documentVersion: session.collaboration.documentVersion,
            roomId: session.collaboration.roomId,
            sharedDocumentId: getCollaborationDocumentId(session.collaboration),
          }
        );
      }
      this.touch(session.id);
      await this.#evictionTask;
      return true;
    } catch (error) {
      this.#handleError(error);
      return false;
    }
  };

  #enableCoordinatorServices() {
    const documents = this.#registry;
    if (!documents || this.#unsubscribeMutations) return;
    this.#unsubscribeMutations = documents.subscribeMutations((envelope) => {
      const revision = this.#documentRevisions.get(envelope.documentId) ?? 0;
      if (revision <= 0 || !this.#documents.has(envelope.documentId)) return;
      const entries = this.#checkpointTails.get(envelope.documentId) ?? [];
      const last = entries.at(-1);
      if (last?.revision === revision) {
        entries[entries.length - 1] = {
          revision,
          envelopes: [...last.envelopes, envelope],
        };
      } else {
        entries.push({ revision, envelopes: [envelope] });
      }
      if (entries.length > 4_096) entries.splice(0, entries.length - 4_096);
      this.#checkpointTails.set(envelope.documentId, entries);
    });
    documents.getDocumentIds().forEach((id) => this.#scheduleCheckpoint(id));
  }

  #acceptCoordinatorLease(lease: ExclusiveLease) {
    if (!this.#registry) {
      lease.release();
      return;
    }
    this.#coordinatorLease?.release();
    this.#coordinatorLease = lease;
    this.#coordinationWaitController = null;
    if (this.#coordinationRetryTimer) clearTimeout(this.#coordinationRetryTimer);
    this.#coordinationRetryTimer = null;
    this.#publish({ coordination: "coordinator" });
    this.#enableCoordinatorServices();
  }

  #waitForCoordinatorHandoff() {
    if (!this.#registry || this.#coordinatorLease?.held) return;
    if (typeof navigator !== "undefined" && navigator.locks) {
      if (this.#coordinationWaitController) return;
      const controller = new AbortController();
      this.#coordinationWaitController = controller;
      void acquireOriginExclusiveLease({
        manager: navigator.locks,
        name: COORDINATOR_LOCK_NAME,
        wait: true,
        signal: controller.signal,
      }).then((lease) => {
        if (!lease || controller.signal.aborted) {
          lease?.release();
          return;
        }
        this.#acceptCoordinatorLease({ held: true, release: lease.release });
      }).catch((error) => {
        if (!controller.signal.aborted) this.#handleError(error);
      });
      return;
    }
    if (this.#coordinationRetryTimer) return;
    this.#coordinationRetryTimer = setTimeout(() => {
      this.#coordinationRetryTimer = null;
      const lease = acquireStorageLease(
        this.#legacyStorage,
        COORDINATOR_LEASE_KEY,
        COORDINATOR_LEASE_DURATION,
      );
      if (lease.held) this.#acceptCoordinatorLease(lease);
      else this.#waitForCoordinatorHandoff();
    }, COORDINATOR_LEASE_DURATION / 2);
  }

  setPinnedCanvasIds = (ids: readonly string[]) => {
    this.#pinnedCanvasIds.clear();
    ids.forEach((id) => this.#pinnedCanvasIds.add(id));
    void this.#queueEviction().catch((error) => this.#handleError(error));
  };

  touch = (id: string) => {
    const index = this.#recentCanvasIds.indexOf(id);
    if (index >= 0) this.#recentCanvasIds.splice(index, 1);
    this.#recentCanvasIds.push(id);
    void this.#queueEviction().catch((error) => this.#handleError(error));
  };

  delete = async (id: string) => {
    this.#registry?.clearDocumentHistory(id);
    await this.#releaseDocument(id);
    await this.#deleteDocument(id);
  };

  dispose = () => {
    this.#stopTemporaryTracking();
    this.#unsubscribeStore?.();
    this.#unsubscribeStore = null;
    this.#unsubscribeMutations?.();
    this.#unsubscribeMutations = null;
    if (this.#metadataTimer) clearTimeout(this.#metadataTimer);
    if (this.#documentTimer) clearTimeout(this.#documentTimer);
    this.#checkpointTimers.forEach((timer) => clearTimeout(timer));
    this.#checkpointTimers.clear();
    this.#checkpointServices.forEach((service) => service.cancel());
    this.#checkpointServices.clear();
    this.#checkpointTails.clear();
    this.#coordinationWaitController?.abort();
    this.#coordinationWaitController = null;
    if (this.#coordinationRetryTimer) clearTimeout(this.#coordinationRetryTimer);
    this.#coordinationRetryTimer = null;
    this.#pendingDocumentUpdates.clear();
    this.#documentSyncChannel?.close();
    void this.#checkpointWorker.dispose();
    this.#documents.forEach(({ doc, provider, updateListener }) => {
      doc.off("update", updateListener);
      void provider.destroy();
    });
    this.#documents.clear();
    this.#registry = null;
    this.#catalog?.close();
    this.#catalog = null;
    this.#coordinatorLease?.release();
    this.#coordinatorLease = null;
  };

  async #restoreSessions(
    documents: CanvasDocumentRegistry,
    sessions: CanvasSessionSnapshot[],
    resetDocuments: boolean,
    activeSessionId: string
  ): Promise<RestoredSessions> {
    const restored: CanvasSessionSnapshot[] = [];
    let activeDocument: Y.Doc | null = null;
    for (const session of sessions) {
      const isActive = session.id === activeSessionId;
      if (!isActive && !resetDocuments && !hasRecoverableSessionContent(session)) {
        restored.push(session);
        continue;
      }
      if (isSourceBackedCanvasSession(session)) {
        const doc = createSourceSessionDocument(session);
        if (isActive) activeDocument = doc;
        else doc.destroy();
        restored.push(session);
        continue;
      }
      if (session.mode === "slide") {
        const initialDraft = resetDocuments
          ? documents.getDocumentDraft(session.id)
          : null;
        const pages = initialDraft?.mode === "slide"
          ? initialDraft.pages
          : await Promise.all(
              session.slideDeck.slides.map(async (slide) => ({
                id: slide.id,
                name: slide.name,
                size: slide.size,
                kind: "cell-plane" as const,
                grid: slide.grid.length > 0 || resetDocuments
                  ? slide.grid
                  : await this.#readLegacySlideGrid(session.id, slide.id),
              }))
            );
        const doc = await this.#openDocument(session.id, {
          mode: "slide",
          activePageId: session.slideDeck.activeSlideId,
          pages,
          grid: [],
          scene: [],
          components: [],
        });
        if (isActive) activeDocument = doc;
        else await this.#closePersistedDocument(session.id, doc);
        restored.push(session);
        continue;
      }
      if (session.collaboration) {
        if (isActive) {
          activeDocument = new Y.Doc({ guid: session.id });
        }
        restored.push({ ...session, grid: [], scene: [], components: [] });
        continue;
      }
      const existingSeed = documents.getDocumentSeed(
        session.id,
        session.mode,
      );
      const doc = await this.#openDocument(
        session.id,
        existingSeed ?? seedFromSessionSnapshot(session)
      );
      if (isActive) activeDocument = doc;
      const seed = readActiveSessionSeed(doc, session.id);
      if (!isActive) await this.#closePersistedDocument(session.id, doc);
      restored.push({
        ...session,
        grid: seed?.grid ?? [],
        scene: seed?.scene ?? [],
        components: seed?.components ?? [],
      });
    }
    const resolvedActiveSession = restored.find(
      (session) => session.id === activeSessionId
    ) ?? restored[0];
    if (!resolvedActiveSession) {
      throw new Error("Canvas persistence restored no sessions");
    }
    if (!activeDocument || resolvedActiveSession.id !== activeSessionId) {
      if (activeDocument) {
        await this.#closePersistedDocument(activeSessionId, activeDocument);
      }
      activeDocument = resolvedActiveSession.collaboration
        ? new Y.Doc({ guid: resolvedActiveSession.id })
        : await this.#loadSessionDocument(resolvedActiveSession, false);
    }
    return {
      sessions: restored,
      activeDocument,
      activeSessionId: resolvedActiveSession.id,
    };
  }

  async #prepareRecoveredSessions(
    restoredSessions: CanvasSessionSnapshot[],
    temporarySessions: readonly CanvasSessionSnapshot[],
    temporaryActiveId: string
  ): Promise<RestoredSessions> {
    const recovered = cloneRecoveredSessions(
      temporarySessions,
      restoredSessions,
      temporaryActiveId
    );
    const recoveredSessions = recovered.sessions.slice(restoredSessions.length);
    const activeSession = recoveredSessions.find(
      ({ id }) => id === recovered.recoveredActiveId
    ) ?? recoveredSessions[0];
    if (!activeSession) {
      throw new Error("Temporary Canvas recovery produced no sessions");
    }
    let activeDocument: Y.Doc | null = null;
    for (const session of recoveredSessions) {
      const doc = session.collaboration
        ? new Y.Doc({ guid: session.id })
        : await this.#loadSessionDocument(session, true);
      if (session.id === activeSession.id) activeDocument = doc;
      else await this.#closePersistedDocument(session.id, doc);
    }
    if (!activeDocument) {
      throw new Error("Temporary Canvas recovery produced no active document");
    }
    return {
      sessions: recovered.sessions,
      activeDocument,
      activeSessionId: activeSession.id,
    };
  }

  async #loadDescriptorDocument(
    session: CanvasSessionDescriptor,
    fallbackSeed?: CanvasDocumentSeed
  ) {
    const residentSeed = session.mode === "slide"
      ? undefined
      : this.#registry?.getDocumentSeed(session.id, session.mode) ?? undefined;
    return this.#openDocument(
      session.id,
      residentSeed ?? fallbackSeed ?? createBlankDescriptorSeed(session)
    );
  }

  async #loadSessionDocument(session: CanvasSessionSnapshot, resetDocument: boolean) {
    if (isSourceBackedCanvasSession(session)) {
      return createSourceSessionDocument(session);
    }
    if (session.mode === "slide") {
      return this.#openDocument(session.id, {
        mode: "slide",
        activePageId: session.slideDeck.activeSlideId,
        pages: session.slideDeck.slides.map((slide) => ({
          id: slide.id,
          name: slide.name,
          size: slide.size,
          kind: "cell-plane" as const,
          grid: slide.grid,
        })),
        grid: [],
        scene: [],
        components: [],
      });
    }
    const seed = resetDocument
      ? seedFromSessionSnapshot(session)
      : this.#registry?.getDocumentSeed(
          session.id,
          session.mode,
        ) ??
        seedFromSessionSnapshot(session);
    return this.#openDocument(session.id, seed);
  }

  async #readLegacySlideGrid(sessionId: string, slideId: string) {
    const id = `${sessionId}:slide:${slideId}`;
    const doc = new Y.Doc({ guid: id });
    const databaseName = getDocumentDatabaseName(id);
    const provider = new IndexeddbPersistence(databaseName, doc);
    try {
      await waitForDocumentSync(provider, databaseName);
      migrateLegacyDocument(doc, id, {
        mode: "freeform",
        grid: [],
        scene: [],
        components: [],
      });
      return readCellPlaneGrid(doc);
    } finally {
      await bestEffortDestroyProvider(provider);
      doc.destroy();
    }
  }

  async #openDocument(
    id: string,
    seed: CanvasDocumentSeed
  ) {
    const generation = this.#documentGenerations.get(id) ?? 0;
    const name = getDocumentDatabaseName(id, generation);
    const doc = new Y.Doc({ guid: id });
    const provider = new IndexeddbPersistence(name, doc);
    try {
      await waitForDocumentSync(provider, name);
    } catch (error) {
      await bestEffortDestroyProvider(provider);
      doc.destroy();
      throw error;
    }
    const migrated = migrateLegacyDocument(doc, id, seed);
    const seeded = isDocumentEmpty(doc);
    if (seeded) applyCanvasDocumentSeed(doc, id, seed);
    if (this.#coordinatorLease?.held && (
      migrated ||
      hasLegacyCellPlaneOperations(doc) ||
      countDocumentStructs(doc) >= DOCUMENT_STRUCT_ROTATION_THRESHOLD
    )) {
      const compacted = createCompactedDocument(doc, id);
      const nextGeneration = generation + 1;
      const nextDatabaseName = getDocumentDatabaseName(id, nextGeneration);
      await clearDocument(nextDatabaseName);
      const nextProvider = new IndexeddbPersistence(
        nextDatabaseName,
        compacted
      );
      try {
        await waitForDocumentSync(nextProvider, nextDatabaseName);
        await persistProviderState(nextProvider, true);
      } catch (error) {
        await bestEffortDestroyProvider(nextProvider);
        compacted.destroy();
        await bestEffortDestroyProvider(provider);
        doc.destroy();
        throw error;
      }
      if (!hasValidPages(compacted)) {
        await nextProvider.destroy();
        compacted.destroy();
        throw new Error(`Canvas document compaction verification failed: ${id}`);
      }
      await provider.destroy();
      doc.destroy();
      this.#documentGenerations.set(id, nextGeneration);
      this.#registerDocument(id, compacted, nextProvider);
      return compacted;
    }
    this.#registerDocument(id, doc, provider);
    if (seeded) await persistProviderState(provider, true);
    return doc;
  }

  #attachDocument(id: string, doc: Y.Doc) {
    if (this.#documents.has(id)) return;
    this.#deletedSessionIds.delete(id);
    const session = this.#store?.getState().canvasSessions.find(
      (candidate) => candidate.id === id
    );
    if (isSourceBackedCanvasSession(session)) return;
    if (session?.mode !== "slide" && session?.collaboration) return;
    const generation = this.#documentGenerations.get(id) ?? 0;
    const provider = new IndexeddbPersistence(
      getDocumentDatabaseName(id, generation),
      doc
    );
    this.#registerDocument(id, doc, provider);
    void provider.whenSynced.catch((error) => this.#handleError(error));
  }

  #registerDocument(
    id: string,
    doc: Y.Doc,
    provider: IndexeddbPersistence
  ) {
    this.#documentRevisions.set(id, this.#documentRevisions.get(id) ?? 0);
    const updateListener = (update: Uint8Array, origin: unknown) => {
      this.#documentRevisions.set(id, (this.#documentRevisions.get(id) ?? 0) + 1);
      this.#scheduleDocumentFlush(id);
      this.#scheduleCheckpoint(id);
      if (this.#documentSyncChannel && origin !== this.#documentSyncChannel) {
        this.#documentSyncChannel.postMessage({
          type: "document-update",
          senderId: this.#instanceId,
          documentId: id,
          generation: this.#documentGenerations.get(id) ?? 0,
          update,
        } satisfies LocalDocumentSyncMessage);
      }
    };
    doc.on("update", updateListener);
    this.#documents.set(id, { doc, provider, updateListener });
    const pending = this.#pendingDocumentUpdates.get(id);
    if (pending) {
      this.#pendingDocumentUpdates.delete(id);
      pending.forEach((update) => {
        Y.applyUpdate(doc, update, this.#documentSyncChannel);
      });
    }
    this.#ensureCheckpointService(id);
    this.#scheduleCheckpoint(id);
  }

  async #closePersistedDocument(id: string, doc: Y.Doc) {
    const persisted = this.#documents.get(id);
    if (persisted) {
      persisted.doc.off("update", persisted.updateListener);
      if (this.#dirtyDocuments.has(id)) {
        await persistProviderState(persisted.provider, false);
      }
      await persisted.provider.destroy();
      this.#documents.delete(id);
      this.#dirtyDocuments.delete(id);
      this.#clearCheckpoint(id);
    }
    doc.destroy();
  }

  async #detachLocalPersistence(id: string) {
    const persisted = this.#documents.get(id);
    if (!persisted) return;
    this.#documents.delete(id);
    persisted.doc.off("update", persisted.updateListener);
    if (this.#dirtyDocuments.has(id)) {
      await persistProviderState(persisted.provider, false);
    }
    await persisted.provider.destroy();
    this.#dirtyDocuments.delete(id);
    this.#clearCheckpoint(id);
  }

  async #releaseDocument(id: string) {
    const documents = this.#registry;
    if (!documents || id === documents.getActiveDocumentId()) return false;
    const persisted = this.#documents.get(id);
    if (persisted) {
      persisted.doc.off("update", persisted.updateListener);
      if (this.#dirtyDocuments.has(id)) {
        await persistProviderState(persisted.provider, false);
      }
      await persisted.provider.destroy();
      this.#documents.delete(id);
      this.#dirtyDocuments.delete(id);
      this.#clearCheckpoint(id);
    }
    const released = documents.releaseDocument(id);
    if (released) {
      const index = this.#recentCanvasIds.indexOf(id);
      if (index >= 0) this.#recentCanvasIds.splice(index, 1);
    }
    return released;
  }

  async #evictDocuments() {
    const documents = this.#registry;
    if (!documents) return;
    while (documents.getDocumentIds().length > MAX_RESIDENT_CANVASES) {
      const activeId = documents.getActiveDocumentId();
      const candidate = this.#recentCanvasIds.find((id) =>
        id !== activeId &&
        !this.#pinnedCanvasIds.has(id) &&
        documents.getDocument(id)
      ) ?? documents.getDocumentIds().find((id) =>
        id !== activeId && !this.#pinnedCanvasIds.has(id)
      );
      if (!candidate || !await this.#releaseDocument(candidate)) return;
    }
  }

  #queueEviction() {
    const task = this.#evictionTask.then(() => this.#evictDocuments());
    this.#evictionTask = task.catch(() => undefined);
    return task;
  }

  async #deleteDocument(id: string) {
    this.#deletedSessionIds.add(id);
    const current = this.#documents.get(id);
    if (current) {
      current.doc.off("update", current.updateListener);
      this.#documents.delete(id);
      this.#dirtyDocuments.delete(id);
      await current.provider.destroy();
    }
    this.#documentGenerations.delete(id);
    this.#previousDocumentGenerations.delete(id);
    this.#documentRevisions.delete(id);
    this.#clearCheckpoint(id);
    this.#writeCatalogIntent();
    await this.#saveCatalog();
  }

  #subscribeToStore() {
    if (!this.#store) return;
    const initialSnapshot = createCatalogSnapshot(
      this.#store.getState(),
      this.#getSlideDeckDescriptor,
      this.#documentGenerations,
      this.#previousDocumentGenerations,
      this.#catalogRevision,
      this.#recoveredSources,
      this.#deletedSessionIds
    );
    this.#lastCatalogJson = catalogSnapshotJson(initialSnapshot);
    this.#lastCatalogStructureJson = catalogStructureJson(initialSnapshot);
    this.#lastCatalogSnapshot = initialSnapshot;
    this.#unsubscribeStore = this.#store.subscribe((state) => {
      state.canvasSessions.forEach((session) => {
        if (session.mode !== "slide" && session.collaboration) {
          void this.#detachLocalPersistence(session.id).catch(
            (error) => this.#handleError(error)
          );
        }
      });
      const snapshot = createCatalogSnapshot(
        state,
        this.#getSlideDeckDescriptor,
        this.#documentGenerations,
        this.#previousDocumentGenerations,
        this.#catalogRevision,
        this.#recoveredSources,
        this.#deletedSessionIds
      );
      const nextJson = catalogSnapshotJson(snapshot);
      if (nextJson === this.#lastCatalogJson) return;
      const nextStructureJson = catalogStructureJson(snapshot);
      const structureChanged = nextStructureJson !== this.#lastCatalogStructureJson;
      this.#lastCatalogJson = nextJson;
      this.#lastCatalogStructureJson = nextStructureJson;
      if (this.#metadataTimer) clearTimeout(this.#metadataTimer);
      this.#publish({ save: "saving" });
      if (structureChanged) {
        this.#metadataTimer = null;
        try {
          this.#writeCatalogIntent();
        } catch (error) {
          this.#handleError(error);
        }
        void this.#saveCatalog()
          .then(() => this.#publish({ save: "saved", error: null }))
          .catch((error) => this.#handleError(error));
        return;
      }
      this.#metadataTimer = setTimeout(() => {
        this.#metadataTimer = null;
        void this.#saveCatalog()
          .then(() => this.#publish({ save: "saved", error: null }))
          .catch((error) => this.#handleError(error));
      }, SAVE_DELAY);
    });
  }

  #scheduleDocumentFlush(id: string) {
    this.#dirtyDocuments.set(id, (this.#dirtyDocuments.get(id) ?? 0) + 1);
    if (this.#documentTimer) clearTimeout(this.#documentTimer);
    this.#publish({ save: "saving" });
    this.#documentTimer = setTimeout(() => {
      this.#documentTimer = null;
      const dirty = Array.from(this.#dirtyDocuments);
      void Promise.all(dirty.flatMap(([documentId]) => {
        const provider = this.#documents.get(documentId)?.provider;
        return provider ? [persistProviderState(provider, false)] : [];
      }))
        .then(() => {
          dirty.forEach(([documentId, revision]) => {
            if (this.#dirtyDocuments.get(documentId) === revision) {
              this.#dirtyDocuments.delete(documentId);
            }
          });
          this.#publish({
            save: this.#dirtyDocuments.size === 0 ? "saved" : "saving",
            error: null,
          });
        })
        .catch((error) => this.#handleError(error));
    }, SAVE_DELAY);
  }

  #scheduleCheckpoint(id: string) {
    if (!this.#coordinatorLease?.held) return;
    const existing = this.#checkpointTimers.get(id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.#checkpointTimers.delete(id);
      void this.#checkpointServices.get(id)?.run().then((committed) => {
        if (!committed && this.#checkpointServices.get(id)?.evaluate()) {
          this.#scheduleCheckpoint(id);
        }
      }).catch((error) => this.#handleError(error));
    }, CHECKPOINT_IDLE_DELAY);
    this.#checkpointTimers.set(id, timer);
  }

  #clearCheckpoint(id: string) {
    const timer = this.#checkpointTimers.get(id);
    if (timer) clearTimeout(timer);
    this.#checkpointTimers.delete(id);
    this.#checkpointServices.get(id)?.cancel();
    this.#checkpointServices.delete(id);
    this.#checkpointTails.delete(id);
  }

  #ensureCheckpointService(id: string) {
    if (this.#checkpointServices.has(id)) return;
    const service = new CanvasCheckpointService<BrowserCheckpointCandidate>({
      getGeneration: () => this.#documentGenerations.get(id) ?? 0,
      getRevision: () => this.#documentRevisions.get(id) ?? 0,
      getMetrics: () => {
        const document = this.#documents.get(id);
        return document
          ? getDocumentAuthorityMetrics(document.doc)
          : { yjsStructs: 0, operations: 0, authorityPayloadBytes: 0 };
      },
      build: async (generation, baseRevision, report) => {
        const source = this.#documents.get(id)?.doc;
        if (!source) throw new Error(`Canvas checkpoint source is unavailable: ${id}`);
        const databaseName = getDocumentDatabaseName(id, generation);
        report("encoding");
        const snapshot = await encodeCanvasCheckpointSnapshot(source, id);
        report("materializing", { snapshotBytes: snapshot.bytes });
        const taskId = await this.#checkpointWorker.build({
          documentId: id,
          databaseName,
          generation,
          baseRevision,
          snapshot: snapshot.buffer,
        });
        return {
          id,
          generation,
          baseRevision,
          databaseName,
          taskId,
          doc: null,
          provider: null,
          digest: null,
          snapshotBytes: snapshot.bytes,
          reclaimedBytes: 0,
          committed: false,
        };
      },
      catchUp: async (candidate, currentRevision, report) => {
        const entries = (this.#checkpointTails.get(id) ?? []).filter(
          ({ revision }) =>
            revision > candidate.baseRevision && revision <= currentRevision
        );
        let expected = candidate.baseRevision + 1;
        for (const entry of entries) {
          if (entry.revision !== expected) return null;
          expected += 1;
        }
        if (expected !== currentRevision + 1) return null;
        report("replaying", {
          tailActions: entries.reduce(
            (count, entry) => count + entry.envelopes.length,
            0
          ),
        });
        candidate.baseRevision = await this.#checkpointWorker.appendTail(
          candidate.taskId,
          entries
        );
        return candidate;
      },
      verify: async (candidate, report) => {
        report("persisting");
        const result = await this.#checkpointWorker.finalize(candidate.taskId);
        report("reopening", {
          workerDurationMs: result.workerDurationMs,
          snapshotBytes: result.snapshotBytes,
        });
        candidate.baseRevision = result.baseRevision;
        candidate.digest = result.digest;
        candidate.reclaimedBytes = Math.max(
          0,
          candidate.snapshotBytes - result.compactedBytes
        );
        const doc = new Y.Doc({ guid: id });
        Y.applyUpdate(doc, result.update, "canvas-checkpoint-worker");
        const provider = new IndexeddbPersistence(candidate.databaseName, doc);
        await provider.whenSynced;
        candidate.doc = doc;
        candidate.provider = provider;
        if (!hasValidPages(doc)) {
          throw new Error(`Canvas checkpoint has no valid pages: ${id}`);
        }
        report("verifying");
      },
      commit: async (candidate) => {
        const current = this.#documents.get(id);
        const registry = this.#registry;
        if (!current || !registry || !candidate.doc || !candidate.provider) {
          throw new Error(`Canvas checkpoint target is unavailable: ${id}`);
        }
        if ((this.#documentRevisions.get(id) ?? 0) !== candidate.baseRevision) {
          throw new Error(`Canvas checkpoint changed before commit: ${id}`);
        }
        const previousGeneration = this.#documentGenerations.get(id) ?? 0;
        const previousRecordedGeneration =
          this.#previousDocumentGenerations.get(id);
        this.#documentGenerations.set(id, candidate.generation);
        this.#previousDocumentGenerations.set(id, previousGeneration);
        try {
          await this.#saveCatalog();
          if ((this.#documentRevisions.get(id) ?? 0) !== candidate.baseRevision) {
            this.#documentGenerations.set(id, previousGeneration);
            if (previousRecordedGeneration === undefined) {
              this.#previousDocumentGenerations.delete(id);
            } else {
              this.#previousDocumentGenerations.set(id, previousRecordedGeneration);
            }
            await this.#saveCatalog();
            throw new Error(`Canvas checkpoint changed during commit: ${id}`);
          }
        } catch (error) {
          this.#documentGenerations.set(id, previousGeneration);
          if (previousRecordedGeneration === undefined) {
            this.#previousDocumentGenerations.delete(id);
          } else {
            this.#previousDocumentGenerations.set(id, previousRecordedGeneration);
          }
          throw error;
        }
        current.doc.off("update", current.updateListener);
        this.#documents.delete(id);
        candidate.committed = true;
        this.#registerDocument(id, candidate.doc, candidate.provider);
        registry.adoptDocument(id, candidate.doc);
        await current.provider.destroy();
        this.#dirtyDocuments.delete(id);
        const tail = this.#checkpointTails.get(id) ?? [];
        this.#checkpointTails.set(
          id,
          tail.filter(({ revision }) => revision > candidate.baseRevision)
        );
        return { reclaimedBytes: candidate.reclaimedBytes };
      },
      abort: async (candidate) => {
        if (candidate.committed) return;
        await candidate.provider?.destroy();
        candidate.doc?.destroy();
        await this.#checkpointWorker.abort(
          candidate.taskId,
          candidate.databaseName
        );
      },
    });
    this.#checkpointServices.set(id, service);
  }

  #saveCatalog() {
    if (!this.#catalog || !this.#store) {
      return Promise.reject(new Error("Canvas catalog is unavailable"));
    }
    const catalog = this.#catalog;
    const store = this.#store;
    const task = this.#catalogSaveTask.then(() => withCatalogWriteLock(
      this.#legacyStorage,
      async () => {
        const localSnapshot = createCatalogSnapshot(
          store.getState(),
          this.#getSlideDeckDescriptor,
          this.#documentGenerations,
          this.#previousDocumentGenerations,
          this.#catalogRevision + 1,
          this.#recoveredSources,
          this.#deletedSessionIds
        );
        const latest = await catalog.load();
        const snapshot = mergeCatalogSnapshot(
          this.#lastCatalogSnapshot,
          localSnapshot,
          latest,
        );
        this.#legacyStorage.setItem(CATALOG_INTENT_KEY, JSON.stringify(snapshot));
        await catalog.save(snapshot);
        const verified = await catalog.load();
        if (!verified || catalogSnapshotJson(verified) !== catalogSnapshotJson(snapshot)) {
          throw new Error("Canvas catalog verification failed");
        }
        this.#catalogRevision = snapshot.revision;
        this.#lastCatalogJson = catalogSnapshotJson(snapshot);
        this.#lastCatalogStructureJson = catalogStructureJson(snapshot);
        this.#lastCatalogSnapshot = snapshot;
        const intent = readCatalogIntent(this.#legacyStorage);
        if (intent?.revision === snapshot.revision) {
          this.#legacyStorage.removeItem(CATALOG_INTENT_KEY);
        }
      },
    ));
    this.#catalogSaveTask = task.catch(() => undefined);
    return task;
  }

  #writeCatalogIntent() {
    if (!this.#store) return;
    const snapshot = createCatalogSnapshot(
      this.#store.getState(),
      this.#getSlideDeckDescriptor,
      this.#documentGenerations,
      this.#previousDocumentGenerations,
      this.#catalogRevision + 1,
      this.#recoveredSources,
      this.#deletedSessionIds
    );
    this.#legacyStorage.setItem(CATALOG_INTENT_KEY, JSON.stringify(snapshot));
  }

  #handleError(error: unknown) {
    this.#publish({
      phase: "degraded",
      save: "error",
      error: error instanceof Error ? error.message : "Canvas persistence failed",
    });
  }

  #publish(patch: Partial<CanvasPersistenceStatus>) {
    this.#status = { ...this.#status, ...patch };
    this.#listeners.forEach((listener) => listener());
  }
}

export const createBrowserCanvasPersistence = (
  options: BrowserCanvasPersistenceOptions
) => new BrowserCanvasPersistence(options);
