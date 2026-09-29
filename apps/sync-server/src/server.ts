import { createServer, type IncomingMessage } from "node:http";
import {
  COLLABORATION_RELAY_CLOSE,
  COLLABORATION_RELAY_MAX_FRAME_BYTES,
  inspectCollaborationRelayFrame,
} from "@chardesk/collaboration-protocol";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import type { createAccountApi } from "./account-api.js";

const ROOM_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

type SyncServerOptions = {
  host?: string;
  port?: number;
  allowedOrigins?: ReadonlySet<string>;
  maxConnectionsPerRoom?: number;
  maxConnectionsPerIp?: number;
  maxConnectionAttemptsPerMinute?: number;
  trustProxy?: boolean;
  heartbeatIntervalMs?: number;
  logger?: (entry: Record<string, unknown>) => void;
  accountApi?: ReturnType<typeof createAccountApi>;
};

type Client = WebSocket & { alive?: boolean; remoteAddress?: string };

const readRoomId = (request: IncomingMessage) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  const match = /^\/v1\/rooms\/([^/]+)$/.exec(url.pathname);
  if (!match) return null;
  const roomId = decodeURIComponent(match[1] ?? "");
  return ROOM_PATTERN.test(roomId) ? roomId : null;
};

const sendHttpError = (socket: import("node:stream").Duplex, status: number) => {
  socket.write(`HTTP/1.1 ${status} Error\r\nConnection: close\r\n\r\n`);
  socket.destroy();
};

export const createSyncServer = (options: SyncServerOptions = {}) => {
  const rooms = new Map<string, Set<Client>>();
  const ipConnections = new Map<string, number>();
  const connectionAttempts = new Map<string, { startedAt: number; count: number }>();
  const maxRoom = options.maxConnectionsPerRoom ?? 30;
  const maxIp = options.maxConnectionsPerIp ?? 20;
  const maxAttempts = options.maxConnectionAttemptsPerMinute ?? 120;
  const heartbeatMs = options.heartbeatIntervalMs ?? 30_000;
  const log = options.logger ?? ((entry) => console.log(JSON.stringify(entry)));
  const sockets = new WebSocketServer({ noServer: true, maxPayload: COLLABORATION_RELAY_MAX_FRAME_BYTES });
  const server = createServer((request, response) => {
    if (request.url?.startsWith("/v1/account/")) {
      if (!options.accountApi) {
        response.writeHead(404).end();
        return;
      }
      void options.accountApi.handle(request, response).catch(() => {
        if (!response.headersSent) response.writeHead(500).end();
        else response.destroy();
      });
      return;
    }
    if (request.url === "/healthz" || request.url === "/readyz") {
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "application/json",
      });
      response.end(JSON.stringify({ ok: true, rooms: rooms.size, connections: sockets.clients.size }));
      return;
    }
    response.writeHead(404).end();
  });

  server.on("upgrade", (request, socket, head) => {
    const roomId = readRoomId(request);
    if (!roomId) {
      sendHttpError(socket, 400);
      return;
    }
    const origin = request.headers.origin;
    if (options.allowedOrigins?.size && (!origin || !options.allowedOrigins.has(origin))) {
      sendHttpError(socket, 403);
      return;
    }
    const forwarded = options.trustProxy ? request.headers["x-forwarded-for"] : undefined;
    const remoteAddress = (
      typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : undefined
    ) || request.socket.remoteAddress || "unknown";
    const now = Date.now();
    const previousWindow = connectionAttempts.get(remoteAddress);
    const attemptWindow = !previousWindow || now - previousWindow.startedAt >= 60_000
      ? { startedAt: now, count: 0 }
      : previousWindow;
    if (attemptWindow.count >= maxAttempts) {
      sendHttpError(socket, 429);
      return;
    }
    attemptWindow.count += 1;
    connectionAttempts.set(remoteAddress, attemptWindow);
    if ((ipConnections.get(remoteAddress) ?? 0) >= maxIp) {
      sendHttpError(socket, 429);
      return;
    }
    if ((rooms.get(roomId)?.size ?? 0) >= maxRoom) {
      sendHttpError(socket, 409);
      return;
    }
    sockets.handleUpgrade(request, socket, head, (client) => {
      sockets.emit("connection", client, request, roomId, remoteAddress);
    });
  });

  sockets.on("connection", (socket: Client, _request: IncomingMessage, roomId: string, remoteAddress: string) => {
    const room = rooms.get(roomId) ?? new Set<Client>();
    rooms.set(roomId, room);
    room.add(socket);
    socket.alive = true;
    socket.remoteAddress = remoteAddress;
    ipConnections.set(remoteAddress, (ipConnections.get(remoteAddress) ?? 0) + 1);
    log({ event: "connected", rooms: rooms.size, connections: sockets.clients.size, roomPeers: room.size });

    socket.on("pong", () => { socket.alive = true; });
    socket.on("message", (data: RawData, isBinary) => {
      if (!isBinary) {
        socket.close(COLLABORATION_RELAY_CLOSE.unsupportedProtocol, "Binary frames required");
        return;
      }
      const bytes = Array.isArray(data) ? Buffer.concat(data) : data;
      const frame = bytes instanceof ArrayBuffer
        ? new Uint8Array(bytes)
        : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      try {
        inspectCollaborationRelayFrame(frame);
      } catch (error) {
        const oversized = frame.byteLength > COLLABORATION_RELAY_MAX_FRAME_BYTES;
        socket.close(
          oversized
            ? COLLABORATION_RELAY_CLOSE.oversizedFrame
            : COLLABORATION_RELAY_CLOSE.unsupportedProtocol,
          error instanceof Error ? error.message : "Invalid frame"
        );
        return;
      }
      for (const peer of room) {
        if (peer !== socket && peer.readyState === WebSocket.OPEN) peer.send(frame);
      }
    });
    socket.once("close", () => {
      room.delete(socket);
      const remaining = Math.max(0, (ipConnections.get(remoteAddress) ?? 1) - 1);
      if (remaining) ipConnections.set(remoteAddress, remaining);
      else ipConnections.delete(remoteAddress);
      if (room.size === 0) rooms.delete(roomId);
      log({ event: "disconnected", rooms: rooms.size, connections: sockets.clients.size, roomPeers: room.size });
    });
  });

  const heartbeat = setInterval(() => {
    const expiredBefore = Date.now() - 60_000;
    for (const [address, window] of connectionAttempts) {
      if (window.startedAt < expiredBefore) connectionAttempts.delete(address);
    }
    for (const socket of sockets.clients as Set<Client>) {
      if (socket.alive === false) {
        socket.terminate();
        continue;
      }
      socket.alive = false;
      socket.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  const listen = () => new Promise<{ host: string; port: number }>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 1234, options.host ?? "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("Missing server address"));
      resolve({ host: address.address, port: address.port });
    });
  });

  const close = () => new Promise<void>((resolve, reject) => {
    clearInterval(heartbeat);
    for (const socket of sockets.clients) socket.close(1001, "Server shutting down");
    sockets.close(() => server.close((error) => error ? reject(error) : resolve()));
  });

  return { server, sockets, rooms, listen, close };
};
