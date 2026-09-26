import type { CanvasMode } from "@/domains/sessions/public";
import type { CellPlaneOperation } from "../cell-plane/model";
import type {
  CanvasPageDescriptor,
  CanvasPageDraft,
} from "./canvasDocumentModel";

/** Semantic mutation data; it deliberately contains no Yjs item identifiers. */
export type CanvasMutationEnvelope =
  | {
      kind: "cell-plane";
      documentId: string;
      pageId: string;
      operation: CellPlaneOperation;
    }
  | {
      kind: "page-metadata";
      documentId: string;
      page: CanvasPageDescriptor;
    }
  | {
      kind: "page-order";
      documentId: string;
      pageIds: readonly string[];
      activePageId: string;
      mode: CanvasMode;
    }
  | {
      kind: "page-upsert";
      documentId: string;
      page: CanvasPageDraft;
    }
  | {
      kind: "page-delete";
      documentId: string;
      pageId: string;
    };
