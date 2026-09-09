import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import * as Y from "yjs";
import {
  IndexeddbPersistence,
  clearDocument,
  storeState,
} from "y-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSelectionCommandFactory } from "@/domains/actions/public";
import { parseDocumentSessionSource } from "@/domains/document/public";
import {
  CANVAS_CATALOG_DATABASE,
  CANVAS_CATALOG_MARKER_KEY,
  EDITOR_PERSISTENCE_KEY,
  PREVIOUS_EDITOR_PERSISTENCE_VERSION,
  createIndexedDbCanvasCatalog,
  type CanvasSessionSnapshot,
} from "@/domains/sessions/public";
import type { StructuredNode } from "@/domains/legacy-structured/public";
import { createCanvasRuntime, type CanvasRuntime } from "../runtime";
import { gridEntriesToCellPlaneOperation } from "../cell-plane/model";
import {
  CANVAS_DOCUMENT_SCHEMA_VERSION,
  getCanvasDocumentRoot,
  getDefaultCanvasPageId,
  readCanvasPageOrder,
  readCanvasYPage,
} from "./canvasDocumentModel";

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();
  get length() { return this.#values.size; }
  clear() { this.#values.clear(); }
  getItem(key: string) { return this.#values.get(key) ?? null; }
  key(index: number) { return Array.from(this.#values.keys())[index] ?? null; }
  removeItem(key: string) { this.#values.delete(key); }
  setItem(key: string, value: string) { this.#values.set(key, value); }
}

class FailingStorage extends MemoryStorage {
  #remainingFailures: number;

  constructor(remainingFailures: number) {
    super();
    this.#remainingFailures = remainingFailures;
  }

  override setItem(key: string, value: string) {
    if (this.#remainingFailures > 0) {
      this.#remainingFailures -= 1;
      throw new Error("Storage is temporarily unavailable");
    }
    super.setItem(key, value);
  }
}

const SESSION_ID = "indexeddb-persistence-test";
const DOCUMENT_DATABASE = `chardesk-local-document-v1:${SESSION_ID}`;
const LEGACY_SESSION_ID = "legacy-indexeddb-test";
const SLIDE_SESSION_ID = "slide-indexeddb-test";
const SLIDE_DOCUMENT_DATABASE = `chardesk-local-document-v1:${SLIDE_SESSION_ID}`;
const LEGACY_SLIDE_DOCUMENT_DATABASE =
  `chardesk-local-document-v1:${SLIDE_SESSION_ID}:slide:slide-a`;
const V4_BACKUP_KEY = "ascii-canvas-persistence-v4-backup";
const RESIDENCY_SESSION_IDS = Array.from(
  { length: 6 },
  (_, index) => `residency-canvas-${index}`
);

const clearTestDocumentDatabases = async () => {
  const names = (await indexedDB.databases()).flatMap(({ name }) =>
    name?.startsWith("chardesk-local-document-v1:") ? [name] : []
  );
  await Promise.all(names.map(clearDocument));
};

const createRuntime = (
  storage: Storage,
  initialSessions: readonly CanvasSessionSnapshot[] = [{
    id: SESSION_ID,
    name: "Persisted",
    mode: "freeform",
    grid: [["0,0", { char: "A", color: "#111111" }]],
  }]
) => {
  const runtime: CanvasRuntime = createCanvasRuntime({
    persistence: { storage, key: EDITOR_PERSISTENCE_KEY },
    selectionCommands: createSelectionCommandFactory({
      renderClipboardText: async () => ({
        kind: "spans",
        renderer: "raw",
        pipeline: [],
        rows: [],
        width: 0,
        height: 0,
        diagnostics: [],
      }),
    }),
    parseSessionSource: parseDocumentSessionSource,
    initialSessions,
  });
  return runtime;
};

const openOlderCatalogTab = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(CANVAS_CATALOG_DATABASE, 1);
  request.onupgradeneeded = () => {
    const database = request.result;
    database.createObjectStore("workspace", { keyPath: "id" });
    database.createObjectStore("sessions", { keyPath: "id" });
    const slides = database.createObjectStore("slides", {
      keyPath: ["sessionId", "id"],
    });
    slides.createIndex("by-session", "sessionId");
    database.createObjectStore("preferences", { keyPath: "id" });
  };
  request.onerror = () => reject(request.error);
  request.onsuccess = () => resolve(request.result);
});

describe("browser canvas persistence", () => {
  let runtimes: CanvasRuntime[] = [];

  beforeEach(async () => {
    await deleteDB(CANVAS_CATALOG_DATABASE);
    await clearTestDocumentDatabases();
  });

  afterEach(async () => {
    runtimes.forEach((runtime) => runtime.dispose());
    runtimes = [];
    await new Promise((resolve) => setTimeout(resolve, 0));
    await deleteDB(CANVAS_CATALOG_DATABASE);
    await clearTestDocumentDatabases();
  });

  it("restores Yjs cells while the catalog contains metadata only", async () => {
    const storage = new MemoryStorage();
    const first = createRuntime(storage);
    runtimes.push(first);
    await first.ready;
    first.commands.interaction.setTextCursor({ x: 1, y: 0 });
    first.commands.text.write("B");
    await first.retryPersistence();
    first.dispose();
    runtimes = [];
    await new Promise((resolve) => setTimeout(resolve, 0));

    const second = createRuntime(storage);
    runtimes.push(second);
    await second.ready;

    expect(second.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("A");
    expect(second.getState().contentSurface.reader.materialize().get("1,0")?.char).toBe("B");
    expect(storage.getItem(CANVAS_CATALOG_MARKER_KEY)).toBe("1");
    expect(storage.getItem(EDITOR_PERSISTENCE_KEY)).toBeNull();
  });

  it("uses a temporary canvas when an older tab blocks the catalog upgrade", async () => {
    const olderTab = await openOlderCatalogTab();
    const runtime = createRuntime(new MemoryStorage());
    runtimes.push(runtime);

    await runtime.ready;

    expect(runtime.getPersistenceSnapshot()).toMatchObject({
      phase: "degraded",
      restore: {
        phase: "temporary",
        reason: "upgrade-blocked",
        temporaryDirty: false,
      },
    });

    olderTab.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("keeps a failed restore editable and merges temporary work on retry", async () => {
    const storage = new FailingStorage(1);
    const runtime = createRuntime(storage);
    runtimes.push(runtime);
    await runtime.ready;

    expect(runtime.getPersistenceSnapshot()).toMatchObject({
      phase: "degraded",
      restore: {
        phase: "temporary",
        temporaryDirty: false,
      },
    });

    runtime.documents.mutateGrid((grid) => {
      grid.set("2,0", { char: "T", color: "#334455" });
    });
    expect(runtime.getPersistenceSnapshot().restore.temporaryDirty).toBe(true);

    expect(await runtime.retryRestore()).toBe(true);
    expect(runtime.getPersistenceSnapshot()).toMatchObject({
      phase: "ready",
      restore: {
        phase: "ready",
        temporaryDirty: false,
      },
    });
    expect(runtime.getState().canvasSessions.map(({ name }) => name)).toEqual([
      "Persisted",
      "Recovered Canvas",
    ]);
    expect(runtime.getState().canvasSessions.find(
      ({ id }) => id === runtime.getState().activeCanvasId
    )?.name).toBe("Recovered Canvas");
    expect(runtime.getState().contentSurface.reader.materialize().get("2,0")).toEqual({
      char: "T",
      color: "#334455",
    });
  });

  it("leaves temporary content untouched when restore retry fails", async () => {
    const storage = new FailingStorage(2);
    const runtime = createRuntime(storage);
    runtimes.push(runtime);
    await runtime.ready;
    runtime.documents.mutateGrid((grid) => {
      grid.set("3,0", { char: "U", color: "#556677" });
    });

    expect(await runtime.retryRestore()).toBe(false);
    expect(runtime.getPersistenceSnapshot()).toMatchObject({
      phase: "degraded",
      restore: {
        phase: "temporary",
        temporaryDirty: true,
      },
    });
    expect(runtime.getState().contentSurface.reader.materialize().get("3,0")).toEqual({
      char: "U",
      color: "#556677",
    });
  });

  it("loads Canvas documents on demand and keeps only pinned plus recent documents", async () => {
    const storage = new MemoryStorage();
    const sessions: CanvasSessionSnapshot[] = RESIDENCY_SESSION_IDS.map((id, index) => ({
      id,
      name: `Canvas ${index}`,
      mode: "freeform",
      scene: [],
      components: [],
      grid: [["0,0", { char: String(index), color: "#111111" }]],
    }));
    const runtime = createRuntime(storage, sessions);
    runtimes.push(runtime);
    await runtime.ready;

    expect(runtime.documents.getDocumentIds()).toEqual([RESIDENCY_SESSION_IDS[0]]);
    runtime.setRetainedCanvasIds(RESIDENCY_SESSION_IDS.slice(0, 2));

    for (const [index, id] of RESIDENCY_SESSION_IDS.entries()) {
      expect(await runtime.commands.sessions.switch(id)).toBe(true);
      expect(runtime.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe(String(index));
      expect(runtime.documents.getDocumentIds().length).toBeLessThanOrEqual(4);
    }

    expect(runtime.documents.getDocumentIds()).toEqual(expect.arrayContaining(
      RESIDENCY_SESSION_IDS.slice(0, 2)
    ));

    const stale = runtime.commands.sessions.switch(RESIDENCY_SESSION_IDS[2]!);
    const latest = runtime.commands.sessions.switch(RESIDENCY_SESSION_IDS[3]!);
    expect(await stale).toBe(false);
    expect(await latest).toBe(true);
    expect(runtime.getState().activeCanvasId).toBe(RESIDENCY_SESSION_IDS[3]);

    const releasedId = RESIDENCY_SESSION_IDS.find(
      (id) => !runtime.documents.getDocument(id)
    )!;
    expect(await runtime.commands.sessions.remove(releasedId)).toBe(true);
    await runtime.retryPersistence();
    runtime.dispose();
    runtimes = [];
    await new Promise((resolve) => setTimeout(resolve, 0));

    const restored = createRuntime(storage, sessions);
    runtimes.push(restored);
    await restored.ready;
    expect(restored.getState().canvasSessions.some(({ id }) => id === releasedId))
      .toBe(false);
  });

  it("repairs intermediate Y.Map page descriptors without losing content", async () => {
    const storage = new MemoryStorage();
    const first = createRuntime(storage);
    runtimes.push(first);
    await first.ready;
    await first.retryPersistence();
    first.dispose();
    runtimes = [];
    await new Promise((resolve) => setTimeout(resolve, 0));
    await clearDocument(DOCUMENT_DATABASE);

    const pageId = getDefaultCanvasPageId(SESSION_ID);
    const legacy = new Y.Doc({ guid: SESSION_ID });
    const provider = new IndexeddbPersistence(DOCUMENT_DATABASE, legacy);
    await provider.whenSynced;
    const descriptor = new Y.Map<unknown>();
    descriptor.set("id", pageId);
    descriptor.set("kind", "cell-plane");
    const nestedOperations = new Y.Array();
    nestedOperations.push([
      gridEntriesToCellPlaneOperation("intermediate-page", [[
        "7,4",
        { char: "旧", color: "#223344" },
      ]])!,
    ]);
    descriptor.set("operations", nestedOperations);
    legacy.getMap("document-pages").set(pageId, descriptor);
    legacy.getArray("document-page-order").push([pageId]);
    const meta = legacy.getMap("document-meta");
    meta.set("schemaVersion", CANVAS_DOCUMENT_SCHEMA_VERSION);
    meta.set("documentId", SESSION_ID);
    meta.set("mode", "freeform");
    meta.set("activePageId", pageId);
    await storeState(provider, true);
    await provider.destroy();
    legacy.destroy();

    const second = createRuntime(storage);
    runtimes.push(second);
    await second.ready;

    expect(second.getPersistenceSnapshot()).toMatchObject({
      phase: "ready",
      save: "saved",
      error: null,
    });
    expect(second.getState().canvasSessions.map(({ name }) => name))
      .toEqual(["Persisted"]);
    expect(second.getState().contentSurface.reader.materialize().get("7,4"))
      .toMatchObject({ char: "旧", color: "#223344" });
    const restored = second.documents.getCollaborationDocument(SESSION_ID);
    expect(restored?.getMap("document-pages").get(pageId))
      .not.toBeInstanceOf(Y.Map);
  });

  it("opens legacy IndexedDB content before seeding a missing catalog", async () => {
    const storage = new MemoryStorage();
    const legacy = new Y.Doc({ guid: SESSION_ID });
    const provider = new IndexeddbPersistence(DOCUMENT_DATABASE, legacy);
    await provider.whenSynced;
    legacy.getMap("main-grid").set(
      "8,6",
      { char: "存", color: "#334455" }
    );
    await storeState(provider, true);
    await provider.destroy();
    legacy.destroy();

    const runtime = createRuntime(storage);
    runtimes.push(runtime);
    await runtime.ready;

    expect(runtime.getPersistenceSnapshot()).toMatchObject({
      phase: "ready",
      save: "saved",
      error: null,
    });
    expect(runtime.getState().contentSurface.reader.materialize().get("8,6"))
      .toMatchObject({ char: "存", color: "#334455" });
    expect(runtime.getState().contentSurface.reader.materialize().get("0,0")).toBeUndefined();
    expect(storage.getItem(CANVAS_CATALOG_MARKER_KEY)).toBe("1");
  });

  it("reattaches persisted sessions and names after a bootstrap catalog overwrite", async () => {
    const storage = new MemoryStorage();
    const bootstrapSessions: CanvasSessionSnapshot[] = [{
      id: SESSION_ID,
      name: "Welcome",
      mode: "freeform",
      grid: [["0,0", { char: "A", color: "#111111" }]],
    }];
    const first = createRuntime(storage, bootstrapSessions);
    runtimes.push(first);
    await first.ready;
    await first.retryPersistence();
    first.dispose();
    runtimes = [];
    await new Promise((resolve) => setTimeout(resolve, 0));

    const orphan = new Y.Doc({ guid: LEGACY_SESSION_ID });
    const provider = new IndexeddbPersistence(
      `chardesk-local-document-v1:${LEGACY_SESSION_ID}`,
      orphan
    );
    await provider.whenSynced;
    orphan.getMap("main-grid").set(
      "3,2",
      { char: "B", color: "#222222" }
    );
    await storeState(provider, true);
    await provider.destroy();
    orphan.destroy();
    storage.setItem(V4_BACKUP_KEY, JSON.stringify({
      version: 4,
      state: {
        canvasSessions: [
          { ...bootstrapSessions[0], name: "Original canvas" },
          {
            id: LEGACY_SESSION_ID,
            name: "Second canvas",
            mode: "freeform",
            scene: [],
            components: [],
            grid: [],
          },
        ],
        activeCanvasId: LEGACY_SESSION_ID,
        canvasMode: "freeform",
        offset: { x: 0, y: 0 },
        zoom: 1,
      },
    }));

    const second = createRuntime(storage, bootstrapSessions);
    runtimes.push(second);
    await second.ready;

    expect(second.getState().canvasSessions.map(({ id, name }) => ({ id, name })))
      .toEqual([
        { id: SESSION_ID, name: "Original canvas" },
        { id: LEGACY_SESSION_ID, name: "Second canvas" },
      ]);
    expect(second.getState().activeCanvasId).toBe(LEGACY_SESSION_ID);
    expect(second.getState().contentSurface.reader.materialize().get("3,2")?.char).toBe("B");
  });

  it("reattaches an orphan document even when historical names are unavailable", async () => {
    const storage = new MemoryStorage();
    const first = createRuntime(storage);
    runtimes.push(first);
    await first.ready;
    await first.retryPersistence();
    first.dispose();
    runtimes = [];
    await new Promise((resolve) => setTimeout(resolve, 0));

    const orphan = new Y.Doc({ guid: LEGACY_SESSION_ID });
    const provider = new IndexeddbPersistence(
      `chardesk-local-document-v1:${LEGACY_SESSION_ID}`,
      orphan
    );
    await provider.whenSynced;
    orphan.getMap("main-grid").set(
      "5,1",
      { char: "R", color: "#333333" }
    );
    await storeState(provider, true);
    await provider.destroy();
    orphan.destroy();

    const second = createRuntime(storage);
    runtimes.push(second);
    await second.ready;

    expect(second.getState().canvasSessions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: LEGACY_SESSION_ID,
        name: "Recovered Canvas 1",
        mode: "freeform",
      }),
    ]));
  });

  it("recovers a full historical backup even when its IndexedDB document is gone", async () => {
    const storage = new MemoryStorage();
    const bootstrapSessions: CanvasSessionSnapshot[] = [{
      id: SESSION_ID,
      name: "Welcome",
      mode: "freeform",
      grid: [],
    }];
    const first = createRuntime(storage, bootstrapSessions);
    runtimes.push(first);
    await first.ready;
    await first.retryPersistence();
    first.dispose();
    runtimes = [];
    await new Promise((resolve) => setTimeout(resolve, 0));
    await clearDocument(DOCUMENT_DATABASE);

    storage.setItem(V4_BACKUP_KEY, JSON.stringify({
      version: 4,
      state: {
        canvasSessions: [{
          id: LEGACY_SESSION_ID,
          name: "Lost workspace",
          mode: "freeform",
          scene: [],
          components: [],
          grid: [["9,4", { char: "回", color: "#445566" }]],
        }],
        activeCanvasId: LEGACY_SESSION_ID,
        canvasMode: "freeform",
        offset: { x: 0, y: 0 },
        zoom: 1,
      },
    }));

    const recovered = createRuntime(storage, bootstrapSessions);
    runtimes.push(recovered);
    await recovered.ready;

    expect(recovered.getState().canvasSessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Recovered · Lost workspace" }),
    ]));
    expect(recovered.getState().contentSurface.reader.materialize().get("9,4")?.char).toBe("回");
  });

  it("replays a synchronous catalog intent after an immediate refresh", async () => {
    const storage = new MemoryStorage();
    const first = createRuntime(storage);
    runtimes.push(first);
    await first.ready;

    first.commands.sessions.create("freeform");
    const createdId = first.getState().activeCanvasId;
    const intent = JSON.parse(
      storage.getItem("chardesk-canvas-catalog-intent-v1") ?? "null"
    ) as { activeSessionId?: string; sessions?: { id: string }[] } | null;
    expect(intent?.activeSessionId).toBe(createdId);
    expect(intent?.sessions?.some(({ id }) => id === createdId)).toBe(true);

    first.dispose();
    runtimes = [];
    const restored = createRuntime(storage);
    runtimes.push(restored);
    await restored.ready;
    expect(restored.getState().activeCanvasId).toBe(createdId);
    expect(restored.getState().canvasSessions.some(({ id }) => id === createdId))
      .toBe(true);
  });

  it("tombstones a deleted Canvas without physically clearing its recovery data", async () => {
    const storage = new MemoryStorage();
    const first = createRuntime(storage);
    runtimes.push(first);
    await first.ready;
    first.commands.sessions.create("freeform");
    const deletedId = first.getState().activeCanvasId;
    first.commands.interaction.setTextCursor({ x: 2, y: 1 });
    first.commands.text.write("D");
    await first.retryPersistence();

    expect(await first.commands.sessions.remove(deletedId)).toBe(true);
    expect(first.documents.getMemoryStats()).toMatchObject({
      historyDocuments: 0,
      historyGroups: 0,
      historyActions: 0,
      historyBytes: 0,
    });
    const catalog = await createIndexedDbCanvasCatalog();
    const snapshot = await catalog.load();
    catalog.close();
    expect(snapshot?.deletedSessionIds).toContain(deletedId);
    expect((await indexedDB.databases()).map(({ name }) => name)).toContain(
      `chardesk-local-document-v1:${deletedId}`
    );

    first.dispose();
    runtimes = [];
    const restored = createRuntime(storage);
    runtimes.push(restored);
    await restored.ready;
    expect(restored.getState().canvasSessions.some(({ id }) => id === deletedId))
      .toBe(false);
  });

  it("prefers a valid newer generation without deleting older databases", async () => {
    const storage = new MemoryStorage();
    const first = createRuntime(storage);
    runtimes.push(first);
    await first.ready;
    await first.retryPersistence();
    first.dispose();
    runtimes = [];
    await new Promise((resolve) => setTimeout(resolve, 0));

    const newerDatabase = `${DOCUMENT_DATABASE}:generation:2`;
    const newer = new Y.Doc({ guid: SESSION_ID });
    const provider = new IndexeddbPersistence(newerDatabase, newer);
    await provider.whenSynced;
    newer.getMap("main-grid").set(
      "6,3",
      { char: "新", color: "#556677" }
    );
    await storeState(provider, true);
    await provider.destroy();
    newer.destroy();

    const restored = createRuntime(storage);
    runtimes.push(restored);
    await restored.ready;
    expect(restored.getState().contentSurface.reader.materialize().get("6,3")?.char).toBe("新");
    const databaseNames = (await indexedDB.databases())
      .map(({ name }) => name);
    expect(databaseNames).toContain(DOCUMENT_DATABASE);
    expect(databaseNames).toContain(newerDatabase);
  });

  it("flattens a legacy Structured document into CellPlane content", async () => {
    const storage = new MemoryStorage();
    const database = `chardesk-local-document-v1:${LEGACY_SESSION_ID}`;
    const textNode: StructuredNode = {
      id: "legacy-text",
      type: "text",
      order: 1,
      position: { x: 3, y: 2 },
      text: "Preserved",
      style: { color: "#445566" },
    };
    const legacy = new Y.Doc({ guid: LEGACY_SESSION_ID });
    const provider = new IndexeddbPersistence(database, legacy);
    await provider.whenSynced;
    legacy.getMap("structured-scene").set(textNode.id, textNode);
    await storeState(provider, true);
    await provider.destroy();
    legacy.destroy();

    const legacySession: CanvasSessionSnapshot = {
      id: LEGACY_SESSION_ID,
      name: "Structured legacy",
      mode: "freeform",
      grid: [],
    };
    const runtime = createRuntime(storage, [legacySession]);
    runtimes.push(runtime);
    await runtime.ready;

    expect(runtime.getPersistenceSnapshot().phase).toBe("ready");
    expect(runtime.getState().canvasMode).toBe("freeform");
    expect(runtime.getState().contentSurface.reader.getCell({ x: 3, y: 2 })?.char)
      .toBe("P");
  });

  it("migrates a V5 localStorage snapshot only after IndexedDB verification", async () => {
    const storage = new MemoryStorage();
    storage.setItem(EDITOR_PERSISTENCE_KEY, JSON.stringify({
      version: PREVIOUS_EDITOR_PERSISTENCE_VERSION,
      state: {
        schemaVersion: PREVIOUS_EDITOR_PERSISTENCE_VERSION,
        workspace: {
          offset: { x: 20, y: 30 },
          zoom: 1.25,
          canvasMode: "freeform",
          grid: [["4,5", { char: "迁", color: "#222222" }]],
          structuredScene: [],
          structuredComponents: [],
        },
        sessions: {
          activeId: LEGACY_SESSION_ID,
          items: [{
            id: LEGACY_SESSION_ID,
            name: "Legacy",
            mode: "freeform",
            scene: [],
            components: [],
            grid: [["4,5", { char: "迁", color: "#222222" }]],
          }],
        },
        preferences: {
          brushChar: "@",
          brushColor: "#123456",
          brushBackgroundColor: "#654321",
          showGrid: true,
          exportShowGrid: false,
        },
      },
    }));

    const runtime = createRuntime(storage);
    runtimes.push(runtime);
    await runtime.ready;

    expect(runtime.getState()).toMatchObject({
      activeCanvasId: LEGACY_SESSION_ID,
      brushChar: "@",
    });
    expect(runtime.viewport.getSnapshot()).toEqual({
      offset: { x: 20, y: 600 / 19 },
      zoom: 1.25,
    });
    expect(runtime.getState().contentSurface.reader.materialize().get("4,5")?.char).toBe("迁");
    expect(storage.getItem(EDITOR_PERSISTENCE_KEY)).toBeNull();
    expect(storage.getItem(CANVAS_CATALOG_MARKER_KEY)).toBe("1");
  });

  it("persists slide pages in one session Yjs document", async () => {
    const storage = new MemoryStorage();
    const slides: CanvasSessionSnapshot[] = [{
      id: SLIDE_SESSION_ID,
      name: "Slides",
      mode: "slide",
      slideDeck: {
        activeSlideId: "slide-a",
        slides: [
          {
            id: "slide-a",
            name: "Slide A",
            size: { columns: 80, rows: 24 },
            grid: [["0,0", { char: "X", color: "#111111" }]],
          },
          {
            id: "slide-b",
            name: "Slide B",
            size: { columns: 80, rows: 24 },
            grid: [["0,0", { char: "Z", color: "#222222" }]],
          },
        ],
      },
      grid: [],
    }];
    const first = createRuntime(storage, slides);
    runtimes.push(first);
    await first.ready;
    expect(first.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("X");
    first.commands.slides.activate("slide-b");
    expect(first.getState().slideDeck?.activeSlideId).toBe("slide-b");
    expect(first.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("Z");
    first.commands.interaction.setTextCursor({ x: 1, y: 0 });
    first.commands.text.write("Y");
    expect(first.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("Z");
    const staleDocument = first.documents.getCollaborationDocument(SLIDE_SESSION_ID);
    expect(staleDocument).not.toBeNull();
    staleDocument!.transact(() => {
      getCanvasDocumentRoot(staleDocument!).meta.set("activePageId", "slide-a");
    }, "stale-slide-selection");
    await first.retryPersistence();
    first.dispose();
    runtimes = [];
    await new Promise((resolve) => setTimeout(resolve, 0));

    const second = createRuntime(storage, slides);
    runtimes.push(second);
    await second.ready;
    expect(second.getState().slideDeck?.activeSlideId).toBe("slide-b");
    expect(second.documents.getActivePageId()).toBe("slide-b");
    expect(second.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("Z");
    expect(second.getState().contentSurface.reader.materialize().get("1,0")?.char).toBe("Y");
    expect(
      second.documents
        .getContentReader(SLIDE_SESSION_ID, "slide-a")
        ?.getCell({ x: 0, y: 0 })
        ?.char
    ).toBe("X");
  });

  it("migrates legacy per-slide IndexedDB content into the session document", async () => {
    const storage = new MemoryStorage();
    const slides: CanvasSessionSnapshot[] = [{
      id: SLIDE_SESSION_ID,
      name: "Slides",
      mode: "slide",
      slideDeck: {
        activeSlideId: "slide-a",
        slides: [{
          id: "slide-a",
          name: "Slide A",
          size: { columns: 80, rows: 24 },
          grid: [],
        }],
      },
      grid: [],
    }];
    const first = createRuntime(storage, slides);
    runtimes.push(first);
    await first.ready;
    await first.retryPersistence();
    first.dispose();
    runtimes = [];
    await new Promise((resolve) => setTimeout(resolve, 0));
    await clearDocument(SLIDE_DOCUMENT_DATABASE);

    const legacy = new Y.Doc({ guid: `${SLIDE_SESSION_ID}:slide:slide-a` });
    const provider = new IndexeddbPersistence(LEGACY_SLIDE_DOCUMENT_DATABASE, legacy);
    await provider.whenSynced;
    legacy.getArray("cell-plane-operations").push([
      gridEntriesToCellPlaneOperation("legacy-slide", [[
        "2,3",
        { char: "旧", color: "#111111" },
      ]])!,
    ]);
    await storeState(provider, true);
    await provider.destroy();
    legacy.destroy();

    const second = createRuntime(storage, slides);
    runtimes.push(second);
    await second.ready;
    expect(second.getState().contentSurface.reader.materialize().get("2,3")?.char).toBe("旧");
  });

  it("coordinates persistence without making peer tabs read-only", async () => {
    const storage = new MemoryStorage();
    const writer = createRuntime(storage);
    runtimes.push(writer);
    await writer.ready;

    const reader = createRuntime(storage);
    runtimes.push(reader);
    await reader.ready;

    expect(writer.getPersistenceSnapshot().coordination).toBe("coordinator");
    expect(reader.getPersistenceSnapshot().coordination).toBe("peer");
    expect(reader.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("A");

    reader.commands.grid.replace([
      ...reader.getState().contentSurface.reader.materialize().entries(),
      ["1,0", { char: "P", color: "#222222" }],
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(writer.getState().contentSurface.reader.materialize().get("1,0")?.char).toBe("P");
  });

  it("merges concurrent catalog changes from coordinator and peer tabs", async () => {
    const storage = new MemoryStorage();
    const coordinator = createRuntime(storage);
    runtimes.push(coordinator);
    await coordinator.ready;

    const peer = createRuntime(storage);
    runtimes.push(peer);
    await peer.ready;
    coordinator.commands.sessions.create("freeform", { name: "Created in coordinator" });
    const coordinatorCreatedId = coordinator.getState().activeCanvasId;
    peer.commands.sessions.create("freeform", { name: "Created in peer" });
    const peerCreatedId = peer.getState().activeCanvasId;
    await new Promise((resolve) => setTimeout(resolve, 40));

    coordinator.dispose();
    peer.dispose();
    runtimes = [];
    await new Promise((resolve) => setTimeout(resolve, 0));

    const restored = createRuntime(storage);
    runtimes.push(restored);
    await restored.ready;
    expect(restored.getState().canvasSessions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: coordinatorCreatedId,
        name: "Created in coordinator",
      }),
      expect.objectContaining({ id: peerCreatedId, name: "Created in peer" }),
    ]));
  });

  it("rotates a tombstone-heavy document into a clean generation", async () => {
    const storage = new MemoryStorage();
    const first = createRuntime(storage);
    runtimes.push(first);
    await first.ready;
    await first.retryPersistence();
    first.dispose();
    runtimes = [];
    await new Promise((resolve) => setTimeout(resolve, 0));

    const noisy = new Y.Doc({ guid: SESSION_ID });
    const provider = new IndexeddbPersistence(DOCUMENT_DATABASE, noisy);
    await provider.whenSynced;
    const tombstones = noisy.getMap("compaction-test-tombstones");
    noisy.transact(() => {
      for (let index = 0; index < 10_100; index += 1) {
        tombstones.set(String(index), index);
      }
      tombstones.clear();
    });
    await storeState(provider, true);
    await provider.destroy();
    noisy.destroy();

    const second = createRuntime(storage);
    runtimes.push(second);
    await second.ready;

    expect(second.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("A");
    const catalog = await createIndexedDbCanvasCatalog();
    const snapshot = await catalog.load();
    catalog.close();
    expect(snapshot?.sessions.find(({ id }) => id === SESSION_ID))
      .toMatchObject({ documentGeneration: 1 });
    const compacted = second.documents.getCollaborationDocument(SESSION_ID)!;
    const structCount = Array.from(compacted.store.clients.values())
      .reduce((count, structs) => count + structs.length, 0);
    expect(structCount).toBeLessThan(100);
  });

  it("checkpoints a live operation-heavy document without losing content", async () => {
    const storage = new MemoryStorage();
    const runtime = createRuntime(storage);
    runtimes.push(runtime);
    await runtime.ready;

    const doc = runtime.documents.getCollaborationDocument(SESSION_ID)!;
    const root = getCanvasDocumentRoot(doc);
    const page = readCanvasYPage(root, readCanvasPageOrder(root)[0]!)!;
    doc.transact(() => {
      page.operations.push(Array.from({ length: 5_000 }, (_, index) =>
        gridEntriesToCellPlaneOperation(`checkpoint-${index}`, [[
          "1,0",
          { char: String(index % 10), color: "#223344" },
        ]])!
      ));
    });

    const checkpoint = runtime.persistence!.runCheckpointNow();
    runtime.documents.mutateGrid((grid) => {
      grid.set("2,0", { char: "尾", color: "#556677" });
    });

    expect(await checkpoint).toBe(true);
    expect(runtime.documents.getContentReader().getCell({ x: 1, y: 0 }))
      .toEqual({ char: "9", color: "#223344" });
    expect(runtime.documents.getContentReader().getCell({ x: 2, y: 0 }))
      .toEqual({ char: "尾", color: "#556677" });
    expect(runtime.persistence!.getCheckpointDiagnostics()).toMatchObject({
      phase: "idle",
      generation: 1,
      reason: "operations",
      tailActions: 1,
      error: null,
    });
    const catalog = await createIndexedDbCanvasCatalog();
    const snapshot = await catalog.load();
    catalog.close();
    expect(snapshot?.sessions.find(({ id }) => id === SESSION_ID))
      .toMatchObject({ documentGeneration: 1 });
  });
});
