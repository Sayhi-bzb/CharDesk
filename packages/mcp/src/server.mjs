import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { WebSocket, WebSocketServer } from 'ws';
import { credentialsPath, pairingPath } from './paths.mjs';
import { loadCredentials } from './credentials.mjs';
import { toolNames, tools } from './tools.mjs';
import { announceUpdateIfAvailable, MCP_NAME, MCP_VERSION } from './version.mjs';

const configuredPort = process.env.CHARDESK_MCP_PORT;
const port = configuredPort === undefined || configuredPort === '' ? 9494 : Number(configuredPort);
const origins = new Set((process.env.CHARDESK_MCP_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173,https://canvas.chardesk.com').split(','));
const credentialsFile = process.env.CHARDESK_MCP_CREDENTIALS || credentialsPath();
const pairingFile = process.env.CHARDESK_MCP_PAIRING || pairingPath();
let credentials = await loadCredentials(credentialsFile);
const pending = new Map();
const clients = new Map();
let page;
let pageGrant;
let pageReady = false;
let http;
let shutdownIfIdle = () => undefined;
const DEFAULT_BRIDGE_REQUEST_TIMEOUT = 10_000;
const CODE_BRIDGE_REQUEST_TIMEOUT = 30_000;
const canvasUrl = process.env.CHARDESK_CANVAS_URL || 'https://canvas.chardesk.com';
const autoOpenCanvas = process.env.CHARDESK_MCP_OPEN_CANVAS !== '0';
let canvasOpenAttempted = false;
const debug = process.env.CHARDESK_MCP_DEBUG === '1';
const event = (name, details = {}) => { if (debug) console.error(JSON.stringify({ event: `mcp.${name}`, at: new Date().toISOString(), ...details })); };
const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
const pairingUrl = () => `ws://127.0.0.1:${http.address().port}/bridge?token=${credentials.token}`;
const publishPairing = async () => { await mkdir(dirname(pairingFile), { recursive: true }); await writeFile(pairingFile, JSON.stringify({ bridgeUrl: pairingUrl(), pid: process.pid, expiresAt: credentials.expiresAt }), { mode: 0o600 }); };
const rejectUpgrade = (socket, code, text) => socket.end(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
const permissionFor = (name, input) => name.endsWith('_read') ? 'read' : name.endsWith('_search') ? 'search' : name.endsWith('_manage') && (input?.action === 'list' || input?.action === 'list_pages') ? 'inspect' : 'write';

const rejectClientPending = (clientId, error) => { for (const [id, request] of pending) { if (request.client?.id !== clientId) continue; clearTimeout(request.timer); pending.delete(id); request.client.pending.delete(id); request.reject(error); } };
const closeClient = (clientId, reason = 'Client disconnected.') => { const client = clients.get(clientId); if (!client) return; rejectClientPending(clientId, new Error(reason)); clients.delete(clientId); if (client.socket?.readyState === WebSocket.OPEN) client.socket.close(1000, reason); };
const closeAllClients = (reason) => { for (const id of clients.keys()) closeClient(id, reason); };
const openCanvas = () => {
  if (!autoOpenCanvas || canvasOpenAttempted) return false;
  canvasOpenAttempted = true;
  try {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const args = process.platform === 'win32' ? ['/c', 'start', '', canvasUrl] : [canvasUrl];
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    return true;
  } catch { return false; }
};

async function resolveSourceRef(name, input) {
  if (!['canvas_write', 'canvas_render'].includes(name) || input?.sourceRef === undefined) return input;
  if (typeof input.sourceRef !== 'string' || input.sourceRef.length === 0) throw new Error('sourceRef must be a non-empty local file path.');
  const contentKey = name === 'canvas_write' ? 'content' : 'source';
  if (input[contentKey] !== undefined) throw new Error(`Provide either ${contentKey} or sourceRef, not both.`);
  let content;
  try { content = await readFile(input.sourceRef, 'utf8'); } catch (error) { throw new Error(`Unable to read sourceRef: ${error instanceof Error ? error.message : 'local file read failed'}`); }
  const { sourceRef: _sourceRef, ...rest } = input;
  return { ...rest, [contentKey]: content };
}

http = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health' && request.headers.host === `127.0.0.1:${http.address().port}`) {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ role: 'bridge', pageConnected: Boolean(page && page.readyState === WebSocket.OPEN), pageAuthorized: Boolean(pageGrant), pageReady, clients: clients.size })); return;
  }
  if (request.method === 'GET' && request.url === '/discover' && request.headers.host === `127.0.0.1:${http.address().port}` && origins.has(request.headers.origin)) {
    response.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': request.headers.origin, 'cache-control': 'no-store' }).end(JSON.stringify({ bridgeUrl: `ws://127.0.0.1:${http.address().port}/bridge` })); return;
  }
  if (request.method === 'POST' && request.url === '/revoke' && request.headers.host === `127.0.0.1:${http.address().port}` && !request.headers.origin && request.headers.authorization === `Bearer ${credentials.token}`) {
    try {
      await unlink(credentialsFile).catch((error) => { if (error.code !== 'ENOENT') throw error; });
      credentials = await loadCredentials(credentialsFile);
      pageGrant = undefined; pageReady = false;
      closeAllClients('Pairing revoked.');
      page?.close(1000, 'Pairing revoked');
      await publishPairing();
      response.writeHead(204).end();
    } catch { response.writeHead(500).end(); }
    return;
  }
  response.writeHead(404).end();
});

