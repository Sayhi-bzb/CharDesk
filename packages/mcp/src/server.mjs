import { randomUUID } from 'node:crypto';
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

const configuredPort = process.env.CHARDESK_MCP_PORT;
const port = configuredPort === undefined || configuredPort === '' ? 9494 : Number(configuredPort);
const origins = new Set((process.env.CHARDESK_MCP_ORIGINS
  || 'http://127.0.0.1:5173,http://localhost:5173,https://canvas.chardesk.com').split(','));
const credentialsFile = process.env.CHARDESK_MCP_CREDENTIALS || credentialsPath();
const pairingFile = process.env.CHARDESK_MCP_PAIRING || pairingPath();
let credentials = await loadCredentials(credentialsFile);
const pending = new Map();
let page;
let pageGrant;
const tenants = new Map();
const ownerTenant = { id: 'owner', token: null, socket: null, permissions: { inspect: true, read: true, search: true, write: true }, scope: 'application', pending: new Set() };
const debug = process.env.CHARDESK_MCP_DEBUG === '1';
const event = (name, details = {}) => { if (debug) console.error(JSON.stringify({ event: `mcp.${name}`, at: new Date().toISOString(), ...details })); };
let shutdownIfIdle = () => undefined;
let http;
const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

function pairingUrl() { return `ws://127.0.0.1:${http.address().port}/bridge?token=${credentials.token}`; }
async function publishPairing() {
  await mkdir(dirname(pairingFile), { recursive: true });
  await writeFile(pairingFile, JSON.stringify({ bridgeUrl: pairingUrl(), pid: process.pid, expiresAt: credentials.expiresAt }), { mode: 0o600 });
}
function rejectUpgrade(socket, code, text) {
  socket.end(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
}
const permissionFor = (name, input) => name.endsWith('_read') ? 'read'
  : name.endsWith('_search') ? 'search'
    : name.endsWith('_manage') && input?.action === 'list' ? 'inspect' : 'write';
const rejectPending = (tenantId, error) => {
  for (const [id, request] of pending) {
    if (request.tenant?.id !== tenantId) continue;
    clearTimeout(request.timer); pending.delete(id); request.tenant.pending.delete(id); request.reject(error);
  }
};
const closeTenant = (tenantId, reason = 'Tenant disconnected.') => {
  const tenant = tenants.get(tenantId);
  if (!tenant) return;
  rejectPending(tenantId, new Error(reason));
  tenants.delete(tenantId);
  if (tenant.socket?.readyState === WebSocket.OPEN) tenant.socket.close(1000, reason);
};
const closeAllTenants = (reason) => { for (const tenantId of tenants.keys()) closeTenant(tenantId, reason); };

http = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/discover'
    && request.headers.host === `127.0.0.1:${http.address().port}`
    && origins.has(request.headers.origin)) {
    response.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': request.headers.origin,
      'cache-control': 'no-store',
    }).end(JSON.stringify({ bridgeUrl: `ws://127.0.0.1:${http.address().port}/bridge` }));
    return;
  }
  if (request.method !== 'POST' || request.url !== '/revoke'
    || request.headers.host !== `127.0.0.1:${http.address().port}`
    || request.headers.origin || request.headers.authorization !== `Bearer ${credentials.token}`) {
    response.writeHead(403).end(); return;
  }
  try {
    await unlink(credentialsFile).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    credentials = await loadCredentials(credentialsFile);
    pageGrant = undefined;
    closeAllTenants('Pairing revoked.');
    page?.close(1000, 'Pairing revoked');
    await publishPairing();
    response.writeHead(204).end();
  } catch { response.writeHead(500).end(); }
});
http.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const token = url.searchParams.get('token');
  const browser = url.pathname === '/bridge';
  const agent = url.pathname === '/agent';
  if (request.headers.host !== `127.0.0.1:${http.address().port}`
    || (browser && !origins.has(request.headers.origin)) || (!browser && !agent)
    || (agent ? token !== credentials.token : token !== null && token !== credentials.token)
    || Date.now() >= credentials.expiresAt) {
    rejectUpgrade(socket, 403, 'Forbidden'); return;
  }
  if (browser && page) { rejectUpgrade(socket, 409, 'Conflict'); return; }
  sockets.handleUpgrade(request, socket, head, (client) => browser ? setupBrowser(client) : setupAgent(client));
});
function setupBrowser(client) {
  page = client;
  pageGrant = undefined;
  event('browser_connected');
  client.send(JSON.stringify({ method: 'paired', expiresAt: credentials.expiresAt }));
  const expiry = setInterval(() => { if (Date.now() >= credentials.expiresAt) client.close(1000, 'Pairing expired'); }, 60_000);
  expiry.unref();
  client.on('error', () => client.terminate());
  client.on('message', (data) => {
    try {
      const response = JSON.parse(data.toString());
      if (response.method === 'revoke') {
        void (async () => {
          await unlink(credentialsFile).catch((error) => { if (error.code !== 'ENOENT') throw error; });
          credentials = await loadCredentials(credentialsFile);
          pageGrant = undefined;
          closeAllTenants('Pairing revoked.');
          await publishPairing();
          client.close(1000, 'Pairing revoked');
        })().catch(() => client.close(1011, 'Unable to revoke pairing'));
        return;
      }
      if (response.method === 'authorize') {
        const grant = response.grant;
        const permissions = grant?.permissions;
        const validPermissions = permissions && ['inspect', 'read', 'search', 'write'].every((key) => typeof permissions[key] === 'boolean');
        if (!validPermissions || !['application', 'canvas'].includes(grant.scope)
          || (grant.scope === 'canvas' && (typeof grant.canvasId !== 'string' || !grant.canvasId))) {
          client.send(JSON.stringify({ method: 'authorization_denied' }));
          client.close(1008, 'Invalid authorization grant');
          return;
        }
        pageGrant = { scope: grant.scope, canvasId: grant.canvasId, permissions: { ...permissions } };
        event('browser_authorized', { scope: grant.scope, permissions });
        client.send(JSON.stringify({ method: 'authorized' }));
        return;
      }
      const request = pending.get(response.id);
      if (!request) return; pending.delete(response.id); clearTimeout(request.timer); request.tenant.pending.delete(response.id);
      if (typeof response.error === 'string') request.reject(new Error(response.error)); else request.resolve(response.result);
    } catch { client.close(1003, 'Invalid bridge response'); }
  });
  client.on('close', () => {
    clearInterval(expiry);
    if (page !== client) return;
    page = undefined; pageGrant = undefined;
    event('browser_closed', { code: client.closeCode, reason: client.closeReason });
    for (const [id, request] of pending) {
      clearTimeout(request.timer); pending.delete(id); request.tenant.pending.delete(id);
      request.reject(new Error('Canvas page disconnected.'));
    }
    shutdownIfIdle();
  });
}
function setupAgent(client) {
  let tenant;
  const expiry = setInterval(() => { if (Date.now() >= credentials.expiresAt) client.close(1000, 'Pairing expired'); }, 60_000);
  expiry.unref();
  client.on('error', () => client.terminate());
  client.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      if (message.method === 'tenant_hello') {
        if (tenant || tenants.size >= 16) { client.close(1008, tenant ? 'Tenant already initialized' : 'Tenant limit reached'); return; }
        const id = randomUUID();
        tenant = { id, token: randomUUID(), socket: client, permissions: { inspect: true, read: true, search: true, write: true }, scope: 'application', pending: new Set() };
        tenants.set(id, tenant);
        event('tenant_connected', { tenantId: id, tenants: tenants.size });
        client.send(JSON.stringify({ method: 'tenant_ready', tenantId: id, sessionToken: tenant.token, expiresAt: credentials.expiresAt }));
        return;
      }
      if (!tenant || message.sessionToken !== tenant.token || message.method !== 'call' || typeof message.id !== 'string') {
        client.close(1008, 'Invalid tenant request'); return;
      }
      const name = message.params?.name;
      const input = message.params?.input;
      if (typeof name !== 'string' || !input || typeof input !== 'object' || Array.isArray(input)) {
        client.send(JSON.stringify({ id: message.id, error: 'Invalid tool request.' })); return;
      }
      void forward(name, input, tenant).then((result) => {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ id: message.id, result }));
      }).catch((error) => {
        if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ id: message.id, error: error instanceof Error ? error.message : 'Canvas request failed' }));
      });
    } catch { client.close(1003, 'Invalid tenant frame'); }
  });
  client.on('close', () => {
    clearInterval(expiry);
    if (tenant) { event('tenant_closed', { tenantId: tenant.id, code: client.closeCode, reason: client.closeReason }); closeTenant(tenant.id); }
    shutdownIfIdle();
  });
}
function forward(name, input, tenant = ownerTenant) {
  if (Date.now() >= credentials.expiresAt) return Promise.reject(new Error('Pairing expired.'));
  if (!page || page.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Canvas page is not connected.'));
  if (!pageGrant) return Promise.reject(new Error('Canvas authorization is required.'));
  const permission = name.endsWith('_read') ? 'read' : name.endsWith('_search') ? 'search' : name.endsWith('_manage') && input?.action === 'list' ? 'inspect' : 'write';
  if (!pageGrant.permissions[permission] || !tenant.permissions[permission]) return Promise.reject(new Error(`Permission denied: canvas.${permission}`));
  if (pageGrant.scope === 'canvas' && input?.canvasId !== undefined && input.canvasId !== pageGrant.canvasId) {
    return Promise.reject(new Error('Canvas authorization is limited to the paired Canvas.'));
  }
  if (tenant.scope === 'canvas' && input?.canvasId !== undefined && input.canvasId !== tenant.scope) return Promise.reject(new Error('Tenant authorization is limited to its paired Canvas.'));
  if (pending.size >= 128 || tenant.pending.size >= 32 || page.bufferedAmount > 1024 * 1024) return Promise.reject(new Error('Bridge is busy.'));
  const id = randomUUID(); const message = JSON.stringify({ id, method: 'call', params: { name, input } });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); tenant.pending.delete(id); reject(new Error('Canvas page timed out.')); }, 10_000);
    tenant.pending.add(id);
    pending.set(id, { resolve, reject, timer, tenant });
    page.send(message, (error) => { if (!error || !pending.delete(id)) return; tenant.pending.delete(id); clearTimeout(timer); reject(error); });
  });
}
const mcp = new Server({ name: 'chardesk-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });
mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
mcp.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  try {
    if (!toolNames.has(params.name)) throw new Error('Unknown Canvas tool.');
    const result = await forward(params.name, params.arguments || {});
    const blocks = Array.isArray(result?.contentBlocks)
      ? result.contentBlocks.map((block) => block.type === 'note' ? { type: 'text', text: block.text } : block)
      : [{ type: 'text', text: JSON.stringify(result) }];
    return { content: blocks, structuredContent: result, isError: result?.ok === false };
  } catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
});
let brokerStarted = true;
try {
  await new Promise((resolve, reject) => {
    http.once('error', reject); http.listen(port, '127.0.0.1', resolve);
  });
} catch (error) {
  if (error?.code !== 'EADDRINUSE') throw error;
  brokerStarted = false;
}

if (!brokerStarted) {
  await import('./agent.mjs');
} else {
  await publishPairing();
  console.error(JSON.stringify({ bridgeUrl: pairingUrl(), expiresAt: credentials.expiresAt }));
  await mcp.connect(new StdioServerTransport());
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    event('broker_stopping');
    for (const client of sockets.clients) client.terminate();
    await Promise.allSettled([
      new Promise((resolve) => sockets.close(resolve)),
      new Promise((resolve) => http.close(resolve)),
      mcp.close(),
    ]);
    void readFile(pairingFile, 'utf8').then((value) => { if (JSON.parse(value).pid === process.pid) return unlink(pairingFile); }).catch(() => undefined);
    process.exit(0);
  };
  let ownerStdioClosed = false;
  shutdownIfIdle = () => {
    if (ownerStdioClosed && !page && tenants.size === 0) stop();
  };
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  process.stdin.once('end', () => {
    ownerStdioClosed = true;
    event('owner_stdio_closed', { pageConnected: Boolean(page), tenants: tenants.size });
    shutdownIfIdle();
  });
}
