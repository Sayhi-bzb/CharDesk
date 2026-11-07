import type { CanvasMode } from './contracts.js';
import type { CellPlaneOperation } from '@chardesk/cell-plane';
import type { CanvasAnchorChange } from './canvasAnchorModel.js';
import type { CanvasPageDescriptor, CanvasPageDraft } from './canvasDocumentModel.js';

/** Semantic mutation data; it deliberately contains no Yjs item identifiers. */
export type CanvasMutationEnvelope =
  | {
      kind: 'anchors';
      documentId: string;
      pageId: string;
      changes: readonly CanvasAnchorChange[];
      operation?: CellPlaneOperation;
    }
  | {
      kind: 'cell-plane';
      documentId: string;
      pageId: string;
      operation: CellPlaneOperation;
    }
  | {
      kind: 'page-metadata';
      documentId: string;
      page: CanvasPageDescriptor;
    }
  | {
      kind: 'page-order';
      documentId: string;
      pageIds: readonly string[];
      activePageId: string;
      mode: CanvasMode;
    }
  | {
      kind: 'page-upsert';
      documentId: string;
      page: CanvasPageDraft;
    }
  | {
      kind: 'page-delete';
      documentId: string;
      pageId: string;
    };