http.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const browser = url.pathname === '/bridge'; const client = url.pathname === '/agent'; const token = url.searchParams.get('token');
  if (request.headers.host !== `127.0.0.1:${http.address().port}` || (browser && !origins.has(request.headers.origin)) || (!browser && !client) || (client && token !== credentials.token) || Date.now() >= credentials.expiresAt) { rejectUpgrade(socket, 403, 'Forbidden'); return; }
  if (browser && page) { rejectUpgrade(socket, 409, 'Canvas page already connected'); return; }
  sockets.handleUpgrade(request, socket, head, (ws) => browser ? setupBrowser(ws) : setupClient(ws));
});

function setupBrowser(client) {
  page = client; pageGrant = undefined; pageReady = false; event('browser_connected'); client.send(JSON.stringify({ method: 'paired', expiresAt: credentials.expiresAt }));
  client.on('error', () => client.terminate());
  client.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.method === 'revoke') { pageGrant = undefined; pageReady = false; closeAllClients('Pairing revoked.'); client.close(1000, 'Pairing revoked'); return; }
      if (message.method === 'authorize') {
        const grant = message.grant; const permissions = grant?.permissions;
        const valid = permissions && ['inspect', 'read', 'search', 'write'].every((key) => typeof permissions[key] === 'boolean') && ['application', 'canvas'].includes(grant.scope) && (grant.scope !== 'canvas' || (typeof grant.canvasId === 'string' && grant.canvasId));
        if (!valid) { client.send(JSON.stringify({ method: 'authorization_denied' })); client.close(1008, 'Invalid authorization grant'); return; }
        pageGrant = { scope: grant.scope, canvasId: grant.canvasId, permissions: { ...permissions } }; pageReady = false;
        event('browser_authorized', { scope: grant.scope, permissions }); client.send(JSON.stringify({ method: 'authorized' })); client.send(JSON.stringify({ method: 'ready_probe' })); return;
      }
      if (message.method === 'ready') { if (message.protocolVersion !== undefined && message.protocolVersion !== 1) { client.close(1002, 'Unsupported Canvas bridge protocol'); return; } pageReady = true; event('browser_ready'); return; }
      if (message.method === 'runtime_status' && message.status) { pageReady = message.status.status !== 'booting' && message.status.status !== 'unavailable'; return; }
      const request = pending.get(message.id); if (!request) return; pending.delete(message.id); clearTimeout(request.timer); request.client.pending.delete(message.id); if (typeof message.error === 'string') request.reject(new Error(message.error)); else request.resolve(message.result);
    } catch { client.close(1003, 'Invalid bridge message'); }
  });
  client.on('close', () => { if (page !== client) return; page = undefined; pageGrant = undefined; pageReady = false; event('browser_closed', { code: client.closeCode, reason: client.closeReason }); for (const [id, request] of pending) { clearTimeout(request.timer); pending.delete(id); request.client.pending.delete(id); request.reject(new Error('Canvas page disconnected.')); } shutdownIfIdle(); });
}

function setupClient(socket) {
  let bridgeClient;
  socket.on('error', () => socket.terminate());
  socket.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.method === 'client_hello') { if (bridgeClient || clients.size >= 16) { socket.close(1008, 'Client limit reached'); return; } bridgeClient = { id: randomUUID(), socket, pending: new Set(), permissions: { inspect: true, read: true, search: true, write: true } }; clients.set(bridgeClient.id, bridgeClient); event('client_connected', { clientId: bridgeClient.id, clients: clients.size }); socket.send(JSON.stringify({ method: 'client_ready', clientId: bridgeClient.id, expiresAt: credentials.expiresAt })); return; }
      if (!bridgeClient || message.method !== 'call' || typeof message.id !== 'string') { socket.close(1008, 'Invalid client message'); return; }
      const name = message.params?.name; const input = message.params?.input;
      if (typeof name !== 'string' || !input || typeof input !== 'object' || Array.isArray(input)) { socket.send(JSON.stringify({ id: message.id, error: 'Invalid tool request.' })); return; }
      void forward(name, input, bridgeClient).then((result) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ id: message.id, result })); }).catch((error) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ id: message.id, error: error instanceof Error ? error.message : 'Canvas request failed' })); });
    } catch { socket.close(1003, 'Invalid client frame'); }
  });
  socket.on('close', () => { if (bridgeClient) { event('client_closed', { clientId: bridgeClient.id, code: socket.closeCode, reason: socket.closeReason }); closeClient(bridgeClient.id); } shutdownIfIdle(); });
}

