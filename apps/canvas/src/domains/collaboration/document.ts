import type * as Y from "yjs";
import type { CollaborationDescriptor } from "./model";

const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

export const getCollaborationPersistenceName = async (
  descriptor: CollaborationDescriptor
) => {
  const identity = JSON.stringify({
    provider: descriptor.provider,
    endpoint: descriptor.endpoint,
    roomId: descriptor.roomId,
    key: descriptor.key,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity)
  );
  const namespace = `chardesk-room-v${descriptor.version}`;
  return `${namespace}:${toBase64Url(new Uint8Array(digest))}`;
};

export const getCollaborationRoomName = (descriptor: CollaborationDescriptor) => {
  const namespace = `chardesk-v${descriptor.version}`;
  return descriptor.version === 6
    ? `${namespace}-${descriptor.roomId}-${descriptor.key}`
    : `${namespace}-${descriptor.roomId}`;
};

type CollaborationDocumentMigration = {
  id: string;
  from: number;
  to: number;
  migrate: (doc: Y.Doc) => void;
};

// V2 is the migration baseline. Future migrations are appended with stable ids.
const DOCUMENT_MIGRATIONS: ReadonlyArray<CollaborationDocumentMigration> = [];

export const ensureCollaborationDocumentMeta = (
  descriptor: CollaborationDescriptor,
  doc: Y.Doc
) => {
  const meta = doc.getMap<unknown>("document-meta");
  const roomId = meta.get("roomId");
  const documentVersion = meta.get("documentVersion");
  if (roomId === undefined && documentVersion === undefined) {
    const mode = meta.get("mode");
    if (mode !== undefined && mode !== descriptor.mode) {
      throw new Error("Incompatible collaboration document");
    }
    doc.transact(() => {
      meta.set("documentVersion", descriptor.documentVersion);
      meta.set("mode", descriptor.mode);
      meta.set("roomId", descriptor.roomId);
    }, "collaboration-meta");
    return;
  }
  if (meta.get("mode") !== descriptor.mode || meta.get("roomId") !== descriptor.roomId) {
    throw new Error("Incompatible collaboration document");
  }
  const version = documentVersion;
  if (version === descriptor.documentVersion) return;
  if (typeof version !== "number" || version > descriptor.documentVersion) {
    throw new Error("Incompatible collaboration document");
  }
  let nextVersion = version;
  while (nextVersion < descriptor.documentVersion) {
    const migration = DOCUMENT_MIGRATIONS.find((candidate) => candidate.from === nextVersion);
    if (!migration || migration.to <= nextVersion) {
      throw new Error("Incompatible collaboration document");
    }
    doc.transact(() => {
      migration.migrate(doc);
      meta.set("documentVersion", migration.to);
      meta.set("lastMigration", migration.id);
    }, "collaboration-migration");
    nextVersion = migration.to;
  }
};
