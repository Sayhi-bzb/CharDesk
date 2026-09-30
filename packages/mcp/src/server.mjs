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
  if (request.method !== 'POST' || request.url !== '/revoke'
    || request.headers.host !== `127.0.0.1:${http.address().port}`
    || request.headers.origin || request.headers.authorization !== `Bearer ${credentials.token}`) {
    response.writeHead(403).end(); return;
  }
  try {
    await unlink(credentialsFile).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    credentials = await loadCredentials(credentialsFile);
    page?.close(1000, 'Pairing revoked');
    await publishPairing();
    response.writeHead(204).end();
  } catch { response.writeHead(500).end(); }
});
http.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (request.headers.host !== `127.0.0.1:${http.address().port}` || !origins.has(request.headers.origin)
    || url.pathname !== '/bridge' || url.searchParams.get('token') !== credentials.token || Date.now() >= credentials.expiresAt) {
    rejectUpgrade(socket, 403, 'Forbidden'); return;
  }
  if (page) { rejectUpgrade(socket, 409, 'Conflict'); return; }
  sockets.handleUpgrade(request, socket, head, (client) => sockets.emit('connection', client));
});
sockets.on('connection', (client) => {
  page = client;
  client.send(JSON.stringify({ method: 'paired', expiresAt: credentials.expiresAt }));
  const expiry = setInterval(() => { if (Date.now() >= credentials.expiresAt) client.close(1000, 'Pairing expired'); }, 60_000);
  expiry.unref();
  client.on('error', () => client.terminate());
  client.on('message', (data) => {
    try {
      const response = JSON.parse(data.toString()); const request = pending.get(response.id);
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
