import {
  COLLABORATION_DOCUMENT_VERSION,
  type CollaborationCanvasMode,
  type CollaborationDescriptor,
  type CollaborationDescriptorV7,
  type CollaborationLinkParseResult,
} from "./model";

const ROOM_PARAM = "room";
const COMPACT_ROOM_PARAM = "r";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;
const V7_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MANAGED_COLLABORATION_ENDPOINT = "wss://sync.chardesk.com";
const COMPACT_LINK_LENGTH = 66;
const COMPACT_LINK_FREEFORM_HEADER = 0x10;
const COMPACT_LINK_STRUCTURED_HEADER = 0x11;
const ROOM_ID_BYTES = 16;
const ROOM_KEY_BYTES = 32;

const encodeBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const decodeBase64Url = (encoded: string) => {
  if (!TOKEN_PATTERN.test(encoded)) throw new Error("Invalid base64url token");
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  if (encodeBase64Url(bytes) !== encoded) throw new Error("Non-canonical base64url token");
  return bytes;
};

const randomToken = (byteLength: number) => {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return encodeBase64Url(bytes);
};

export const validateCollaborationEndpoint = (value: string) => {
  try {
    const endpoint = new URL(value);
    const isLocal = endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1" || endpoint.hostname === "[::1]";
    if (endpoint.protocol !== "wss:" && !(endpoint.protocol === "ws:" && isLocal)) {
      return null;
    }
    endpoint.hash = "";
    endpoint.search = "";
    return endpoint.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
};

export const createCollaborationDescriptor = (
  mode: CollaborationCanvasMode,
  endpoint?: string
): CollaborationDescriptorV7 => {
  const roomId = randomToken(16);
  const key = randomToken(32);
  const normalizedEndpoint = endpoint
    ? validateCollaborationEndpoint(endpoint)
    : undefined;
  if (endpoint && !normalizedEndpoint) throw new Error("Invalid collaboration endpoint");
  return {
    version: 7,
    documentVersion: COLLABORATION_DOCUMENT_VERSION,
    mode,
    provider: "encrypted-relay",
    roomId,
    key,
    ...(normalizedEndpoint ? { endpoint: normalizedEndpoint } : {}),
  };
};

export const isCollaborationDescriptor = (
  value: unknown
): value is CollaborationDescriptor => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (
    (candidate.version !== 6 && candidate.version !== 7) ||
    candidate.documentVersion !== COLLABORATION_DOCUMENT_VERSION ||
    candidate.mode !== "freeform" ||
    (candidate.version === 6
      ? candidate.provider !== "websocket"
      : candidate.provider !== "encrypted-relay") ||
    typeof candidate.roomId !== "string" ||
    candidate.roomId.length < 16 ||
    !TOKEN_PATTERN.test(candidate.roomId) ||
    typeof candidate.key !== "string" ||
    (candidate.version === 7
      ? !V7_KEY_PATTERN.test(candidate.key)
      : candidate.key.length < 40 || !TOKEN_PATTERN.test(candidate.key))
  ) return false;
  if (candidate.version === 6) {
    return typeof candidate.endpoint === "string" &&
      validateCollaborationEndpoint(candidate.endpoint) === candidate.endpoint;
  }
  return candidate.endpoint === undefined ||
    (typeof candidate.endpoint === "string" &&
      validateCollaborationEndpoint(candidate.endpoint) === candidate.endpoint);
};

export const getManagedCollaborationEndpoint = () => {
  const configured = import.meta.env.VITE_COLLABORATION_ENDPOINT?.trim();
  if (configured) return validateCollaborationEndpoint(configured);
  return import.meta.env.DEV
    ? "ws://127.0.0.1:1234"
    : MANAGED_COLLABORATION_ENDPOINT;
};

export const resolveCollaborationEndpoint = (
  descriptor: CollaborationDescriptor
) => descriptor.endpoint ?? getManagedCollaborationEndpoint();

export const getCollaborationDocumentId = (
  descriptor: Pick<CollaborationDescriptor, "roomId">
) => `collaboration:${descriptor.roomId}`;

const encodeDescriptor = (descriptor: CollaborationDescriptor) => {
  const bytes = new TextEncoder().encode(JSON.stringify(descriptor));
  return encodeBase64Url(bytes);
};

const decodeDescriptor = (encoded: string): unknown => {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded)));
};

