import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { WebSocket, WebSocketServer } from "ws";
import { CANVAS_LIST_TOOL, CANVAS_READ_TOOL, CANVAS_SEARCH_TOOL, CANVAS_WRITE_TOOL } from "../../apps/canvas/src/app/site-tools/canvasToolDefinitions.ts";
import { loadCredentials } from './credentials.mjs';

// Experiment only: one explicitly paired browser page, no document storage.
const canvasTools = [CANVAS_LIST_TOOL, CANVAS_READ_TOOL, CANVAS_SEARCH_TOOL, CANVAS_WRITE_TOOL];
const allowedTools = new Set(canvasTools.map((tool) => tool.name));
const origins = new Set((process.env.CHARDESK_BRIDGE_ORIGIN || "http://127.0.0.1:5173").split(","));
const pairingFile = process.env.CHARDESK_BRIDGE_PAIRING_FILE;
const credentialsFile = pairingFile && `${pairingFile}.credentials`;
let credentials = await loadCredentials(credentialsFile);
if (process.env.CHARDESK_BRIDGE_TOKEN) credentials.token = process.env.CHARDESK_BRIDGE_TOKEN;
const timeoutMs = Number(process.env.CHARDESK_BRIDGE_TIMEOUT_MS || 10_000);
const http = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/discover"
    && request.headers.host === `127.0.0.1:${http.address().port}`
    && origins.has(request.headers.origin)) {
    response.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": request.headers.origin,
      "cache-control": "no-store",
    }).end(JSON.stringify({ bridgeUrl: `ws://127.0.0.1:${http.address().port}/bridge` }));
    return;
  }
  if (request.method !== 'POST' || request.url !== '/revoke'
    || request.headers.host !== `127.0.0.1:${http.address().port}`
    || request.headers.origin || request.headers.authorization !== `Bearer ${credentials.token}`) {
    response.writeHead(403).end();
    return;
  }
  try {
    if (credentialsFile) await unlink(credentialsFile);
    credentials = await loadCredentials(credentialsFile);
    pageGrant = undefined;
    page?.close(1000, 'Pairing revoked');
    await publishPairing();
    response.writeHead(204).end();
  } catch { response.writeHead(500).end(); }
});
const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
let page;
let pageGrant;
const pending = new Map();

http.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const expectedHost = `127.0.0.1:${http.address().port}`;
  const token = url.searchParams.get("token");
  if (request.headers.host !== expectedHost || !origins.has(request.headers.origin)
    || url.pathname !== "/bridge" || (token !== null && token !== credentials.token)
    || Date.now() >= credentials.expiresAt) {
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }
  if (page) {
    socket.end("HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n");
    return;
  }
  sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client));
});

sockets.on("connection", (client) => {
  page = client;
  pageGrant = undefined;
  client.send(JSON.stringify({ method: 'paired', expiresAt: credentials.expiresAt }));
  const expiry = setInterval(() => {
    if (Date.now() >= credentials.expiresAt) client.close(1000, 'Pairing expired');
  }, 60_000);
  expiry.unref();
  client.on("error", () => client.terminate());
  client.on("message", (data) => {
    try {
      const response = JSON.parse(data.toString());
      if (response.method === "revoke") {
        void (async () => {
          if (credentialsFile) await unlink(credentialsFile);
          credentials = await loadCredentials(credentialsFile);
          pageGrant = undefined;
          await publishPairing();
          client.close(1000, "Pairing revoked");
        })().catch(() => client.close(1011, "Unable to revoke pairing"));
        return;
      }
      if (response.method === "authorize") {
        const grant = response.grant;
        const permissions = grant?.permissions;
        const validPermissions = permissions && ["inspect", "read", "search", "write"].every((key) => typeof permissions[key] === "boolean");
        if (!validPermissions || !["application", "canvas"].includes(grant.scope)
          || (grant.scope === "canvas" && (typeof grant.canvasId !== "string" || !grant.canvasId))) {
          client.send(JSON.stringify({ method: "authorization_denied" }));
          client.close(1008, "Invalid authorization grant");
          return;
        }
        pageGrant = { scope: grant.scope, canvasId: grant.canvasId, permissions: { ...permissions } };
        client.send(JSON.stringify({ method: "authorized" }));
        return;
      }
      const request = pending.get(response.id);
      if (!request) return;
      pending.delete(response.id);
      clearTimeout(request.timer);
      if (typeof response.error === "string") request.reject(new Error(response.error));
      else request.resolve(response.result);
    } catch {
      client.close(1003, "Invalid bridge response");
    }
  });
  client.on("close", () => {
    clearInterval(expiry);
    page = undefined;
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("Page disconnected; an in-flight write may already have applied. Read before retrying."));
    }
    pending.clear();
  });
});

