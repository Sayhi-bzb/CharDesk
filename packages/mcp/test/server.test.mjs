import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import WebSocket from 'ws';

test('published server exposes the Canvas bridge over stdio', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-mcp-test-'));
  const origin = 'http://127.0.0.1:5173';
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../src/server.mjs', import.meta.url))],
    env: {
      ...process.env,
      CHARDESK_MCP_PORT: '0',
      CHARDESK_MCP_ORIGINS: origin,
      CHARDESK_MCP_CREDENTIALS: join(directory, 'credentials.json'),
      CHARDESK_MCP_PAIRING: join(directory, 'pairing.json'),
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'chardesk-mcp-test', version: '0.0.0' });
  let page;
  let stderr = '';
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('MCP server did not announce pairing.')), 5000);
    transport.stderr.on('data', (data) => {
      stderr += data.toString();
      const line = stderr.split('\n').find((value) => value.startsWith('{"bridgeUrl"'));
      if (!line) return;
      clearTimeout(timer);
      resolve(JSON.parse(line).bridgeUrl);
    });
  });

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(({ name }) => name), [
      'chardesk_canvas_read',
      'chardesk_canvas_search',
      'chardesk_canvas_write',
    ]);
    const bridgeUrl = await ready;
    page = new WebSocket(bridgeUrl, { origin });
    await once(page, 'open');
    await once(page, 'message');
    page.on('message', (data) => {
      const request = JSON.parse(data.toString());
      if (request.method === 'call') {
        page.send(JSON.stringify({ id: request.id, result: { ok: true, echoed: request.params } }));
      }
    });
    const result = await client.callTool({
      name: 'chardesk_canvas_write',
      arguments: { at: [4, 2], content: 'GPU' },
    });
    assert.equal(result.isError, false);
    assert.deepEqual(result.structuredContent, {
      ok: true,
      echoed: { name: 'chardesk_canvas_write', input: { at: [4, 2], content: 'GPU' } },
    });
  } finally {
    if (page?.readyState === WebSocket.OPEN) {
      const closed = once(page, 'close');
      page.close();
      await closed;
    }
    await client.close();
    await rm(directory, { recursive: true, force: true });
  }
});
