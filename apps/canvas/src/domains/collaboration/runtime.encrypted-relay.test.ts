import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import WebSocket, { WebSocketServer } from "ws";
import { EncryptedRelayProvider } from "./encrypted-relay-provider";
import type { CollaborationDescriptorV7 } from "./model";
import { CollaborationRuntime } from "./runtime";

const closeServer = (server: Server) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });

const startOpaqueRelay = async () => {
  const server = createServer();
  const sockets = new WebSocketServer({ noServer: true });
  sockets.on("connection", (socket) => {
    socket.on("message", (message, isBinary) => {
      for (const peer of sockets.clients) {
        if (peer !== socket && peer.readyState === WebSocket.OPEN) peer.send(message, { binary: isBinary });
      }
    });
  });
  server.on("upgrade", (request, socket, head) => {
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing relay port");
  return { endpoint: `ws://127.0.0.1:${address.port}`, server, sockets };
};

const createRuntime = () => new CollaborationRuntime({
  createPersistence: async () => ({
    whenSynced: Promise.resolve(),
    destroy: () => {},
    clearData: async () => {},
  }),
  createAwareness: (doc) => new Awareness(doc),
  createProvider: (descriptor, doc, awareness) => {
    if (descriptor.version !== 7) throw new Error("Expected V7 collaboration");
    return new EncryptedRelayProvider(
      descriptor.endpoint ?? "",
      descriptor.roomId,
      descriptor.key,
      doc,
      {
        awareness: awareness as Awareness,
        WebSocketPolyfill: WebSocket as unknown as new (url: string | URL) => globalThis.WebSocket,
        reconnect: false,
      }
    );
  },
});

describe("encrypted collaboration relay", () => {
  const cleanups: Array<() => Promise<void> | void> = [];
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    } satisfies Storage);
  });
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    vi.unstubAllGlobals();
  });

  it("converges Yjs documents while the relay sees only ciphertext", async () => {
    const relay = await startOpaqueRelay();
    cleanups.push(async () => {
      for (const socket of relay.sockets.clients) socket.terminate();
      await new Promise<void>((resolve) => relay.sockets.close(() => resolve()));
      await closeServer(relay.server);
    });
    const observedFrames: Uint8Array[] = [];
    relay.sockets.on("connection", (socket) => {
      socket.on("message", (message) => observedFrames.push(new Uint8Array(message as Buffer)));
    });

    const descriptor: CollaborationDescriptorV7 = {
      version: 7,
      documentVersion: 6,
      mode: "freeform",
      provider: "encrypted-relay",
      roomId: "encrypted-room-123456",
      key: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
      endpoint: relay.endpoint,
    };
    const hostDoc = new Y.Doc();
    const guestDoc = new Y.Doc();
    const host = createRuntime();
    const guest = createRuntime();
    cleanups.push(async () => {
      await Promise.all([host.disconnect(), guest.disconnect()]);
      hostDoc.destroy();
      guestDoc.destroy();
    });

    hostDoc.getMap("content").set("title", "GPU secret");
    guestDoc.getMap("content").set("offline-note", "local draft");
    await host.connect(descriptor, hostDoc, "host");
    await guest.connect(descriptor, guestDoc, "guest");

    await vi.waitFor(() => {
      expect(guestDoc.getMap("content").get("title")).toBe("GPU secret");
      expect(hostDoc.getMap("content").get("offline-note")).toBe("local draft");
      expect(guest.getSnapshot()).toMatchObject({
        documentStatus: "ready",
        connectionStatus: "online",
        canEdit: true,
      });
    }, { timeout: 5_000 });
    guestDoc.getMap("content").set("status", "reviewed");
    await vi.waitFor(() => {
      expect(hostDoc.getMap("content").get("status")).toBe("reviewed");
    });

    const wireText = observedFrames
      .map((frame) => new TextDecoder().decode(frame))
      .join("");
    expect(wireText).not.toContain("GPU secret");
    expect(wireText).not.toContain("reviewed");
  }, 10_000);
});
