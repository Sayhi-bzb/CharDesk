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

const port = Number(process.env.CHARDESK_MCP_PORT || 9494);
const origins = new Set((process.env.CHARDESK_MCP_ORIGINS
  || 'http://127.0.0.1:5173,http://localhost:5173,https://canvas.chardesk.com').split(','));
const credentialsFile = process.env.CHARDESK_MCP_CREDENTIALS || credentialsPath();
const pairingFile = process.env.CHARDESK_MCP_PAIRING || pairingPath();
let credentials = await loadCredentials(credentialsFile);
const pending = new Map();
let page;
let pageGrant;
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
    page?.close(1000, 'Pairing revoked');
    await publishPairing();
    response.writeHead(204).end();
  } catch { response.writeHead(500).end(); }
});
http.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const token = url.searchParams.get('token');
  if (request.headers.host !== `127.0.0.1:${http.address().port}` || !origins.has(request.headers.origin)
    || url.pathname !== '/bridge' || (token !== null && token !== credentials.token) || Date.now() >= credentials.expiresAt) {
    rejectUpgrade(socket, 403, 'Forbidden'); return;
  }
  if (page) { rejectUpgrade(socket, 409, 'Conflict'); return; }
  sockets.handleUpgrade(request, socket, head, (client) => sockets.emit('connection', client));
});
sockets.on('connection', (client) => {
  page = client;
  pageGrant = undefined;
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
        client.send(JSON.stringify({ method: 'authorized' }));
        return;
      }
      const request = pending.get(response.id);
      if (!request) return; pending.delete(response.id); clearTimeout(request.timer);
      if (typeof response.error === 'string') request.reject(new Error(response.error)); else request.resolve(response.result);
    } catch { client.close(1003, 'Invalid bridge response'); }
  });
  client.on('close', () => {
    clearInterval(expiry); page = undefined;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Canvas page disconnected.')); }
    pending.clear();
  });
});
function forward(name, input) {
  if (Date.now() >= credentials.expiresAt) return Promise.reject(new Error('Pairing expired.'));
  if (!page || page.readyState !== WebSocket.OPEN) return Promise.reject(new Error('Canvas page is not connected.'));
  if (!pageGrant) return Promise.reject(new Error('Canvas authorization is required.'));
  const permission = name.endsWith('_list') ? 'inspect' : name.endsWith('_read') ? 'read' : name.endsWith('_search') ? 'search' : 'write';
  if (!pageGrant.permissions[permission]) return Promise.reject(new Error(`Permission denied: canvas.${permission}`));
  if (pageGrant.scope === 'canvas' && input?.canvasId !== undefined && input.canvasId !== pageGrant.canvasId) {
    return Promise.reject(new Error('Canvas authorization is limited to the paired Canvas.'));
  }
  if (pending.size >= 32 || page.bufferedAmount > 1024 * 1024) return Promise.reject(new Error('Bridge is busy.'));
  const id = randomUUID(); const message = JSON.stringify({ id, method: 'call', params: { name, input } });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Canvas page timed out.')); }, 10_000);
    pending.set(id, { resolve, reject, timer });
    page.send(message, (error) => { if (!error || !pending.delete(id)) return; clearTimeout(timer); reject(error); });
  });
}
const mcp = new Server({ name: 'chardesk-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });
mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
mcp.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  try {
    if (!toolNames.has(params.name)) throw new Error('Unknown Canvas tool.');
    const result = await forward(params.name, params.arguments || {});
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: result?.ok === false };
  } catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
});
await new Promise((resolve, reject) => {
  http.once('error', reject); http.listen(port, '127.0.0.1', resolve);
});
await publishPairing();
console.error(JSON.stringify({ bridgeUrl: pairingUrl(), expiresAt: credentials.expiresAt }));
await mcp.connect(new StdioServerTransport());
const stop = () => {
  for (const client of sockets.clients) client.terminate(); sockets.close(); http.close(); void mcp.close();
  void readFile(pairingFile, 'utf8').then((value) => { if (JSON.parse(value).pid === process.pid) return unlink(pairingFile); }).catch(() => undefined);
};
process.once('SIGTERM', stop); process.once('SIGINT', stop); process.stdin.once('end', stop);
