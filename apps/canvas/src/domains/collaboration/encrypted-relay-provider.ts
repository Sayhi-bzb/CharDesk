import {
  decryptCollaborationRelayPayload,
  encryptCollaborationRelayPayload,
  importCollaborationRelayKey,
  type CollaborationRelayChannel,
} from "@chardesk/collaboration-protocol";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
  type Awareness,
} from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import type * as Y from "yjs";

type ProviderEvent = "status" | "sync" | "connection-error";
type Listener = (event: unknown) => void;

type WebSocketConstructor = new (url: string | URL) => WebSocket;

type EncryptedRelayProviderOptions = {
  awareness: Awareness;
  WebSocketPolyfill?: WebSocketConstructor;
  reconnect?: boolean;
};

const toUint8Array = async (data: unknown) => {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  throw new Error("Unsupported collaboration frame");
};

export class EncryptedRelayProvider {
  private readonly listeners = new Map<ProviderEvent, Set<Listener>>();
  private readonly awareness: Awareness;
  private readonly doc: Y.Doc;
  private readonly roomId: string;
  private readonly url: string;
  private readonly WebSocketImplementation: WebSocketConstructor;
  private readonly reconnect: boolean;
  private readonly key: Promise<CryptoKey>;
  private socket: WebSocket | null = null;
  private destroyed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sendChain = Promise.resolve();

  constructor(
    endpoint: string,
    roomId: string,
    encodedKey: string,
    doc: Y.Doc,
    options: EncryptedRelayProviderOptions
  ) {
    this.awareness = options.awareness;
    this.doc = doc;
    this.roomId = roomId;
    this.url = `${endpoint.replace(/\/$/, "")}/v1/rooms/${encodeURIComponent(roomId)}`;
    this.WebSocketImplementation = options.WebSocketPolyfill ?? WebSocket;
    this.reconnect = options.reconnect ?? true;
    this.key = importCollaborationRelayKey(encodedKey);
    this.doc.on("update", this.handleDocumentUpdate);
    this.awareness.on("update", this.handleAwarenessUpdate);
    this.connect();
  }

  on(event: string, listener: Listener) {
    if (event !== "status" && event !== "sync" && event !== "connection-error") return;
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  private emit(event: ProviderEvent, value: unknown) {
    this.listeners.get(event)?.forEach((listener) => listener(value));
  }

  private connect() {
    if (this.destroyed || this.socket) return;
    this.emit("status", { status: "connecting" });
    const socket = new this.WebSocketImplementation(this.url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.socket !== socket || this.destroyed) return;
      this.reconnectAttempts = 0;
      this.emit("status", { status: "connected" });
      this.emit("sync", true);
      this.sendSyncStep1();
      this.send("sync-query", new Uint8Array());
      this.sendAwareness([this.doc.clientID]);
      this.send("awareness-query", new Uint8Array());
    });
    socket.addEventListener("message", (event) => {
      void this.receive(event.data).catch(() => {
        this.emit("connection-error", new Error("Encrypted collaboration frame was rejected"));
      });
    });
    socket.addEventListener("error", (event) => this.emit("connection-error", event));
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = null;
      removeAwarenessStates(
        this.awareness,
        [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID),
        this
      );
      this.emit("sync", false);
      this.emit("status", { status: "disconnected" });
      if (!this.destroyed && this.reconnect) this.scheduleReconnect();
    });
  }

  private scheduleReconnect() {
    const delay = Math.min(10_000, 100 * 2 ** this.reconnectAttempts++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay + Math.floor(Math.random() * 100));
  }

  private readonly handleDocumentUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === this) return;
    const encoder = encoding.createEncoder();
    syncProtocol.writeUpdate(encoder, update);
    this.send("sync", encoding.toUint8Array(encoder));
  };

  private readonly handleAwarenessUpdate = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => {
    if (origin === this) return;
    this.sendAwareness([...changes.added, ...changes.updated, ...changes.removed]);
  };

  private sendAwareness(clientIds: number[]) {
    if (clientIds.length === 0) return;
    this.send("awareness", encodeAwarenessUpdate(this.awareness, clientIds));
  }

  private sendSyncStep1() {
    const encoder = encoding.createEncoder();
    syncProtocol.writeSyncStep1(encoder, this.doc);
    this.send("sync", encoding.toUint8Array(encoder));
  }

  private send(channel: CollaborationRelayChannel, payload: Uint8Array) {
    this.sendChain = this.sendChain.then(async () => {
      if (this.socket?.readyState !== WebSocket.OPEN) return;
      const frame = await encryptCollaborationRelayPayload(
        await this.key,
        this.roomId,
        channel,
        payload
      );
      this.socket?.send(frame);
    }).catch((error) => this.emit("connection-error", error));
  }

  private async receive(data: unknown) {
    const message = await decryptCollaborationRelayPayload(
      await this.key,
      this.roomId,
      await toUint8Array(data)
    );
    if (message.channel === "awareness-query") {
      this.sendAwareness([this.doc.clientID]);
      return;
    }
    if (message.channel === "sync-query") {
      this.sendSyncStep1();
      return;
    }
    if (message.channel === "awareness") {
      applyAwarenessUpdate(this.awareness, message.payload, this);
      return;
    }
    const decoder = decoding.createDecoder(message.payload);
    const response = encoding.createEncoder();
    const messageType = syncProtocol.readSyncMessage(decoder, response, this.doc, this);
    if (messageType === syncProtocol.messageYjsSyncStep2) this.emit("sync", true);
    const responsePayload = encoding.toUint8Array(response);
    if (responsePayload.byteLength > 0) this.send("sync", responsePayload);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.sendAwareness([this.doc.clientID]);
    this.doc.off("update", this.handleDocumentUpdate);
    this.awareness.off("update", this.handleAwarenessUpdate);
    this.socket?.close(1000, "Client disconnected");
    this.socket = null;
    this.listeners.clear();
  }
}
