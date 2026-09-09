import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { CellPlaneIndex } from "../cell-plane/model";
import {
  applyCanvasDocumentSeed,
  materializeCanvasCheckpointSource,
} from "./canvasCheckpointDocument";
import {
  decodeCanvasCheckpointSnapshot,
  encodeCanvasCheckpointSnapshot,
} from "./canvasCheckpointSnapshot";

describe("Canvas checkpoint snapshot", () => {
  it("round-trips CellPlane pages through compact binary", async () => {
    const doc = new Y.Doc({ guid: "snapshot-document" });
    applyCanvasDocumentSeed(doc, "snapshot-document", {
      mode: "slide",
      activePageId: "page-a",
      pages: [
        {
          id: "page-a",
          kind: "cell-plane",
          grid: [["0,0", { char: "A", color: "#111111" }]],
        },
        {
          id: "page-b",
          kind: "cell-plane",
          grid: [["1,0", { char: "界", color: "#223344" }]],
        },
      ],
      grid: [],
    });

    const encoded = await encodeCanvasCheckpointSnapshot(doc, "snapshot-document");
    const decoded = decodeCanvasCheckpointSnapshot(encoded.buffer);
    const seed = materializeCanvasCheckpointSource(decoded.source);

    expect(decoded.documentId).toBe("snapshot-document");
    expect(encoded.operationCount).toBe(2);
    expect(seed.pages).toHaveLength(2);
    const operations = "operations" in decoded.source.pages[1]!
      ? decoded.source.pages[1].operations
      : [];
    const index = new CellPlaneIndex(operations);
    expect(index.getCell({ x: 1, y: 0 })?.char).toBe("界");
    index.dispose();
    doc.destroy();
  });
});
