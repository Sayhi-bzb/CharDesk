import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const waitForJsonLine = (stream) => new Promise((resolve, reject) => {
  let buffer = '';
  const onData = (data) => {
    buffer += data.toString();
    const line = buffer.split('\n').find((value) => value.startsWith('{'));
    if (!line) return;
    stream.off('data', onData);
    resolve(JSON.parse(line));
  };
  stream.on('data', onData);
  stream.once('error', reject);
});

const connect = (url, options) => new Promise((resolve, reject) => {
  const socket = new WebSocket(url, options);
  socket.once('open', () => resolve(socket));
  socket.once('error', reject);
});

const nextMessage = (socket) => new Promise((resolve, reject) => {
  const onMessage = (data) => { cleanup(); resolve(JSON.parse(data.toString())); };
  const onError = (error) => { cleanup(); reject(error); };
  const cleanup = () => { socket.off('message', onMessage); socket.off('error', onError); };
  socket.on('message', onMessage); socket.on('error', onError);
});

test('one browser page serves multiple isolated Agent tenants', { timeout: 15_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-mcp-multitenant-'));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../bin/chardesk-mcp.mjs', import.meta.url)), 'server'], {
    env: { ...process.env, CHARDESK_MCP_PORT: '0', CHARDESK_MCP_ORIGINS: 'http://127.0.0.1:5173',
      CHARDESK_MCP_CREDENTIALS: join(directory, 'credentials.json'), CHARDESK_MCP_PAIRING: join(directory, 'pairing.json') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let page;
  const agents = [];
  try {
    const announced = await waitForJsonLine(child.stderr);
    const pairing = new URL(announced.bridgeUrl);
    const pageUrl = new URL(pairing); pageUrl.search = '';
    page = await connect(pageUrl, { origin: 'http://127.0.0.1:5173' });
    assert.equal((await nextMessage(page)).method, 'paired');
    page.send(JSON.stringify({ method: 'authorize', grant: { scope: 'application', permissions: { inspect: true, read: true, search: true, write: true } } }));
    assert.equal((await nextMessage(page)).method, 'authorized');

    const openAgent = async () => {
      const agentUrl = new URL(pairing); agentUrl.pathname = '/agent';
      const socket = await connect(agentUrl);
      agents.push(socket);
      socket.send(JSON.stringify({ method: 'tenant_hello', clientId: randomUUID() }));
      const ready = await nextMessage(socket);
      assert.equal(ready.method, 'tenant_ready');
      return { socket, token: ready.sessionToken, id: ready.tenantId };
    };
    const first = await openAgent();
    const second = await openAgent();
    assert.notEqual(first.id, second.id);
    assert.notEqual(first.token, second.token);

    const call = (agent, id) => new Promise((resolve, reject) => {
      const onMessage = (data) => {
        const message = JSON.parse(data.toString());
        if (message.id !== id) return;
        agent.socket.off('message', onMessage);
        if (message.error) reject(new Error(message.error)); else resolve(message.result);
      };
      agent.socket.on('message', onMessage);
      agent.socket.send(JSON.stringify({ id, method: 'call', sessionToken: agent.token, params: { name: 'chardesk_canvas_read', input: { viewport: [0, 0, 1, 1] } } }));
    });
    const firstCall = call(first, 'same-id');
    const secondCall = call(second, 'same-id');
    const pageRequests = [await nextMessage(page), await nextMessage(page)];
    assert.equal(pageRequests.length, 2);
    for (const request of pageRequests) page.send(JSON.stringify({ id: request.id, result: { canvasId: request.params.name } }));
    assert.deepEqual(await firstCall, { canvasId: 'chardesk_canvas_read' });
    assert.deepEqual(await secondCall, { canvasId: 'chardesk_canvas_read' });

    first.socket.close();
    await new Promise((resolve) => first.socket.once('close', resolve));
    const surviving = call(second, 'surviving');
    const request = await nextMessage(page);
    page.send(JSON.stringify({ id: request.id, result: { ok: true } }));
    assert.deepEqual(await surviving, { ok: true });
  } finally {
    page?.close();
    for (const agent of agents) agent.close();
    child.kill('SIGTERM');
    await once(child, 'close').catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
});
