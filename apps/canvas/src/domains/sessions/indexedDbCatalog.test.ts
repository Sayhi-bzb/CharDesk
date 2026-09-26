import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CANVAS_CATALOG_DATABASE,
  CANVAS_CATALOG_VERSION,
  CanvasCatalogOpenError,
  createIndexedDbCanvasCatalog,
  type CanvasCatalog,
  type CanvasCatalogSnapshot,
} from "./indexedDbCatalog";

const snapshot: CanvasCatalogSnapshot = {
  revision: 3,
  activeSessionId: "canvas-a",
  sessions: [{
    id: "canvas-a",
    order: 0,
    name: "Canvas A",
    mode: "slide",
    activeSlideId: "slide-2",
    viewport: { offset: { x: 12, y: 8 }, zoom: 1.5 },
  }, {
    id: "canvas-b",
    order: 1,
    name: "Shared Canvas",
    mode: "freeform",
    collaborationRole: "guest",
    collaboration: {
      version: 6,
      documentVersion: 6,
      mode: "freeform",
      provider: "websocket",
      roomId: "catalog-room",
      key: "catalog-key-123456789012345678901234567890123456",
      endpoint: "wss://sync.example.com",
    },
  }],
  slides: [
    {
      id: "slide-2",
      sessionId: "canvas-a",
      name: "Second",
      size: { columns: 100, rows: 27 },
      order: 1,
    },
    {
      id: "slide-1",
      sessionId: "canvas-a",
      name: "First",
      size: { columns: 80, rows: 24 },
      order: 0,
    },
  ],
  preferences: {
    brushChar: "#",
    brushColor: "#111111",
    brushBackgroundColor: "#ffffff",
    showGrid: true,
    exportShowGrid: false,
  },
  recoveredSources: [],
  deletedSessionIds: [],
};

const openNativeCatalog = (version: number) => new Promise<IDBDatabase>(
  (resolve, reject) => {
    const request = indexedDB.open(CANVAS_CATALOG_DATABASE, version);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("workspace")) {
        database.createObjectStore("workspace", { keyPath: "id" });
        database.createObjectStore("sessions", { keyPath: "id" });
        const slides = database.createObjectStore("slides", {
          keyPath: ["sessionId", "id"],
        });
        slides.createIndex("by-session", "sessionId");
        database.createObjectStore("preferences", { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  }
);

const transactionDone = (transaction: IDBTransaction) => new Promise<void>(
  (resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  },
);

describe("IndexedDB canvas catalog", () => {
  let catalogs: CanvasCatalog[] = [];

  beforeEach(() => deleteDB(CANVAS_CATALOG_DATABASE));
  afterEach(async () => {
    catalogs.forEach((catalog) => catalog.close());
    catalogs = [];
    await deleteDB(CANVAS_CATALOG_DATABASE);
  });

  it("stores metadata without canvas cell payloads", async () => {
    const catalog = await createIndexedDbCanvasCatalog();
    catalogs.push(catalog);
    expect(await catalog.load()).toBeNull();

    await catalog.save(snapshot);

    expect(await catalog.load()).toEqual({
      ...snapshot,
      slides: [snapshot.slides[1], snapshot.slides[0]],
    });
  });

  it("replaces removed sessions and slides atomically", async () => {
    const catalog = await createIndexedDbCanvasCatalog();
    catalogs.push(catalog);
    await catalog.save(snapshot);
    await catalog.save({
      ...snapshot,
      activeSessionId: "canvas-b",
      sessions: [{
        id: "canvas-b",
        order: 0,
        name: "Canvas B",
        mode: "freeform",
      }],
      slides: [],
    });

    const restored = await catalog.load();
    expect(restored?.sessions.map(({ id }) => id)).toEqual(["canvas-b"]);
    expect(restored?.slides).toEqual([]);
  });

  it("normalizes the v2 Blackboard mode into a source binding", async () => {
    const legacy = await openNativeCatalog(2);
    const transaction = legacy.transaction(
      ["workspace", "sessions", "preferences"],
      "readwrite",
    );
    transaction.objectStore("workspace").put({
      id: "current",
      schemaVersion: 2,
      activeSessionId: "board",
      migrationComplete: true,
    });
    transaction.objectStore("sessions").put({
      id: "board",
      order: 0,
      name: "Board",
      mode: "blackboard",
      workspaceId: "workspace-1",
    });
    transaction.objectStore("preferences").put({
      id: "canvas",
      ...snapshot.preferences,
    });
    await transactionDone(transaction);
    legacy.close();

    const catalog = await createIndexedDbCanvasCatalog();
    catalogs.push(catalog);
    expect((await catalog.load())?.sessions[0]).toMatchObject({
      mode: "freeform",
      sourceBinding: {
        kind: "blackboard",
        provider: "browser-workspace",
        id: "workspace-1",
      },
    });
  });

  it("migrates legacy session viewport pixels in the upgrade transaction", async () => {
    const legacy = await openNativeCatalog(3);
    const transaction = legacy.transaction(
      ["workspace", "sessions", "preferences"],
      "readwrite",
    );
    transaction.objectStore("workspace").put({
      id: "current",
      schemaVersion: 3,
      activeSessionId: "canvas",
      migrationComplete: true,
    });
    transaction.objectStore("sessions").put({
      id: "canvas",
      order: 0,
      name: "Canvas",
      mode: "freeform",
      viewport: { offset: { x: -8, y: -38 }, zoom: 1.25 },
    });
    transaction.objectStore("preferences").put({
      id: "canvas",
      ...snapshot.preferences,
    });
    await transactionDone(transaction);
    legacy.close();

    const catalog = await createIndexedDbCanvasCatalog();
    catalogs.push(catalog);
    expect((await catalog.load())?.sessions[0].viewport).toEqual({
      offset: { x: -8, y: -40 },
      zoom: 1.25,
    });

    const database = await openNativeCatalog(CANVAS_CATALOG_VERSION);
    const workspace = await new Promise<Record<string, unknown> | undefined>(
      (resolve, reject) => {
        const request = database
          .transaction("workspace", "readonly")
          .objectStore("workspace")
          .get("current");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    expect(workspace?.schemaVersion).toBe(CANVAS_CATALOG_VERSION);
    database.close();
  });
});

describe("IndexedDB canvas catalog lifecycle", () => {
  beforeEach(async () => {
    await deleteDB(CANVAS_CATALOG_DATABASE);
  });

  afterEach(async () => {
    await deleteDB(CANVAS_CATALOG_DATABASE);
  });

  it("rejects instead of hanging when an older tab blocks the upgrade", async () => {
    const olderTab = await openNativeCatalog(1);

    const opening = createIndexedDbCanvasCatalog();
    await expect(opening).rejects.toEqual(expect.objectContaining({
      name: "CanvasCatalogOpenError",
      reason: "upgrade-blocked",
    } satisfies Partial<CanvasCatalogOpenError>));

    olderTab.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("closes its connection when a future version needs to upgrade", async () => {
    const onUnavailable = vi.fn();
    const catalog = await createIndexedDbCanvasCatalog({ onUnavailable });

    const future = await openNativeCatalog(CANVAS_CATALOG_VERSION + 1);

    expect(future.version).toBe(CANVAS_CATALOG_VERSION + 1);
    expect(onUnavailable).toHaveBeenCalledWith("storage-unavailable");
    future.close();
    catalog.close();
  });
});
