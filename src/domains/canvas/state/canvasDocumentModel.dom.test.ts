import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { CanvasDocumentRegistry } from "./CanvasDocumentRegistry";
import {
  createCanvasYPage,
  getCanvasDocumentRoot,
  writeCanvasDocumentMetadata,
} from "./canvasDocumentModel";

const cell = (char: string) => ({ char, color: "#000000" });

describe("unified Canvas documents", () => {
  it("releases inactive runtime state without deleting persisted content", () => {
    const documents = new CanvasDocumentRegistry("canvas-a");
    const deleted: string[] = [];
    documents.configureDocumentLifecycle({
      onCreate: () => undefined,
      onDelete: (id) => deleted.push(id),
    });
    documents.activateDocument("canvas-b", {
      mode: "freeform",
      grid: [],
      scene: [],
      components: [],
    });

    expect(documents.releaseDocument("canvas-a")).toBe(true);
    expect(documents.getDocument("canvas-a")).toBeNull();
    expect(deleted).toEqual([]);

    documents.activateDocument("canvas-c", {
      mode: "freeform",
      grid: [],
      scene: [],
      components: [],
    });
    expect(documents.destroyDocument("canvas-b")).toBe(true);
    expect(deleted).toEqual(["canvas-b"]);
    documents.dispose();
  });

  it("preserves history across residency release but clears it on deletion", () => {
    const documents = new CanvasDocumentRegistry("baseline");
    const seed = { mode: "freeform" as const, grid: [], scene: [], components: [] };
    documents.activateDocument("target", seed);
    documents.mutateGrid((grid) => grid.set("0,0", cell("A")));
    expect(documents.getHistoryAvailability().canUndo).toBe(true);

    documents.activateDocument("baseline", seed);
    expect(documents.releaseDocument("target")).toBe(true);
    documents.activateDocument("target", seed);
    expect(documents.getHistoryAvailability().canUndo).toBe(true);

    documents.activateDocument("baseline", seed);
    expect(documents.destroyDocument("target")).toBe(true);
    documents.activateDocument("target", seed);
    expect(documents.getHistoryAvailability().canUndo).toBe(false);
    expect(documents.getMemoryStats()).toMatchObject({
      historyDocuments: 0,
      historyGroups: 0,
      historyActions: 0,
      historyBytes: 0,
    });
    documents.dispose();
  });

  it("does not orphan projection cache entries during observed replacement", () => {
    const documents = new CanvasDocumentRegistry("baseline");
    const baseline = documents.getMemoryStats();
    const stopObserving = documents.observeActiveTransactions(() => undefined);
    const grid: [string, ReturnType<typeof cell>][] = Array.from(
      { length: 160 },
      (_, index) => [`${index * 2},0`, cell("你")]
    );

    documents.activateDocument("unicode", {
      mode: "freeform",
      grid: [],
      scene: [],
      components: [],
    });
    documents.activateDocument("unicode", {
      mode: "freeform",
      grid,
      scene: [],
      components: [],
    }, { replace: true });
    expect(documents.getContentReader().getCell({ x: 0, y: 0 }))
      .toEqual(cell("你"));
    expect(documents.getMemoryStats()).toMatchObject({
      unattributedProjectionCacheEntries: 0,
      unattributedProjectionCacheBytes: 0,
    });

    documents.activateDocument("baseline", {
      mode: "freeform",
      grid: [],
      scene: [],
      components: [],
    });
    expect(documents.destroyDocument("unicode")).toBe(true);
    expect(documents.getMemoryStats()).toMatchObject({
      projectionCacheEntries: baseline.projectionCacheEntries,
      projectionCacheBudgetBytes: baseline.projectionCacheBudgetBytes,
      unattributedProjectionCacheEntries: 0,
      unattributedProjectionCacheBytes: 0,
    });
    stopObserving();
    documents.dispose();
  });

  it("rebuilds page observers before mutating a replaced empty document", () => {
    const documents = new CanvasDocumentRegistry("replace-empty");
    documents.activateDocument("replace-empty", {
      mode: "freeform",
      grid: [],
      scene: [],
      components: [],
    }, { replace: true });

    documents.mutateGrid((grid) => grid.set("0,0", cell("A")));

    expect(documents.getContentReader().getCell({ x: 0, y: 0 }))
      .toEqual(cell("A"));
    expect(documents.getActiveCellCount()).toBe(1);
    documents.dispose();
  });

  it("keeps slide pages in one document with page-local history", () => {
    const documents = new CanvasDocumentRegistry("slides");
    documents.activateDocument("slides", {
      mode: "slide",
      activePageId: "slide-a",
      pages: [
        { id: "slide-a", kind: "cell-plane" },
        { id: "slide-b", kind: "cell-plane" },
      ],
      grid: [],
      scene: [],
      components: [],
    }, { replace: true });

    documents.mutateGridAt(
      { documentId: "slides", pageId: "slide-a" },
      (grid) => grid.set("0,0", cell("A"))
    );
    documents.activatePage("slides", "slide-b");
    const slideDocument = documents.getCollaborationDocument("slides");
    expect(slideDocument).not.toBeNull();
    expect(getCanvasDocumentRoot(slideDocument!).meta.get("activePageId"))
      .toBe("slide-b");
    documents.mutateGridAt(
      { documentId: "slides", pageId: "slide-b" },
      (grid) => grid.set("0,0", cell("B"))
    );

    expect(documents.getContentReader("slides", "slide-a")?.getCell({ x: 0, y: 0 }))
      .toEqual(cell("A"));
    expect(documents.undo()).toBe(true);
    expect(documents.getContentReader("slides", "slide-b")?.getCell({ x: 0, y: 0 }))
      .toBeUndefined();
    expect(documents.getContentReader("slides", "slide-a")?.getCell({ x: 0, y: 0 }))
      .toEqual(cell("A"));
    documents.dispose();
  });

  it("keeps semantic undo available after adopting a compacted Y.Doc", () => {
    const id = "checkpoint-history";
    const documents = new CanvasDocumentRegistry(id);
    documents.mutateGrid((grid) => grid.set("0,0", cell("A")));
    const draft = documents.getDocumentDraft(id)!;
    const compacted = new Y.Doc({ guid: id });
    const root = getCanvasDocumentRoot(compacted);
    compacted.transact(() => {
      draft.pages.forEach((page) => createCanvasYPage(
        root,
        page,
        `checkpoint:${id}:${page.id}`
      ));
      writeCanvasDocumentMetadata(
        root,
        id,
        draft.mode,
        draft.activePageId
      );
    });

    documents.adoptDocument(id, compacted);
    expect(documents.getHistoryAvailability().canUndo).toBe(true);
    expect(documents.undo()).toBe(true);
    expect(documents.getContentReader().getCell({ x: 0, y: 0 })).toBeUndefined();
    expect(documents.redo()).toBe(true);
    expect(documents.getContentReader().getCell({ x: 0, y: 0 }))
      .toEqual(cell("A"));
    documents.dispose();
  });

  it("creates page indexes on demand and keeps a bounded resident set", () => {
    const documents = new CanvasDocumentRegistry("many-pages");
    documents.activateDocument("many-pages", {
      mode: "slide",
      activePageId: "page-0",
      pages: Array.from({ length: 8 }, (_, index) => ({
        id: `page-${index}`,
        kind: "cell-plane" as const,
        grid: [["0,0", cell(String(index))]],
      })),
      grid: [],
      scene: [],
      components: [],
    }, { replace: true });

    expect(documents.getMemoryStats()).toMatchObject({
      documents: 1,
      pages: 8,
      residentPageIndexes: 1,
      indexCachedChunks: expect.any(Number),
      indexCachedCells: expect.any(Number),
      indexPreparedTextEntries: expect.any(Number),
      indexPreparedTextBytes: expect.any(Number),
      structuredSurfaceCount: 0,
      structuredResidentChunks: 0,
      structuredResidentBytes: 0,
      estimatedProjectionBytes: expect.any(Number),
    });
    for (let index = 1; index < 8; index += 1) {
      expect(documents.getContentReader("many-pages", `page-${index}`))
        .not.toBeNull();
    }
    expect(documents.getMemoryStats().residentPageIndexes).toBeLessThanOrEqual(4);
    documents.activatePage("many-pages", "page-0");
    expect(documents.getContentReader().getCell({ x: 0, y: 0 }))
      .toEqual(cell("0"));
    documents.dispose();
  });

  it("merges independently initialized copies through deterministic page roots", () => {
    const id = `offline-${crypto.randomUUID()}`;
    const left = new CanvasDocumentRegistry(id);
    const right = new CanvasDocumentRegistry(id);
    left.mutateGrid((grid) => grid.set("0,0", cell("L")));
    right.mutateGrid((grid) => grid.set("1,0", cell("R")));

    const leftDoc = left.getCollaborationDocument(id)!;
    const rightDoc = right.getCollaborationDocument(id)!;
    const leftUpdate = Y.encodeStateAsUpdate(leftDoc);
    const rightUpdate = Y.encodeStateAsUpdate(rightDoc);
    Y.applyUpdate(leftDoc, rightUpdate);
    Y.applyUpdate(rightDoc, leftUpdate);

    expect(Object.fromEntries(left.getContentReader().materialize())).toEqual({
      "0,0": cell("L"),
      "1,0": cell("R"),
    });
    expect(right.getContentReader().materialize())
      .toEqual(left.getContentReader().materialize());
    left.dispose();
    right.dispose();
  });
});
