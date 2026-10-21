import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fixture } from './fixture.mjs';
import { MCP_NAME, MCP_VERSION } from '../src/version.mjs';

test('stdio preserves tools, sourceRef and visual content through HTTP', async (t) => {
  const f = await fixture(t);
  await f.page();
  const client = await f.client();
  assert.deepEqual(client.getServerVersion(), { name: MCP_NAME, version: MCP_VERSION });
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(({ name }) => name), [
    'canvas_code', 'canvas_erase', 'canvas_fill', 'canvas_undo', 'canvas_render',
    'canvas_manage', 'canvas_read', 'canvas_search', 'canvas_write',
  ]);
  const sourcePath = join(f.directory, 'source.txt');
  await writeFile(sourcePath, 'script output\nsecond line');
  for (const [name, input, resolved] of [
    ['canvas_write', { at: [4, 2], content: 'GPU' }, { at: [4, 2], content: 'GPU' }],
    ['canvas_write', { at: [4, 3], sourceRef: sourcePath }, { at: [4, 3], content: 'script output\nsecond line' }],
    ['canvas_render', { at: [4, 6], sourceRef: sourcePath, format: 'raw' }, { at: [4, 6], source: 'script output\nsecond line', format: 'raw' }],
  ]) {
    const result = await client.callTool({ name, arguments: input });
    assert.equal(result.isError, false);
    assert.deepEqual(result.structuredContent, { ok: true, echoed: { name, input: resolved } });
  }
  assert.equal((await f.health()).activeRequests, 0);
  assert.equal((await f.health()).activeCallers, 0);
});

test('MCP reports page readiness errors without closing its transport', async (t) => {
  const f = await fixture(t);
  const client = await f.client();
  const unavailable = await client.callTool({ name: 'canvas_manage', arguments: { action: 'list' } });
  assert.equal(unavailable.isError, true);
  assert.match(unavailable.content[0].text, /page_unavailable/);
  await f.page({ reply: () => ({ ok: true, contentBlocks: [
    { type: 'note', text: 'visible note' }, { type: 'text', text: 'exact text' },
  ] }) });
  const result = await client.callTool({ name: 'canvas_read', arguments: {} });
  assert.deepEqual(result.content, [{ type: 'text', text: 'visible note' }, { type: 'text', text: 'exact text' }]);
});
