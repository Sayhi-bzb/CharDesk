import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startBroker } from '../src/broker.mjs';
import { inspectBroker } from '../src/bootstrap.mjs';
import { requestJson } from '../src/http.mjs';
import { readConfig } from '../src/protocol.mjs';

export const command = fileURLToPath(new URL('../bin/chardesk-mcp.mjs', import.meta.url));
export const waitFor = async (check, timeout = 5000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await delay(10);
  }
  throw new Error('Test condition timed out.');
};
export const freePort = async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
};

export async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-mcp-test-'));
  const env = {
    ...process.env, CHARDESK_MCP_PORT: String(options.port || 0),
    CHARDESK_MCP_ORIGINS: 'http://127.0.0.1:5173',
    CHARDESK_MCP_CREDENTIALS: join(directory, 'credentials.json'),
    CHARDESK_MCP_PAIRING: join(directory, 'pairing.json'),
    CHARDESK_MCP_OPEN_CANVAS: '0', CHARDESK_MCP_UPDATE_CHECK: '0',
  };
  const config = readConfig(env);
  let broker;
  const pages = [];
  const processes = [];
  const clients = [];
  t.after(async () => {
    for (const page of pages) page.terminate();
    await Promise.all(clients.map((client) => client.close().catch(() => {})));
    for (const tracked of processes) if (!tracked.exit) tracked.child.kill('SIGTERM');
    await Promise.all(processes.map((tracked) => waitFor(() => tracked.exit).catch(() => tracked.child.kill('SIGKILL'))));
    if (broker) await broker.stop();
    else {
      const running = await inspectBroker(config, { control: true }).catch(() => null);
      if (running) {
        await requestJson(`${running.baseUrl}/shutdown`, { method: 'POST', headers: running.headers }).catch(() => {});
        await waitFor(async () => !(await inspectBroker(config).catch(() => null)));
      }
    }
    await rm(directory, { recursive: true, force: true });
  });
  const restart = async () => {
    broker = await startBroker({ ...options, config });
    config.port = Number(new URL(broker.pairing.bridgeUrl).port);
    env.CHARDESK_MCP_PORT = String(config.port);
    return broker;
  };
  if (options.start !== false) await restart();
  const running = () => inspectBroker(config);
  const health = async () => (await running()).health;
  const call = async (name, input, { clientId = randomUUID(), signal, headers } = {}) => {
    const current = await running();
    return requestJson(`${current.baseUrl}/agent/call`, {
      method: 'POST', headers: headers || current.headers, body: { clientId, name, input }, signal,
    });
  };
  const page = async ({ reply = (message) => ({ ok: true, echoed: message.params }), grant } = {}) => {
    const current = await running();
    const url = new URL(current.pairing.bridgeUrl); url.search = '';
    const socket = new WebSocket(url, { origin: env.CHARDESK_MCP_ORIGINS });
    pages.push(socket);
    const calls = [];
    socket.on('error', () => {});
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.method === 'paired') socket.send(JSON.stringify({ method: 'authorize', grant: grant || {
        scope: 'application', permissions: { inspect: true, read: true, search: true, write: true },
      } }));
      if (message.method === 'ready_probe') socket.send(JSON.stringify({ method: 'ready', protocolVersion: 1 }));
      if (message.method === 'call') {
        calls.push(message);
        if (reply) socket.send(JSON.stringify({ id: message.id, result: reply(message) }));
      }
    });
    await waitFor(async () => (await health()).pageReady);
    return { socket, calls, respond: (message, result) => socket.send(JSON.stringify({ id: message.id, result })) };
  };
  const client = async () => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [command], env, stderr: 'pipe' });
    transport.stderr.on('data', () => {});
    const client = new Client({ name: 'mcp-test', version: '1' });
    clients.push(client);
    await client.connect(transport);
    return client;
  };
  const raw = (args = []) => {
    const child = spawn(process.execPath, [command, ...args], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    const tracked = { child, exit: null, stderr: '', stdout: '', messages: [] };
    processes.push(tracked);
    child.stdin.on('error', () => {});
    child.stderr.on('data', (chunk) => { tracked.stderr += chunk; });
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      tracked.stdout += chunk;
      buffer += chunk;
      while (buffer.includes('\n')) {
        const newline = buffer.indexOf('\n');
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        try { tracked.messages.push(JSON.parse(line)); } catch {}
      }
    });
    child.once('exit', (code, signal) => { tracked.exit = { code, signal }; });
    tracked.send = (message) => child.stdin.write(JSON.stringify(message) + '\n');
    tracked.initialize = async () => {
      tracked.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'raw-test', version: '1' },
      } });
      await waitFor(() => tracked.messages.find((message) => message.id === 1) || tracked.exit);
      assert.equal(tracked.exit, null, tracked.stderr);
      tracked.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    };
    return tracked;
  };
  return { directory, env, config, restart, get broker() { return broker; }, running, health, call, page, client, raw };
}
