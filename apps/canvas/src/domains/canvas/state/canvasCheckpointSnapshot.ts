import {
  decodeStructuredNode,
  normalizeScene,
  sceneToGridEntries,
  type StructuredNode,
} from "@/domains/legacy-structured/public";
import type { CanvasMode } from "@/domains/sessions/public";
import {
  decodeCellPlaneOperationRows,
  encodeCellPlaneOperation,
  gridEntriesToCellPlaneOperation,
  isEncodedCellPlaneOperation,
  type EncodedCellPlaneOperation,
  type CellPlaneOperation,
} from "../cell-plane/model";
import {
  getCanvasDocumentRoot,
  readCanvasPageOrder,
  readCanvasYPage,
  type CanvasPageDescriptor,
} from "./canvasDocumentModel";
import type { CanvasCheckpointSource } from "./canvasCheckpointDocument";
import type * as Y from "yjs";

const SNAPSHOT_MAGIC = 0x32504343;
const OPERATION_BATCH_SIZE = 256;
const MAIN_THREAD_BUDGET_MS = 4;

type SnapshotOperation = {
  id: string;
  bounds: EncodedCellPlaneOperation["bounds"];
  offset: number;
  length: number;
};

type SnapshotPage = {
      kind: "cell-plane";
      descriptor: CanvasPageDescriptor;
      operations: SnapshotOperation[];
    };

type LegacySnapshotPage = {
      kind: "structured";
      descriptor: Omit<CanvasPageDescriptor, "kind"> & { kind: "structured" };
      scene: StructuredNode[];
      components?: unknown[];
    };

type SnapshotManifest = {
  documentId: string;
  mode: CanvasMode | "structured";
  activePageId: string;
  pages: Array<SnapshotPage | LegacySnapshotPage>;
};

type CapturedPage = {
      kind: "cell-plane";
      descriptor: CanvasPageDescriptor;
      operations: readonly CellPlaneOperation[];
    };

type EncodedCanvasCheckpointSnapshot = {
  buffer: ArrayBuffer;
  bytes: number;
  operationCount: number;
};

const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export const encodeCanvasCheckpointSnapshot = async (
  doc: Y.Doc,
  documentId: string
): Promise<EncodedCanvasCheckpointSnapshot> => {
  const root = getCanvasDocumentRoot(doc);
  const pageIds = readCanvasPageOrder(root);
  // Capture Yjs-owned collections before the first await. Encoding can then yield
  // without mixing authority states from different revisions.
  const capturedPages = pageIds.flatMap((pageId): CapturedPage[] => {
    const page = readCanvasYPage(root, pageId);
    if (!page) return [];
    return [{
      kind: "cell-plane",
      descriptor: page.descriptor,
      operations: page.operations.toArray(),
    }];
  });
  const storedMode = root.meta.get("mode");
  const storedActivePageId = root.meta.get("activePageId");
  const payloads: Uint8Array[] = [];
  const pages: SnapshotPage[] = [];
  let payloadBytes = 0;
  let operationCount = 0;
  let sliceStartedAt = performance.now();
  const yieldWhenNeeded = async () => {
    if (performance.now() - sliceStartedAt < MAIN_THREAD_BUDGET_MS) return;
    await yieldToMain();
    sliceStartedAt = performance.now();
  };
  for (const page of capturedPages) {
    const operations: SnapshotOperation[] = [];
    for (let index = 0; index < page.operations.length; index += OPERATION_BATCH_SIZE) {
      const batch = page.operations.slice(index, index + OPERATION_BATCH_SIZE);
      batch.forEach((operation) => {
        const encoded = isEncodedCellPlaneOperation(operation)
          ? operation
          : encodeCellPlaneOperation(
              operation.id,
              operation.bounds,
              decodeCellPlaneOperationRows(operation)
            );
        operations.push({
          id: encoded.id,
          bounds: encoded.bounds,
          offset: payloadBytes,
          length: encoded.payload.byteLength,
        });
        payloads.push(encoded.payload);
        payloadBytes += encoded.payload.byteLength;
        operationCount += 1;
      });
      await yieldWhenNeeded();
    }
    pages.push({ kind: "cell-plane", descriptor: page.descriptor, operations });
  }
  if (pages.length === 0) {
    throw new Error(`Canvas checkpoint snapshot has no pages: ${documentId}`);
  }
  const mode: CanvasMode =
    storedMode === "freeform" || storedMode === "slide"
      ? storedMode
      : "freeform";
  const manifest: SnapshotManifest = {
    documentId,
    mode,
    activePageId:
      typeof storedActivePageId === "string" &&
      pages.some(({ descriptor }) => descriptor.id === storedActivePageId)
        ? storedActivePageId
        : pages[0]!.descriptor.id,
    pages,
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  const buffer = new ArrayBuffer(8 + manifestBytes.byteLength + payloadBytes);
  const view = new DataView(buffer);
  view.setUint32(0, SNAPSHOT_MAGIC, true);
  view.setUint32(4, manifestBytes.byteLength, true);
  const output = new Uint8Array(buffer);
  output.set(manifestBytes, 8);
  let offset = 8 + manifestBytes.byteLength;
  for (let index = 0; index < payloads.length; index += OPERATION_BATCH_SIZE) {
    payloads.slice(index, index + OPERATION_BATCH_SIZE).forEach((payload) => {
      output.set(payload, offset);
      offset += payload.byteLength;
    });
    await yieldWhenNeeded();
  }
  return { buffer, bytes: buffer.byteLength, operationCount };
};

export const decodeCanvasCheckpointSnapshot = (
  buffer: ArrayBuffer
): { documentId: string; source: CanvasCheckpointSource } => {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== SNAPSHOT_MAGIC) {
    throw new Error("Unsupported Canvas checkpoint snapshot");
  }
  const manifestLength = view.getUint32(4, true);
  const payloadOffset = 8 + manifestLength;
  if (payloadOffset > buffer.byteLength) {
    throw new Error("Invalid Canvas checkpoint snapshot length");
  }
  const manifest = JSON.parse(new TextDecoder().decode(
    new Uint8Array(buffer, 8, manifestLength)
  )) as SnapshotManifest;
  const source: CanvasCheckpointSource = {
    mode: manifest.mode === "structured" ? "freeform" : manifest.mode,
    activePageId: manifest.activePageId,
    pages: manifest.pages.map((page): CanvasCheckpointSource["pages"][number] => {
      if (page.kind === "structured") {
        const scene = normalizeScene(
          page.scene
            .map(decodeStructuredNode)
            .filter((node): node is StructuredNode => node !== null)
        );
        const operation = gridEntriesToCellPlaneOperation(
          `legacy-checkpoint-flatten:${manifest.documentId}:${page.descriptor.id}`,
          sceneToGridEntries(scene)
        );
        return {
          descriptor: { ...page.descriptor, kind: "cell-plane" },
          operations: operation ? [operation] : [],
        };
      }
      return {
          descriptor: { ...page.descriptor, kind: "cell-plane" },
          operations: page.operations.map((operation): EncodedCellPlaneOperation => ({
            id: operation.id,
            bounds: operation.bounds,
            format: 2,
            payload: new Uint8Array(
              buffer,
              payloadOffset + operation.offset,
              operation.length
            ),
          })),
        };
    }),
  };
  return { documentId: manifest.documentId, source };
};
