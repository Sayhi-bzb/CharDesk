import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import WebSocket from 'ws';

const nextMessage = (socket) => new Promise((resolve, reject) => {
  const onMessage = (data) => { cleanup(); resolve(JSON.parse(data.toString())); };
  const onError = (error) => { cleanup(); reject(error); };
  const cleanup = () => { socket.off('message', onMessage); socket.off('error', onError); };
  socket.on('message', onMessage); socket.on('error', onError);
});

test('a second server command joins the existing broker as a tenant', { timeout: 15_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-mcp-agent-proxy-'));
  const env = { ...process.env, CHARDESK_MCP_PORT: '0', CHARDESK_MCP_ORIGINS: 'http://127.0.0.1:5173',
    CHARDESK_MCP_CREDENTIALS: join(directory, 'credentials.json'), CHARDESK_MCP_PAIRING: join(directory, 'pairing.json') };
  const command = fileURLToPath(new URL('../bin/chardesk-mcp.mjs', import.meta.url));
  const serverSource = fileURLToPath(new URL('../src/server.mjs', import.meta.url));
  const owner = spawn(process.execPath, [command, 'server'], { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let page;
  let client;
  try {
    let stderr = '';
    const pairing = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Owner broker did not announce pairing.')), 5_000);
      owner.stderr.on('data', (data) => {
        stderr += data.toString();
        const line = stderr.split('\n').find((value) => value.startsWith('{'));
        if (!line) return;
        clearTimeout(timer); resolve(JSON.parse(line));
      });
      owner.once('error', reject);
    });
    const pageUrl = new URL(pairing.bridgeUrl); pageUrl.search = '';
    page = await new Promise((resolve, reject) => {
      const socket = new WebSocket(pageUrl, { origin: 'http://127.0.0.1:5173' });
      socket.once('open', () => resolve(socket)); socket.once('error', reject);
    });
    assert.equal((await nextMessage(page)).method, 'paired');
    page.send(JSON.stringify({ method: 'authorize', grant: { scope: 'application', permissions: { inspect: true, read: true, search: true, write: true } } }));
    assert.equal((await nextMessage(page)).method, 'authorized');
    page.send(JSON.stringify({ method: 'runtime_status', status: { protocolVersion: 2, buildId: 'test', status: 'ready', persistence: 'ready' } }));

    const port = new URL(pairing.bridgeUrl).port;
    const transport = new StdioClientTransport({ command: process.execPath, args: [serverSource], env: { ...env, CHARDESK_MCP_PORT: port } });
    client = new Client({ name: 'tenant-proxy-test', version: '0.0.0' });
    await client.connect(transport);
    const listed = await client.listTools();
    assert.ok(listed.tools.some(({ name }) => name === 'canvas_read'));
    const resultPromise = client.callTool({ name: 'canvas_read', arguments: { viewport: [0, 0, 1, 1] } });
    const request = await nextMessage(page);
    page.send(JSON.stringify({ id: request.id, result: { ok: true, tenant: 'proxy' } }));
    const result = await resultPromise;
    assert.deepEqual(result.structuredContent, { ok: true, tenant: 'proxy' });
    owner.stdin.end();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const survivesOwnerExit = client.callTool({ name: 'canvas_read', arguments: { viewport: [0, 0, 1, 1] } });
    const survivingRequest = await nextMessage(page);
    page.send(JSON.stringify({ id: survivingRequest.id, result: { ok: true, afterOwnerStdio: true } }));
    assert.deepEqual((await survivesOwnerExit).structuredContent, { ok: true, afterOwnerStdio: true });
    await client.close();
  } finally {
    page?.close(); owner.kill('SIGTERM');
    await once(owner, 'close').catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
});
