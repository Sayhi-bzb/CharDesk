import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Awareness } from "y-protocols/awareness";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import WebSocket, { WebSocketServer } from "ws";
import { docs, setupWSConnection } from "@y/websocket-server/utils";
import type { CollaborationDescriptorV6 } from "./model";
import { getCollaborationRoomName } from "./document";
import { CollaborationRuntime } from "./runtime";

const closeServer = (server: Server) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });

const startServer = async () => {
  const server = createServer();
  const sockets = new WebSocketServer({ noServer: true });
  sockets.on("connection", setupWSConnection);
  server.on("upgrade", (request, socket, head) => {
    sockets.handleUpgrade(request, socket, head, (client) => {
      sockets.emit("connection", client, request);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server port");
  return { endpoint: `ws://127.0.0.1:${address.port}`, server, sockets };
};

const createRuntime = () =>
  new CollaborationRuntime({
    createPersistence: async () => ({
      whenSynced: Promise.resolve(),
      destroy: () => {},
      clearData: async () => {},
    }),
    createAwareness: (doc) => new Awareness(doc),
    createProvider: (descriptor, doc, awareness) => {
      if (descriptor.version !== 6) throw new Error("Expected a V6 descriptor");
      return new WebsocketProvider(
        descriptor.endpoint,
        getCollaborationRoomName(descriptor),
        doc,
        {
          awareness: awareness as Awareness,
          WebSocketPolyfill: WebSocket as unknown as typeof globalThis.WebSocket,
          disableBc: true,
        }
      ) as unknown as {
        on: (event: string, callback: (event: unknown) => void) => void;
        destroy: () => void;
      };
    },
  });

describe("collaboration WebSocket integration", () => {
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
    for (const doc of docs.values()) doc.destroy();
    docs.clear();
    vi.unstubAllGlobals();
  });

  it("joins through a memory-only server and exchanges live document updates", async () => {
    const { endpoint, server, sockets } = await startServer();
    cleanups.push(async () => {
      for (const client of sockets.clients) client.terminate();
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      await closeServer(server);
    });

    const descriptor: CollaborationDescriptorV6 = {
      version: 6,
      documentVersion: 6,
      mode: "freeform",
      provider: "websocket",
      roomId: "integration-room",
      key: "integration-key-123456789012345678901234567890",
      endpoint,
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

    hostDoc.getMap("content").set("title", "GPU");
    await host.connect(descriptor, hostDoc, "host");
    await guest.connect(descriptor, guestDoc, "guest");

    if (guest.getSnapshot().documentStatus === "error") {
      throw new Error(guest.getSnapshot().error ?? "Guest connection failed");
    }
    expect(guest.getSnapshot()).toMatchObject({
      documentStatus: "joining",
      canEdit: false,
    });
    await vi.waitFor(() => {
      expect(guestDoc.getMap("content").get("title")).toBe("GPU");
      expect(guest.getSnapshot()).toMatchObject({
        documentStatus: "ready",
        connectionStatus: "online",
        canEdit: true,
      });
    }, { timeout: 5_000 });

    guestDoc.getMap("content").set("status", "reviewed");
    await vi.waitFor(() => {
      expect(hostDoc.getMap("content").get("status")).toBe("reviewed");
    }, { timeout: 5_000 });
  }, 10_000);
});
