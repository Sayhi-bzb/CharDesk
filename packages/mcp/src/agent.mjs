import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { WebSocket } from 'ws';
import { pairingPath } from './paths.mjs';
import { toolNames, tools } from './tools.mjs';

const file = process.env.CHARDESK_MCP_PAIRING || pairingPath();
const pairing = JSON.parse(await readFile(file, 'utf8'));
if (typeof pairing.bridgeUrl !== 'string' || !Number.isFinite(pairing.expiresAt) || pairing.expiresAt <= Date.now()) {
  throw new Error('The existing CharDesk MCP pairing is missing or expired.');
}
try { process.kill(pairing.pid, 0); } catch { throw new Error('The existing CharDesk MCP broker is not running.'); }
const bridge = new URL(pairing.bridgeUrl);
const configuredPort = Number(process.env.CHARDESK_MCP_PORT || 9494);
if (bridge.protocol !== 'ws:' || bridge.hostname !== '127.0.0.1' || bridge.pathname !== '/bridge'
  || (configuredPort !== 0 && Number(bridge.port) !== configuredPort)) {
  throw new Error('The existing CharDesk MCP pairing does not match this bridge.');
}
bridge.pathname = '/agent';
const socket = new WebSocket(bridge);
const debug = process.env.CHARDESK_MCP_DEBUG === '1';
const event = (name, details = {}) => { if (debug) console.error(JSON.stringify({ event: `mcp.agent.${name}`, at: new Date().toISOString(), ...details })); };
const pending = new Map();
let sessionToken;
let ready;
let resolveReady;
let rejectReady;
ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });

socket.on('open', () => { event('connected'); socket.send(JSON.stringify({ method: 'tenant_hello', clientId: randomUUID() })); });
socket.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    if (message.method === 'tenant_ready') {
      sessionToken = message.sessionToken;
      resolveReady(message);
      return;
    }
    if (typeof message.id !== 'string') return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (typeof message.error === 'string') request.reject(new Error(message.error));
    else request.resolve(message.result);
  } catch (error) { rejectReady(error); }
});
socket.on('error', (error) => {
  event('error', { message: error instanceof Error ? error.message : String(error) });
  rejectReady(error);
  for (const request of pending.values()) request.reject(error);
  pending.clear();
});
socket.on('close', () => {
  event('closed', { code: socket.closeCode, reason: socket.closeReason });
  const error = new Error('CharDesk MCP bridge disconnected.');
  rejectReady(error);
  for (const request of pending.values()) request.reject(error);
  pending.clear();
});

const forward = async (name, input) => {
  await ready;
  if (!sessionToken || socket.readyState !== WebSocket.OPEN) throw new Error('CharDesk MCP bridge is not connected.');
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method: 'call', sessionToken, params: { name, input } }), (error) => {
      if (!error || !pending.delete(id)) return;
      reject(error);
    });
  });
};

const mcp = new Server({ name: 'chardesk-mcp-tenant', version: '0.1.0' }, { capabilities: { tools: {} } });
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
await mcp.connect(new StdioServerTransport());
