import * as Y from "yjs";
import type { CanvasMode } from "@/domains/sessions/public";
import type { GridCell } from "@/shared/types";
import {
  gridEntriesToCellPlaneOperation,
  type CellPlaneOperation,
} from "../cell-plane/model";

export const CANVAS_DOCUMENT_SCHEMA_VERSION = 4;

export type CanvasDocumentAddress = {
  documentId: string;
  pageId: string;
};

type CanvasPageContentKind = "cell-plane";

export type CanvasPageDescriptor = {
  id: string;
  kind: CanvasPageContentKind;
  name?: string;
  size?: { columns: number; rows: number };
};

export type CanvasPageDraft = CanvasPageDescriptor & {
  grid?: [string, GridCell][];
};

export type CanvasDocumentDraft = {
  id: string;
  mode: CanvasMode;
  activePageId: string;
  pages: CanvasPageDraft[];
};

export type CanvasYPage = {
  descriptor: CanvasPageDescriptor;
  operations: Y.Array<CellPlaneOperation>;
};

export type CanvasYDocumentRoot = {
  doc: Y.Doc;
  meta: Y.Map<unknown>;
  pageOrder: Y.Array<string>;
  pages: Y.Map<unknown>;
};

const PAGE_OPERATIONS = "cell-plane-operations";

export const getDefaultCanvasPageId = (documentId: string) =>
  `${documentId}:page:main`;

export const getCanvasDocumentRoot = (doc: Y.Doc): CanvasYDocumentRoot => ({
  doc,
  meta: doc.getMap("document-meta"),
  pageOrder: doc.getArray("document-page-order"),
  pages: doc.getMap("document-pages"),
});

const readStoredField = (value: unknown, key: string): unknown => {
  if (value instanceof Y.Map) return value.get(key);
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
};

export const readCanvasPageDescriptor = (
  fallbackId: string,
  value: unknown
): CanvasPageDescriptor | null => {
  if (!value || typeof value !== "object") return null;
  const id = readStoredField(value, "id");
  const kind = readStoredField(value, "kind");
  if (
    typeof id !== "string" ||
    id !== fallbackId ||
    kind !== "cell-plane"
  ) {
    return null;
  }
  const descriptor: CanvasPageDescriptor = { id, kind };
  const name = readStoredField(value, "name");
  if (typeof name === "string") descriptor.name = name;
  const size = readStoredField(value, "size");
  const columns = readStoredField(size, "columns");
  const rows = readStoredField(size, "rows");
  if (
    Number.isSafeInteger(columns) &&
    Number.isSafeInteger(rows) &&
    Number(columns) > 0 &&
    Number(rows) > 0
  ) {
    descriptor.size = { columns: Number(columns), rows: Number(rows) };
  }
  return descriptor;
};

export const readCanvasYPage = (
  root: CanvasYDocumentRoot,
  pageId: string
): CanvasYPage | null => {
  const descriptor = readCanvasPageDescriptor(pageId, root.pages.get(pageId));
  if (!descriptor) return null;
  const prefix = `canvas-page:${encodeURIComponent(pageId)}:`;
  return {
    descriptor,
    operations: root.doc.getArray<CellPlaneOperation>(prefix + PAGE_OPERATIONS),
  };
};

export const createCanvasYPage = (
  root: CanvasYDocumentRoot,
  draft: CanvasPageDraft,
  operationId: string
): CanvasYPage => {
  root.pages.set(draft.id, {
    id: draft.id,
    kind: draft.kind,
    ...(draft.name ? { name: draft.name } : {}),
    ...(draft.size ? { size: draft.size } : {}),
  });
  const page = readCanvasYPage(root, draft.id);
  if (!page) throw new Error(`Failed to create Canvas page: ${draft.id}`);
  const bootstrap = gridEntriesToCellPlaneOperation(
    operationId,
    draft.grid ?? []
  );
  if (bootstrap) page.operations.push([bootstrap]);
  if (!root.pageOrder.toArray().includes(draft.id)) {
    root.pageOrder.push([draft.id]);
  }
  return page;
};

export const readCanvasPageOrder = (root: CanvasYDocumentRoot) => {
  const existing = new Set(root.pages.keys());
  const ordered = root.pageOrder
    .toArray()
    .filter((id, index, values) => existing.has(id) && values.indexOf(id) === index);
  for (const id of existing) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
};

export const writeCanvasDocumentMetadata = (
  root: CanvasYDocumentRoot,
  documentId: string,
  mode: CanvasMode,
  activePageId: string
) => {
  root.meta.set("schemaVersion", CANVAS_DOCUMENT_SCHEMA_VERSION);
  root.meta.set("documentId", documentId);
  root.meta.set("mode", mode);
  root.meta.set("activePageId", activePageId);
};
