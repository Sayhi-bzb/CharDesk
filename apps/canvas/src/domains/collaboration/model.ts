export const COLLABORATION_DOCUMENT_VERSION = 6 as const;

export type CollaborationCanvasMode = "freeform";

export type CollaborationDescriptorV6 = {
  version: 6;
  documentVersion: 6;
  mode: CollaborationCanvasMode;
  provider: "websocket";
  roomId: string;
  key: string;
  endpoint: string;
};

export type CollaborationDescriptorV7 = {
  version: 7;
  documentVersion: 6;
  mode: CollaborationCanvasMode;
  provider: "encrypted-relay";
  roomId: string;
  key: string;
  endpoint?: string;
};

export type CollaborationDescriptor =
  | CollaborationDescriptorV6
  | CollaborationDescriptorV7;

export type CollaborationLinkParseResult =
  | { status: "none" }
  | { status: "valid"; descriptor: CollaborationDescriptor }
  | { status: "retired"; provider: "p2p" | "structured" }
  | { status: "unsupported"; version: number | null }
  | { status: "invalid" };

type CollaborationDocumentStatus =
  | "idle"
  | "restoring"
  | "joining"
  | "ready"
  | "incompatible"
  | "error";

type CollaborationConnectionStatus =
  | "idle"
  | "connecting"
  | "online"
  | "offline";

type CollaborationErrorKind =
  | "persistence"
  | "incompatible-document"
  | "provider"
  | "invalid-remote-data";

export type CollaborationIntegrityIssue = {
  channel:
    | "cell-plane-operations"
    | "presence";
  key: string;
  pageId?: string;
  reason: string;
};

export type CollaborationPresenceSelection = {
      mode: "freeform";
      areas: Array<{
        start: { x: number; y: number };
        end: { x: number; y: number };
      }>;
    };

export type CollaborationPresenceV1 = {
  version: 1;
  mode: CollaborationCanvasMode;
  role?: "host" | "guest";
  documentReady?: boolean;
  user: {
    id: string;
    name: string;
    color: string;
  };
  cursor?: { x: number; y: number } | null;
  selection?: CollaborationPresenceSelection;
  tool?: string;
};

export type CollaborationPeer = {
  clientId: number;
  id: string;
  name: string;
  color: string;
  role?: "host" | "guest";
  documentReady?: boolean;
  cursor?: { x: number; y: number } | null;
  selection?: CollaborationPresenceSelection;
};

export type CollaborationSnapshot = {
  descriptor: CollaborationDescriptor | null;
  documentStatus: CollaborationDocumentStatus;
  connectionStatus: CollaborationConnectionStatus;
  canEdit: boolean;
  peers: CollaborationPeer[];
  error: string | null;
  errorKind: CollaborationErrorKind | null;
  hasLocalCopy: boolean;
  integrityIssues: CollaborationIntegrityIssue[];
};