function forward(method, params = {}) {
  if (Date.now() >= credentials.expiresAt) return Promise.reject(new Error('Pairing expired. Generate a new pairing URL.'));
  if (!page || page.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Canvas page is not connected."));
  if (!pageGrant) return Promise.reject(new Error("Canvas authorization is required."));
  const permission = method.endsWith("_list") ? "inspect" : method.endsWith("_read") ? "read" : method.endsWith("_search") ? "search" : "write";
  const input = params.input || {};
  if (!pageGrant.permissions[permission]) return Promise.reject(new Error(`Permission denied: canvas.${permission}`));
  if (pageGrant.scope === "canvas" && input.canvasId !== undefined && input.canvasId !== pageGrant.canvasId) {
    return Promise.reject(new Error("Canvas authorization is limited to the paired Canvas."));
  }
  if (pending.size >= 32 || page.bufferedAmount > 1024 * 1024) return Promise.reject(new Error("Bridge is busy."));
  const id = randomUUID();
  const message = JSON.stringify({ id, method, params });
  if (Buffer.byteLength(message) > 1024 * 1024) return Promise.reject(new Error("Bridge request exceeds 1 MiB."));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Page timed out; a write may already have applied. Read before retrying."));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    page.send(message, (error) => {
      if (!error || !pending.delete(id)) return;
      clearTimeout(timer);
      reject(error);
    });
  });
}

const mcp = new Server({ name: "chardesk-local-canvas-experiment", version: "0.0.0" }, { capabilities: { tools: {} } });
mcp.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: canvasTools.map(({ readOnly, ...tool }) =>
    ({ ...tool, annotations: { readOnlyHint: readOnly } })) };
});
mcp.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  try {
    if (!allowedTools.has(params.name)) throw new Error("Unknown Canvas tool.");
    const result = await forward("call", { name: params.name, input: params.arguments || {} });
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
      isError: result?.ok === false,
    };
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: error.message }] };
  }
});

await new Promise((resolve) => http.listen(Number(process.env.CHARDESK_BRIDGE_PORT || 0), "127.0.0.1", resolve));
async function publishPairing() {
  const bridgeUrl = `ws://127.0.0.1:${http.address().port}/bridge?token=${credentials.token}`;
  if (pairingFile) {
    await mkdir(dirname(pairingFile), { recursive: true });
    await writeFile(pairingFile, JSON.stringify({ bridgeUrl, pid: process.pid, expiresAt: credentials.expiresAt }), { mode: 0o600 });
  }
  return bridgeUrl;
}
const bridgeUrl = await publishPairing();
// stdout belongs exclusively to the MCP stdio protocol.
console.error(JSON.stringify({ bridgeUrl }));
await mcp.connect(new StdioServerTransport());

const stop = () => {
  for (const client of sockets.clients) client.terminate();
  sockets.close();
  http.close();
  void mcp.close();
  if (pairingFile) void readFile(pairingFile, "utf8").then((content) => {
    if (JSON.parse(content).pid === process.pid) return unlink(pairingFile);
  }).catch(() => undefined);
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
process.stdin.once("end", stop);