const encodeCompactDescriptor = (descriptor: CollaborationDescriptorV7) => {
  if (descriptor.endpoint) return null;
  try {
    const roomId = decodeBase64Url(descriptor.roomId);
    const key = decodeBase64Url(descriptor.key);
    if (roomId.length !== ROOM_ID_BYTES || key.length !== ROOM_KEY_BYTES) return null;
    const bytes = new Uint8Array(1 + ROOM_ID_BYTES + ROOM_KEY_BYTES);
    bytes[0] = COMPACT_LINK_FREEFORM_HEADER;
    bytes.set(roomId, 1);
    bytes.set(key, 1 + ROOM_ID_BYTES);
    return encodeBase64Url(bytes);
  } catch {
    return null;
  }
};

const decodeCompactDescriptor = (encoded: string): CollaborationDescriptorV7 | "retired-structured" => {
  if (encoded.length !== COMPACT_LINK_LENGTH) throw new Error("Invalid compact link length");
  const bytes = decodeBase64Url(encoded);
  if (bytes.length !== 1 + ROOM_ID_BYTES + ROOM_KEY_BYTES) {
    throw new Error("Unsupported compact link format");
  }
  if (bytes[0] === COMPACT_LINK_STRUCTURED_HEADER) return "retired-structured";
  if (bytes[0] !== COMPACT_LINK_FREEFORM_HEADER) {
    throw new Error("Unsupported compact link format");
  }
  return {
    version: 7,
    documentVersion: COLLABORATION_DOCUMENT_VERSION,
    mode: "freeform",
    provider: "encrypted-relay",
    roomId: encodeBase64Url(bytes.slice(1, 1 + ROOM_ID_BYTES)),
    key: encodeBase64Url(bytes.slice(1 + ROOM_ID_BYTES)),
  };
};

export const buildCollaborationUrl = (
  descriptor: CollaborationDescriptor,
  baseUrl = window.location.href
) => {
  const url = new URL(baseUrl);
  url.searchParams.delete(ROOM_PARAM);
  url.searchParams.delete(COMPACT_ROOM_PARAM);
  const hash = new URLSearchParams(url.hash.slice(1));
  hash.delete(ROOM_PARAM);
  hash.delete(COMPACT_ROOM_PARAM);
  const compact = descriptor.version === 7
    ? encodeCompactDescriptor(descriptor)
    : null;
  hash.set(
    compact ? COMPACT_ROOM_PARAM : ROOM_PARAM,
    compact ?? encodeDescriptor(descriptor)
  );
  url.hash = hash.toString();
  return url.toString();
};

export const stripCollaborationUrl = (baseUrl = window.location.href) => {
  const url = new URL(baseUrl);
  url.searchParams.delete(ROOM_PARAM);
  url.searchParams.delete(COMPACT_ROOM_PARAM);
  const hash = new URLSearchParams(url.hash.slice(1));
  hash.delete(ROOM_PARAM);
  hash.delete(COMPACT_ROOM_PARAM);
  url.hash = hash.toString();
  return url.toString();
};

export const parseCollaborationUrl = (
  urlValue = window.location.href
): CollaborationLinkParseResult => {
  try {
    const url = new URL(urlValue);
    const hash = new URLSearchParams(url.hash.slice(1));
    const compact = hash.get(COMPACT_ROOM_PARAM);
    if (compact !== null) {
      const descriptor = decodeCompactDescriptor(compact);
      if (descriptor === "retired-structured") {
        return { status: "retired", provider: "structured" };
      }
      return isCollaborationDescriptor(descriptor)
        ? { status: "valid", descriptor }
        : { status: "invalid" };
    }
    const encoded = hash.get(ROOM_PARAM);
    if (!encoded) return { status: "none" };
    const descriptor = decodeDescriptor(encoded);
    if (
      descriptor &&
      typeof descriptor === "object" &&
      (descriptor as { mode?: unknown }).mode === "structured"
    ) {
      return { status: "retired", provider: "structured" };
    }
    if (isCollaborationDescriptor(descriptor)) {
      return { status: "valid", descriptor };
    }
    if (
      descriptor &&
      typeof descriptor === "object" &&
      (descriptor as { version?: unknown }).version === 6 &&
      (descriptor as { provider?: unknown }).provider === "p2p"
    ) {
      return { status: "retired", provider: "p2p" };
    }
    if (descriptor && typeof descriptor === "object" && "version" in descriptor) {
      const version = (descriptor as { version?: unknown }).version;
      return {
        status: "unsupported",
        version: typeof version === "number" ? version : null,
      };
    }
    return { status: "invalid" };
  } catch {
    return { status: "invalid" };
  }
};

export const sameCollaborationRoom = (
  left: CollaborationDescriptor | undefined,
  right: CollaborationDescriptor | null
) =>
  !!left &&
  !!right &&
  left.version === right.version &&
  left.provider === right.provider &&
  left.roomId === right.roomId &&
  left.key === right.key &&
  left.mode === right.mode &&
  left.documentVersion === right.documentVersion &&
  left.endpoint === right.endpoint;
