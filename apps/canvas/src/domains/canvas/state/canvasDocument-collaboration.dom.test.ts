import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { CanvasDocumentRegistry } from "./CanvasDocumentRegistry";
import { getCanvasDocumentRoot } from "./canvasDocumentModel";
import {
  CellPlaneIndex,
  gridChangesToCellPlaneOperation,
  type CellPlaneOperation,
} from "../cell-plane/model";

const cell = (char: string) => ({ char, color: "#000000" });
const getCellPlaneOperations = (doc: Y.Doc) => {
  const pageId = doc.getArray<string>("document-page-order").get(0);
  return doc.getArray<CellPlaneOperation>(
    pageId
      ? `canvas-page:${encodeURIComponent(pageId)}:cell-plane-operations`
      : "cell-plane-operations"
  );
};
const readGrid = (doc: Y.Doc) =>
  new CellPlaneIndex(
    getCellPlaneOperations(doc).toArray()
  ).materialize();
const mutateGrid = (
  doc: Y.Doc,
  id: string,
  mutation: (grid: Map<string, ReturnType<typeof cell>>) => void
) => {
  const before = readGrid(doc);
  const after = new Map(before);
  mutation(after);
  const changes = new Map<
    string,
    { before?: ReturnType<typeof cell>; after?: ReturnType<typeof cell> }
  >();
  new Set([...before.keys(), ...after.keys()]).forEach((key) => {
    const previous = before.get(key);
    const next = after.get(key);
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    changes.set(key, {
      ...(previous ? { before: previous } : {}),
      ...(next ? { after: next } : {}),
    });
  });
  const operation = gridChangesToCellPlaneOperation(id, changes);
  if (operation) getCellPlaneOperations(doc).push([operation]);
};
describe("canvas CRDT collaboration", () => {
  it("reattaches a bound collaboration page when a remote update removes page metadata", () => {
    const id = `collaboration-page-repair-${crypto.randomUUID()}`;
    const documents = new CanvasDocumentRegistry(id);
    documents.mutateGrid((grid) => grid.set("0,0", cell("R")));
    documents.prepareDocumentForCollaboration(id, {
      mode: "freeform",
      documentVersion: 6,
      roomId: "repair-room-123456",
      sharedDocumentId: "collaboration:repair-room-123456",
    });
    const stop = documents.observeActiveTransactions(() => undefined);
    const doc = documents.getCollaborationDocument(id)!;
    const root = getCanvasDocumentRoot(doc);

    doc.transact(() => {
      root.pages.clear();
      root.pageOrder.delete(0, root.pageOrder.length);
    }, "malformed-remote-update");

    expect(documents.getPageDescriptors(id)).toEqual([
      expect.objectContaining({
        id: "collaboration:repair-room-123456:page:main",
        kind: "cell-plane",
      }),
    ]);
    expect(documents.getContentReader().getCell({ x: 0, y: 0 })).toEqual(
      cell("R")
    );
    stop();
    documents.dispose();
  });

  it("repairs concurrent anchors that overlap a wide-cell footprint", () => {
    const id = `wide-overlap-${crypto.randomUUID()}`;
    const documents = new CanvasDocumentRegistry(id);
    const local = documents.getCollaborationDocument(id)!;
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));

    mutateGrid(remote, "remote-overlap", (grid) => {
      grid.set("0,0", cell("你"));
      grid.set("1,0", cell("B"));
    });
    Y.applyUpdate(local, Y.encodeStateAsUpdate(remote));

    expect(Object.fromEntries(documents.getContentReader().materialize())).toEqual({
      "1,0": cell("B"),
    });
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
    expect(Object.fromEntries(readGrid(remote))).toEqual({ "1,0": cell("B") });
    documents.dispose();
  });

  it("converges independent cell edits", () => {
    const left = new Y.Doc();
    const right = new Y.Doc();
    mutateGrid(left, "left-a", (grid) => grid.set("0,0", cell("A")));
    mutateGrid(right, "right-b", (grid) => grid.set("1,0", cell("B")));

    const leftUpdate = Y.encodeStateAsUpdate(left);
    const rightUpdate = Y.encodeStateAsUpdate(right);
    Y.applyUpdate(left, rightUpdate);
    Y.applyUpdate(right, leftUpdate);

    const entries = (doc: Y.Doc) =>
      Array.from(readGrid(doc).entries()).sort(([a], [b]) => a.localeCompare(b));
    expect(entries(left)).toEqual(entries(right));
    expect(readGrid(left).size).toBe(2);
  });

  it("preserves hydrated remote content when the joining client makes its first edit", () => {
    const remote = new Y.Doc();
    mutateGrid(remote, "remote-seed", (grid) => {
      grid.set("0,0", cell("R"));
      grid.set("1,0", cell("S"));
    });

    const joining = new Y.Doc();
    Y.applyUpdate(joining, Y.encodeStateAsUpdate(remote));
    mutateGrid(joining, "joining-first", (grid) => grid.set("2,0", cell("L")));
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(joining));

    expect(Object.fromEntries(readGrid(remote))).toEqual({
      "0,0": cell("R"),
      "1,0": cell("S"),
      "2,0": cell("L"),
    });
  });

  it("converges after deterministic random offline edits and shuffled duplicate updates", () => {
    let seed = 0x5eed;
    const random = (max: number) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % max;
    };
    const docs = [new Y.Doc(), new Y.Doc(), new Y.Doc()];
    for (let index = 0; index < 120; index += 1) {
      const doc = docs[random(docs.length)];
      const key = `${random(12)},${random(8)}`;
      mutateGrid(doc, `random-${index}`, (grid) => {
        if (random(5) === 0) grid.delete(key);
        else grid.set(key, cell(String.fromCharCode(65 + random(26))));
      });
    }

    const updates = docs.map((doc) => Y.encodeStateAsUpdate(doc));
    const delivery = [...updates, updates[0], updates[2]].sort(() => random(3) - 1);
    docs.forEach((doc) => delivery.forEach((update) => Y.applyUpdate(doc, update)));

    const snapshots = docs.map((doc) => Object.fromEntries(readGrid(doc)));
    expect(snapshots[1]).toEqual(snapshots[0]);
    expect(snapshots[2]).toEqual(snapshots[0]);
  });

  it("keeps remote edits out of local undo history", () => {
    const id = `collaboration-undo-${crypto.randomUUID()}`;
    const documents = new CanvasDocumentRegistry(id);
    const local = documents.getCollaborationDocument(id)!;
    const remote = new Y.Doc();

    documents.mutateGrid((grid) => grid.set("0,0", cell("L")));
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
    mutateGrid(remote, "remote-r", (grid) => grid.set("1,0", cell("R")));
    Y.applyUpdate(local, Y.encodeStateAsUpdate(remote));

    documents.undo();
    expect(documents.getContentReader().getCell({ x: 0, y: 0 })).toBeUndefined();
    expect(documents.getContentReader().getCell({ x: 1, y: 0 })).toEqual(cell("R"));
    documents.dispose();
  });

  it("rolls back only local changes created after a history checkpoint", () => {
    const id = `interaction-cancel-${crypto.randomUUID()}`;
    const documents = new CanvasDocumentRegistry(id);
    const local = documents.getCollaborationDocument(id)!;
    const remote = new Y.Doc();

    documents.mutateGrid((grid) => grid.set("0,0", cell("B")));
    const checkpoint = documents.beginHistoryCheckpoint();
    documents.mutateGrid((grid) => grid.set("1,0", cell("L")), "merge");
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
    mutateGrid(remote, "remote-checkpoint", (grid) => grid.set("2,0", cell("R")));
    Y.applyUpdate(local, Y.encodeStateAsUpdate(remote));

    checkpoint.cancel();

    expect(documents.getContentReader().getCell({ x: 0, y: 0 })).toEqual(cell("B"));
    expect(documents.getContentReader().getCell({ x: 1, y: 0 })).toBeUndefined();
    expect(documents.getContentReader().getCell({ x: 2, y: 0 })).toEqual(cell("R"));
    expect(documents.getHistoryAvailability()).toEqual({
      canUndo: true,
      canRedo: false,
    });
    documents.dispose();
  });

  it("commits checkpoint changes as one undo step", () => {
    const id = `interaction-commit-${crypto.randomUUID()}`;
    const documents = new CanvasDocumentRegistry(id);
    const checkpoint = documents.beginHistoryCheckpoint();

    documents.mutateGrid((grid) => grid.set("0,0", cell("A")), "merge");
    documents.mutateGrid((grid) => grid.set("1,0", cell("B")), "merge");
    checkpoint.commit();

    expect(documents.undo()).toBe(true);
    expect(documents.getContentReader().materialize()).toEqual(new Map());
    expect(documents.undo()).toBe(false);
    documents.dispose();
  });

  it("reports undo and redo availability for the active document", () => {
    const id = `history-availability-${crypto.randomUUID()}`;
    const documents = new CanvasDocumentRegistry(id);

    expect(documents.getHistoryAvailability()).toEqual({
      canUndo: false,
      canRedo: false,
    });

    documents.mutateGrid((grid) => grid.set("0,0", cell("A")));
    expect(documents.getHistoryAvailability()).toEqual({
      canUndo: true,
      canRedo: false,
    });

    expect(documents.undo()).toBe(true);
    expect(documents.getHistoryAvailability()).toEqual({
      canUndo: false,
      canRedo: true,
    });

    expect(documents.redo()).toBe(true);
    expect(documents.getHistoryAvailability()).toEqual({
      canUndo: true,
      canRedo: false,
    });
    documents.dispose();
  });

});