async function forward(name, input, client) {
  input = await resolveSourceRef(name, input);
  if (Date.now() >= credentials.expiresAt) throw new Error('Pairing expired.');
  if (!page || page.readyState !== WebSocket.OPEN) {
    const opened = openCanvas();
    throw new Error(opened
      ? `Canvas page is not connected. Opened ${canvasUrl}; retry the Canvas tool after the page loads.`
      : `Canvas page is not connected. Open ${canvasUrl} and retry.`);
  }
  if (!pageGrant) throw new Error('Canvas page is not authorized.');
  const permission = permissionFor(name, input);
  if (!pageGrant.permissions[permission] || !client.permissions[permission]) throw new Error(`Permission denied: canvas.${permission}`);
  if (pageGrant.scope === 'canvas' && input?.canvasId !== undefined && input.canvasId !== pageGrant.canvasId) throw new Error('Canvas authorization is limited to the paired Canvas.');
  if (pending.size >= 128 || client.pending.size >= 32 || page.bufferedAmount > 1024 * 1024) throw new Error('Bridge is busy.');
  const id = randomUUID(); const message = JSON.stringify({ id, method: 'call', params: { name, input } });
  return new Promise((resolve, reject) => { const timeout = name === 'canvas_code' ? CODE_BRIDGE_REQUEST_TIMEOUT : DEFAULT_BRIDGE_REQUEST_TIMEOUT; const timer = setTimeout(() => { pending.delete(id); client.pending.delete(id); reject(new Error('Canvas page timed out.')); }, timeout); client.pending.add(id); pending.set(id, { resolve, reject, timer, client }); page.send(message, (error) => { if (!error || !pending.delete(id)) return; client.pending.delete(id); clearTimeout(timer); reject(error); }); });
}

const mcp = new Server({ name: MCP_NAME, version: MCP_VERSION }, { capabilities: { tools: {} } });
mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
mcp.setRequestHandler(CallToolRequestSchema, async ({ params }) => { try { if (!toolNames.has(params.name)) throw new Error('Unknown Canvas tool.'); const result = await forward(params.name, params.arguments || {}, { id: 'stdio', pending: new Set(), permissions: { inspect: true, read: true, search: true, write: true } }); const blocks = Array.isArray(result?.contentBlocks) ? result.contentBlocks.map((block) => block.type === 'note' ? { type: 'text', text: block.text } : block) : [{ type: 'text', text: JSON.stringify(result) }]; return { content: blocks, structuredContent: result, isError: result?.ok === false }; } catch (error) { return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Canvas request failed' }] }; } });

let brokerStarted = true;
try { await new Promise((resolve, reject) => { http.once('error', reject); http.listen(port, '127.0.0.1', resolve); }); } catch (error) { if (error?.code !== 'EADDRINUSE') throw error; brokerStarted = false; }
if (!brokerStarted) { console.error('CharDesk MCP bridge already running; joining it as a client.'); await import('./agent.mjs'); } else {
  await publishPairing(); console.error(JSON.stringify({ bridgeUrl: pairingUrl(), expiresAt: credentials.expiresAt, version: MCP_VERSION })); await mcp.connect(new StdioServerTransport()); void announceUpdateIfAvailable();
  let stopping = false; const stop = async () => { if (stopping) return; stopping = true; event('bridge_stopping'); for (const client of sockets.clients) client.terminate(); await Promise.allSettled([new Promise((resolve) => sockets.close(resolve)), new Promise((resolve) => http.close(resolve)), mcp.close()]); void readFile(pairingFile, 'utf8').then((value) => { if (JSON.parse(value).pid === process.pid) return unlink(pairingFile); }).catch(() => undefined); process.exit(0); };
  let ownerStdioClosed = false; shutdownIfIdle = () => { if (ownerStdioClosed && !page && clients.size === 0) void stop(); }; process.once('SIGTERM', stop); process.once('SIGINT', stop); process.stdin.once('end', () => { ownerStdioClosed = true; event('owner_stdio_closed', { pageConnected: Boolean(page), clients: clients.size }); shutdownIfIdle(); });
}
