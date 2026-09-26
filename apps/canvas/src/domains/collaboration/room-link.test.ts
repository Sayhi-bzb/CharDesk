import { describe, expect, it, vi } from "vitest";
import {
  buildCollaborationUrl,
  createCollaborationDescriptor,
  getCollaborationDocumentId,
  parseCollaborationUrl,
  sameCollaborationRoom,
  stripCollaborationUrl,
  validateCollaborationEndpoint,
} from "./room-link";

describe("collaboration room links", () => {
  it("creates compact managed V7 links and keeps the room key in the URL fragment", () => {
      vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) });
      const descriptor = createCollaborationDescriptor("freeform");
      const url = buildCollaborationUrl(descriptor, "https://canvas.test/editor?theme=dark");
      expect(new URL(url).searchParams.has("room")).toBe(false);
      expect(new URL(url).hash).toMatch(/^#r=[A-Za-z0-9_-]{66}$/);
      expect(buildCollaborationUrl(descriptor, "https://chardesk.com/")).toHaveLength(90);
      expect(descriptor).toMatchObject({ version: 7, provider: "encrypted-relay" });
      expect(descriptor).not.toHaveProperty("endpoint");
      expect(getCollaborationDocumentId(descriptor)).toBe(
        `collaboration:${descriptor.roomId}`
      );
      expect(parseCollaborationUrl(url)).toEqual({ status: "valid", descriptor });
      vi.unstubAllGlobals();
  });

  it("adds and removes room identity without discarding unrelated URL state", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) });
    const descriptor = createCollaborationDescriptor("freeform", "wss://sync.example.com");
    const url = buildCollaborationUrl(
      descriptor,
      "https://canvas.test/editor?theme=dark&room=legacy&r=legacy#panel=layers&room=legacy&r=legacy"
    );

    expect(new URL(url).search).toBe("?theme=dark");
    const hash = new URLSearchParams(new URL(url).hash.slice(1));
    expect(hash.get("panel")).toBe("layers");
    expect(hash.get("r")).toBeNull();
    expect(hash.get("room")).not.toBe("legacy");
    expect(parseCollaborationUrl(url)).toEqual({ status: "valid", descriptor });
    expect(stripCollaborationUrl(url)).toBe(
      "https://canvas.test/editor?theme=dark#panel=layers"
    );
    vi.unstubAllGlobals();
  });

  it("keeps an optional custom relay in a V7 descriptor", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) });
    expect(createCollaborationDescriptor("freeform", "wss://sync.example.com")).toMatchObject({
      version: 7,
      provider: "encrypted-relay",
      endpoint: "wss://sync.example.com",
    });
    vi.unstubAllGlobals();
  });

  it("accepts secure endpoints and local ws development only", () => {
    expect(validateCollaborationEndpoint("wss://sync.example.com/yjs")).toBe("wss://sync.example.com/yjs");
    expect(validateCollaborationEndpoint("ws://localhost:1234")).toBe("ws://localhost:1234");
    expect(validateCollaborationEndpoint("ws://sync.example.com")).toBeNull();
    expect(validateCollaborationEndpoint("https://sync.example.com")).toBeNull();
  });

  it("rejects malformed descriptors", () => {
    expect(parseCollaborationUrl("https://canvas.test/#room=e30")).toEqual({
      status: "invalid",
    });
  });

  it.each([
    "short",
    `${"A".repeat(65)}!`,
    `${"_".repeat(66)}`,
  ])("rejects malformed compact room token %s", (token) => {
    expect(parseCollaborationUrl(`https://canvas.test/#r=${token}`)).toEqual({
      status: "invalid",
    });
  });

  it("does not fall back to a legacy room when a compact token is present", () => {
    const legacy = btoa(JSON.stringify({ version: 7 })).replace(/=+$/g, "");
    expect(
      parseCollaborationUrl(`https://canvas.test/#r=invalid&room=${legacy}`)
    ).toEqual({ status: "invalid" });
  });

  it("continues to parse legacy JSON-encoded managed V7 links", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) });
    const descriptor = createCollaborationDescriptor("freeform");
    const encoded = btoa(JSON.stringify(descriptor)).replace(/=+$/g, "");
    expect(parseCollaborationUrl(`https://canvas.test/#room=${encoded}`)).toEqual({
      status: "valid",
      descriptor,
    });
    vi.unstubAllGlobals();
  });

  it("rejects legacy room links instead of upgrading them", () => {
    const descriptor = {
      version: 2,
      documentVersion: 3,
      mode: "freeform",
      provider: "p2p",
      roomId: "room-id-1234567890",
      key: "room-key-1234567890123456789012345678901234567890",
    } as const;
    const encoded = btoa(JSON.stringify(descriptor)).replace(/=+$/g, "");
    expect(parseCollaborationUrl(`https://canvas.test/#room=${encoded}`)).toEqual({
      status: "unsupported",
      version: 2,
    });
  });

  it("reports V6 P2P links as retired", () => {
    const descriptor = {
      version: 6,
      documentVersion: 6,
      mode: "freeform",
      provider: "p2p",
      roomId: "room-id-1234567890",
      key: "room-key-1234567890123456789012345678901234567890",
    } as const;
    const encoded = btoa(JSON.stringify(descriptor)).replace(/=+$/g, "");
    expect(parseCollaborationUrl(`https://canvas.test/#room=${encoded}`)).toEqual({
      status: "retired",
      provider: "p2p",
    });
  });

  it("reports legacy Structured links as retired", () => {
    const encoded = btoa(JSON.stringify({
      version: 7,
      documentVersion: 7,
      mode: "structured",
      provider: "encrypted-relay",
      roomId: "room-id-1234567890",
      key: "room-key-1234567890123456789012345678901234567890",
    })).replace(/=+$/g, "");
    expect(parseCollaborationUrl(`https://canvas.test/#room=${encoded}`)).toEqual({
      status: "retired",
      provider: "structured",
    });
  });

  it.each([1, 2, 3, 4, 5])(
    "reports collaboration descriptor version %i as unsupported",
    (version) => {
      const encoded = btoa(JSON.stringify({ version })).replace(/=+$/g, "");
      expect(parseCollaborationUrl(`https://canvas.test/#room=${encoded}`)).toEqual({
        status: "unsupported",
        version,
      });
    }
  );

  it("treats WebSocket endpoints as part of room identity", () => {
    const first = {
      version: 6,
      documentVersion: 6,
      mode: "freeform",
      provider: "websocket",
      roomId: "room-id-1234567890",
      key: "room-key-1234567890123456789012345678901234567890",
      endpoint: "wss://one.example.com",
    } as const;
    expect(
      sameCollaborationRoom(first, {
        ...first,
        endpoint: "wss://two.example.com",
      })
    ).toBe(false);
  });

  it("matches supported descriptors with the same room identity", () => {
    const room = {
      version: 6,
      documentVersion: 6,
      mode: "freeform",
      provider: "websocket",
      roomId: "room-id-1234567890",
      key: "room-key-1234567890123456789012345678901234567890",
      endpoint: "wss://sync.example.com",
    } as const;
    expect(sameCollaborationRoom(room, { ...room })).toBe(true);
  });
});
