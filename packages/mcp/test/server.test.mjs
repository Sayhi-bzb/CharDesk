import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import WebSocket from 'ws';
import { MCP_NAME, MCP_VERSION } from '../src/version.mjs';

test('published server exposes the Canvas bridge over stdio', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-mcp-test-'));
  const origin = 'http://127.0.0.1:5173';
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../bin/chardesk-mcp.mjs', import.meta.url)), 'server'],
    env: {
      ...process.env,
      CHARDESK_MCP_PORT: '0',
      CHARDESK_MCP_ORIGINS: origin,
      CHARDESK_MCP_CREDENTIALS: join(directory, 'credentials.json'),
      CHARDESK_MCP_PAIRING: join(directory, 'pairing.json'),
      CHARDESK_MCP_UPDATE_CHECK: '0',
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
    assert.deepEqual(client.getServerVersion(), { name: MCP_NAME, version: MCP_VERSION });
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(({ name }) => name), [
      'canvas_code',
      'canvas_erase',
      'canvas_fill',
      'canvas_undo',
      'canvas_render',
      'canvas_manage',
      'canvas_read',
      'canvas_search',
      'canvas_write',
    ]);
    const bridgeUrl = await ready;
    // Browser-first pairing does not expose the credential in the UI; the
    // loopback bridge accepts the fixed local endpoint and authorizes via grant.
    page = new WebSocket(bridgeUrl.replace(/\?token=.*$/, ''), { origin });
    await once(page, 'open');
    await once(page, 'message');
    page.send(JSON.stringify({ method: 'authorize', grant: {
      scope: 'application',
      permissions: { inspect: true, read: true, search: true, write: true },
    } }));
    await once(page, 'message');
    page.on('message', (data) => {
      const request = JSON.parse(data.toString());
      if (request.method === 'call') {
        page.send(JSON.stringify({ id: request.id, result: { ok: true, echoed: request.params } }));
      }
    });
    const pendingResult = client.callTool({
      name: 'canvas_write',
      arguments: { at: [4, 2], content: 'GPU' },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    page.send(JSON.stringify({ method: 'runtime_status', status: { protocolVersion: 2, buildId: 'test', status: 'ready', persistence: 'ready' } }));
    const result = await pendingResult;
    assert.equal(result.isError, false);
    assert.deepEqual(result.structuredContent, {
      ok: true,
      echoed: { name: 'canvas_write', input: { at: [4, 2], content: 'GPU' } },
    });
    const sourcePath = join(directory, 'generated.txt');
    await writeFile(sourcePath, 'script output\nsecond line', 'utf8');
    const sourced = await client.callTool({
      name: 'canvas_write',
      arguments: { at: [4, 3], sourceRef: sourcePath },
    });
    assert.equal(sourced.isError, false);
    assert.deepEqual(sourced.structuredContent, {
      ok: true,
      echoed: { name: 'canvas_write', input: { at: [4, 3], content: 'script output\nsecond line' } },
    });
    const rendered = await client.callTool({
      name: 'canvas_render',
      arguments: { at: [4, 6], sourceRef: sourcePath, format: 'raw' },
    });
    assert.equal(rendered.isError, false);
    assert.deepEqual(rendered.structuredContent, {
      ok: true,
      echoed: { name: 'canvas_render', input: { at: [4, 6], source: 'script output\nsecond line', format: 'raw' } },
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
