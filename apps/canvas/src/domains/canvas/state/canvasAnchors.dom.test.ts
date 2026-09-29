import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { CanvasDocumentRegistry } from "./CanvasDocumentRegistry";
import { createCompactedDocument, readDocumentSeed } from "./canvasCheckpointDocument";
import { decodeCanvasCheckpointSnapshot, encodeCanvasCheckpointSnapshot } from "./canvasCheckpointSnapshot";
import { createStaticGridRangeMovePlan } from "../cell-plane/rangeMove";
import { createCanvasYPage, getCanvasDocumentRoot, readCanvasYPage, writeCanvasDocumentMetadata } from "./canvasDocumentModel";
import { applyCanvasMutationEnvelopeToDocument } from "./applyCanvasMutationEnvelope";
import type { CanvasMutationEnvelope } from "./canvasMutationEnvelope";
import {
  getCanvasAnchorBranchIds,
  moveCanvasAnchor,
  orderCanvasAnchors,
  readCanvasAnchor,
  readCanvasAnchorLabel,
} from "./canvasAnchorModel";

const cell = (char: string) => ({ char, color: "#000000" });

describe("Canvas coordinate anchors", () => {
  it("commits pasted heading anchors and cells as one undoable operation", () => {
    const documents = new CanvasDocumentRegistry("markdown-paste-anchors");
    const address = documents.getActiveAddress();
    const headings = [
      { point: { x: 5, y: 6 }, label: "# Root", level: 1 },
      { point: { x: 5, y: 8 }, label: "## Child", level: 2 },
      { point: { x: 5, y: 10 }, label: "### Leaf", level: 3 },
    ];
    documents.applyCellPlanePatchAt(address, {
      rows: headings.map(({ point, label }) => ({
        y: point.y,
        erase: [],
        spans: [{ x: point.x, text: label, color: "#ffffff" }],
      })),
    }, "save", undefined, headings);

    const anchors = documents.getAnchorsAt(address);
    expect(anchors.map(({ label, parentId }) => [label, parentId])).toEqual([
      ["# Root", null],
      ["## Child", anchors[0]?.id],
      ["### Leaf", anchors[1]?.id],
    ]);
    expect(documents.getContentReader().getCell({ x: 5, y: 6 })?.char).toBe("#");

    expect(documents.undo()).toBe(true);
    expect(documents.getAnchorsAt(address)).toHaveLength(0);
    expect(documents.getContentReader().getCell({ x: 5, y: 6 })).toBeUndefined();
    expect(documents.redo()).toBe(true);
    expect(documents.getAnchorsAt(address).map(({ label }) => label))
      .toEqual(["# Root", "## Child", "### Leaf"]);
    documents.dispose();
  });
  it("reads old flat anchors and deterministically promotes invalid parents", () => {
    const base = { point: { x: 0, y: 0 }, label: "A", detached: false };
    const legacy = readCanvasAnchor({ ...base, id: "old", order: 0 })!;
    expect(legacy.parentId).toBeNull();
    const anchors = orderCanvasAnchors([
      legacy,
      { ...base, id: "missing", order: 1, parentId: "unknown" },
      { ...base, id: "cycle-a", order: 2, parentId: "cycle-b" },
      { ...base, id: "cycle-b", order: 3, parentId: "cycle-a" },
    ]);
    expect(anchors.map((anchor) => anchor.parentId)).toEqual([null, null, null, null]);
  });

  it("moves a whole branch, limits depth, and deletes descendants in one undo step", () => {
    const documents = new CanvasDocumentRegistry("anchor-tree");
    const address = documents.getActiveAddress();
    documents.mutateGrid((grid) => {
      ["A", "B", "C", "D"].forEach((char, y) => grid.set(`0,${y}`, cell(char)));
    });
    const [a, b, c, d] = [0, 1, 2, 3].map((y) =>
      documents.addAnchorAt(address, { x: 0, y })!
    );
    expect(documents.moveAnchorAt(address, b.id, a.id, 0)).toBe(true);
    expect(documents.moveAnchorAt(address, c.id, b.id, 0)).toBe(true);
    expect(documents.moveAnchorAt(address, a.id, c.id, 0)).toBe(false);
    expect(documents.moveAnchorAt(address, d.id, c.id, 0)).toBe(false);
    expect(moveCanvasAnchor(documents.getAnchorsAt(address), a.id, c.id, 0)).toBeNull();
    expect(getCanvasAnchorBranchIds(documents.getAnchorsAt(address), a.id)).toEqual([
      a.id, b.id, c.id,
    ]);
    expect(documents.moveAnchorAt(address, a.id, null, 1)).toBe(true);
    expect(documents.getAnchorsAt(address).map((anchor) => anchor.id)).toEqual([
      d.id, a.id, b.id, c.id,
    ]);
    expect(documents.removeAnchorAt(address, a.id)).toBe(true);
    expect(documents.getAnchorsAt(address).map((anchor) => anchor.id)).toEqual([d.id]);
    expect(documents.undo()).toBe(true);
    expect(documents.getAnchorsAt(address).map((anchor) => anchor.id)).toEqual([
      d.id, a.id, b.id, c.id,
    ]);
    documents.dispose();
  });
  it("keeps a literal label until its source cell is deleted, then restores it with undo", () => {
    const documents = new CanvasDocumentRegistry("anchors");
    const address = documents.getActiveAddress();
    documents.mutateGrid((grid) => {
      "# First".split("").forEach((char, x) => grid.set(`${x},0`, cell(char)));
      "Second".split("").forEach((char, x) => grid.set(`${x},3`, cell(char)));
    });

    const first = documents.addAnchorAt(address, { x: 0, y: 0 })!;
    const second = documents.addAnchorAt(address, { x: 0, y: 3 })!;
    expect(first.label).toBe("# First");
    expect(documents.addAnchorAt(address, { x: 0, y: 0 })?.id).toBe(first.id);
    expect(documents.moveAnchorAt(address, second.id, null, 0)).toBe(true);
    expect(documents.getAnchorsAt(address).map((anchor) => anchor.id)).toEqual([second.id, first.id]);

    documents.mutateGrid((grid) => grid.set("2,0", cell("X")));
    expect(documents.getAnchorsAt(address).find((anchor) => anchor.id === first.id)?.label).toBe("# First");

    documents.mutateGrid((grid) => grid.delete("0,0"));
    expect(documents.getAnchorsAt(address).map((anchor) => anchor.id)).toEqual([second.id]);
    expect(documents.undo()).toBe(true);
    expect(documents.getAnchorsAt(address).find((anchor) => anchor.id === first.id)?.label).toBe("# First");
    expect(documents.getContentReader().getCell({ x: 0, y: 0 })?.char).toBe("#");
    expect(documents.redo()).toBe(true);
    expect(documents.getAnchorsAt(address).map((anchor) => anchor.id)).toEqual([second.id]);
    documents.mutateGrid((grid) => grid.set("0,0", cell("#")));
    expect(documents.reattachAnchorAt(address, first.id, { x: 0, y: 3 })).toBe(false);
    documents.dispose();
  });

  it("promotes surviving descendants at the removed branch's position", () => {
    const documents = new CanvasDocumentRegistry("promote-anchors");
    const address = documents.getActiveAddress();
    documents.mutateGrid((grid) => {
      ["A", "B", "C", "D", "E"].forEach((char, y) => grid.set(`0,${y}`, cell(char)));
    });
    const [a, b, c, d, e] = [0, 1, 2, 3, 4].map((y) =>
      documents.addAnchorAt(address, { x: 0, y })!
    );
    expect(documents.moveAnchorAt(address, b.id, a.id, 0)).toBe(true);
    expect(documents.moveAnchorAt(address, c.id, b.id, 0)).toBe(true);
    expect(documents.moveAnchorAt(address, d.id, a.id, 1)).toBe(true);

    documents.mutateGrid((grid) => {
      grid.delete("0,0");
      grid.delete("0,1");
    });
    expect(documents.getAnchorsAt(address).map(({ id, parentId }) => [id, parentId])).toEqual([
      [c.id, null], [d.id, null], [e.id, null],
    ]);
    expect(documents.undo()).toBe(true);
    expect(documents.getAnchorsAt(address).map(({ id, parentId }) => [id, parentId])).toEqual([
      [a.id, null], [b.id, a.id], [c.id, b.id], [d.id, a.id], [e.id, null],
    ]);
    documents.dispose();
  });

  it("cleans legacy empty detached anchors on restore but keeps occupied conflicts", () => {
    const legacy = new Y.Doc({ guid: "legacy-anchors" });
    const root = getCanvasDocumentRoot(legacy);
    const old = { id: "old", point: { x: 0, y: 0 }, label: "Old", order: 0,
      parentId: null, detached: true };
    const child = { id: "child", point: { x: 0, y: 1 }, label: "Child", order: 1,
      parentId: old.id, detached: false };
    const conflict = { id: "conflict", point: { x: 0, y: 2 }, label: "Conflict", order: 2,
      parentId: null, detached: true };
    legacy.transact(() => {
      createCanvasYPage(root, {
        id: "page", kind: "cell-plane",
        grid: [["0,1", cell("C")], ["0,2", cell("X")]],
        anchors: [old, child, conflict],
      }, "legacy-test");
      writeCanvasDocumentMetadata(root, "legacy-anchors", "freeform", "page");
    });
    const documents = new CanvasDocumentRegistry();
    documents.adoptDocument("legacy-anchors", legacy);
    const anchors = documents.getAnchorsAt({ documentId: "legacy-anchors", pageId: "page" });
    expect(anchors.map(({ id, parentId, detached }) => [id, parentId, detached])).toEqual([
      [child.id, null, false], [conflict.id, null, true],
    ]);
    documents.registerDocument("imported-anchors", {
      grid: [],
      pages: [{ id: "page", kind: "cell-plane",
        grid: [["0,1", cell("C")], ["0,2", cell("X")]],
        anchors: [old, child, conflict] }],
    });
    expect(documents.getAnchorsAt({ documentId: "imported-anchors", pageId: "page" })
      .map(({ id, parentId }) => [id, parentId])).toEqual([
      [child.id, null], [conflict.id, null],
    ]);
    documents.dispose();
  });

  it("renames only the anchor label and restores it with undo", () => {
    const documents = new CanvasDocumentRegistry("rename-anchor");
    const address = documents.getActiveAddress();
    documents.mutateGrid((grid) => grid.set("0,0", cell("A")));
    const anchor = documents.addAnchorAt(address, { x: 0, y: 0 })!;
    expect(documents.renameAnchorAt(address, anchor.id, "  New title  ")).toBe(true);
    expect(documents.getAnchorsAt(address)[0]).toMatchObject({
      id: anchor.id, label: "New title", point: anchor.point,
    });
    expect(documents.getContentReader().getCell({ x: 0, y: 0 })?.char).toBe("A");
    expect(documents.renameAnchorAt(address, anchor.id, "   ")).toBe(false);
    expect(documents.renameAnchorAt(address, "missing", "Other")).toBe(false);
    expect(documents.undo()).toBe(true);
    expect(documents.getAnchorsAt(address)[0]?.label).toBe("A");
    documents.dispose();
  });

  it("reads full-width characters without dropping the literal heading marker", () => {
    const grid = new Map([
      ["0,0", cell("#")], ["1,0", cell(" ")],
      ["2,0", cell("什")], ["4,0", cell("么")],
      ["6,0", cell("是")], ["8,0", cell("哲")], ["10,0", cell("学")],
    ]);
    expect(readCanvasAnchorLabel({ get: ({ x, y }) => grid.get(`${x},${y}`) }, { x: 0, y: 0 }))
      .toBe("# 什么是哲学");
  });

  it("moves the anchor with its selected cell and undoes content and point together", () => {
    const documents = new CanvasDocumentRegistry("moving");
    const address = documents.getActiveAddress();
    documents.mutateGrid((grid) => grid.set("0,0", cell("A")));
    const anchor = documents.addAnchorAt(address, { x: 0, y: 0 })!;
    const source = documents.getContentReader();
    const plan = createStaticGridRangeMovePlan({
      source,
      range: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
      requestedDelta: { x: 5, y: 2 },
    })!;
    documents.applyCellPlanePatchAt(address, plan.patch, "save", {
      ids: [anchor.id], delta: plan.delta,
    });
    expect(documents.getAnchorsAt(address)[0]?.point).toEqual({ x: 5, y: 2 });
    expect(documents.getContentReader().getCell({ x: 5, y: 2 })?.char).toBe("A");
    expect(documents.undo()).toBe(true);
    expect(documents.getAnchorsAt(address)[0]?.point).toEqual({ x: 0, y: 0 });
    expect(documents.getContentReader().getCell({ x: 0, y: 0 })?.char).toBe("A");
    expect(documents.redo()).toBe(true);
    expect(documents.getAnchorsAt(address)[0]?.point).toEqual({ x: 5, y: 2 });
    documents.dispose();
  });

  it("does not duplicate an anchor on copy and detaches a destination anchor overwritten by a move", () => {
    const documents = new CanvasDocumentRegistry("move-collision");
    const address = documents.getActiveAddress();
    documents.mutateGrid((grid) => {
      grid.set("0,0", cell("A"));
      grid.set("5,0", cell("B"));
    });
    const sourceAnchor = documents.addAnchorAt(address, { x: 0, y: 0 })!;
    const destinationAnchor = documents.addAnchorAt(address, { x: 5, y: 0 })!;
    documents.mutateGrid((grid) => grid.set("10,0", cell("A")));
    expect(documents.getAnchorsAt(address)).toHaveLength(2);

    const plan = createStaticGridRangeMovePlan({
      source: documents.getContentReader(),
      range: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
      requestedDelta: { x: 5, y: 0 },
    })!;
    documents.applyCellPlanePatchAt(address, plan.patch, "save", {
      ids: [sourceAnchor.id], overwrittenIds: [destinationAnchor.id], delta: plan.delta,
    });
    expect(documents.getAnchorsAt(address).find((anchor) => anchor.id === sourceAnchor.id))
      .toMatchObject({ point: { x: 5, y: 0 }, detached: false });
    expect(documents.getAnchorsAt(address).find((anchor) => anchor.id === destinationAnchor.id)?.detached)
      .toBe(true);
    documents.undo();
    expect(documents.getAnchorsAt(address).find((anchor) => anchor.id === destinationAnchor.id)?.detached)
      .toBe(false);
    documents.dispose();
  });

  it("replays anchor-only and combined content mutations through a checkpoint tail", () => {
    const documents = new CanvasDocumentRegistry("tail-anchors");
    const address = documents.getActiveAddress();
    const baseline = new Y.Doc();
    Y.applyUpdate(baseline, Y.encodeStateAsUpdate(documents.getCollaborationDocument(address.documentId)!));
    const envelopes: CanvasMutationEnvelope[] = [];
    const stop = documents.subscribeMutations((envelope) => envelopes.push(envelope));

    documents.mutateGrid((grid) => {
      grid.set("0,0", cell("A"));
      grid.set("0,1", cell("B"));
    });
    const anchor = documents.addAnchorAt(address, { x: 0, y: 0 })!;
    const child = documents.addAnchorAt(address, { x: 0, y: 1 })!;
    expect(documents.moveAnchorAt(address, child.id, anchor.id, 0)).toBe(true);
    documents.mutateGrid((grid) => grid.delete("0,0"));
    envelopes.forEach((envelope) => applyCanvasMutationEnvelopeToDocument(baseline, envelope));

    const replayed = readCanvasYPage(getCanvasDocumentRoot(baseline), address.pageId);
    expect(replayed?.anchors.has(anchor.id)).toBe(false);
    expect(replayed?.anchors.get(child.id)?.parentId).toBeNull();
    stop();
    baseline.destroy();
    documents.dispose();
  });

  it("preserves anchors through compaction and snapshot decoding", async () => {
    const documents = new CanvasDocumentRegistry("checkpoint-anchors");
    const address = documents.getActiveAddress();
    documents.mutateGrid((grid) => {
      grid.set("0,0", cell("A"));
      grid.set("0,1", cell("B"));
    });
    const anchor = documents.addAnchorAt(address, { x: 0, y: 0 })!;
    const child = documents.addAnchorAt(address, { x: 0, y: 1 })!;
    expect(documents.moveAnchorAt(address, child.id, anchor.id, 0)).toBe(true);
    const expected = documents.getAnchorsAt(address);
    const doc = documents.getCollaborationDocument(address.documentId)!;

    const compacted = createCompactedDocument(doc, address.documentId);
    expect(readDocumentSeed(compacted, address.documentId).pages?.[0]?.anchors).toEqual(expected);
    const encoded = await encodeCanvasCheckpointSnapshot(doc, address.documentId);
    const decoded = decodeCanvasCheckpointSnapshot(encoded.buffer);
    expect(decoded.source.pages[0]?.anchors).toEqual(expected);

    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    const remotePage = readCanvasYPage(getCanvasDocumentRoot(remote), address.pageId);
    expect(remotePage?.anchors.get(child.id)?.parentId).toBe(anchor.id);
    remote.destroy();
    compacted.destroy();
    documents.dispose();
  });
});
