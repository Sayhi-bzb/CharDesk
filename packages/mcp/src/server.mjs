import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { BrokerConnection } from './bootstrap.mjs';
import { requestJson } from './http.mjs';
import { BridgeError, cancelled, isWrite, readConfig, requestTimeout, unknownExecution } from './protocol.mjs';
import { toolNames, tools } from './tools.mjs';
import { announceUpdateIfAvailable, MCP_NAME, MCP_VERSION } from './version.mjs';

const lifecycle = new AbortController();
const connection = new BrokerConnection(readConfig(), lifecycle.signal);
const clientId = randomUUID();
const mcp = new Server({ name: MCP_NAME, version: MCP_VERSION }, { capabilities: { tools: {} } });
const transport = new StdioServerTransport();
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  lifecycle.abort();
  const deadline = setTimeout(() => process.exit(0), 1000);
  deadline.unref();
  void mcp.close().catch(() => undefined);
};
process.stdin.once('end', stop);
process.stdin.once('close', stop);
process.stdin.once('error', stop);
process.stdout.once('error', stop);
process.stdout.once('close', stop);
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
mcp.onclose = stop;

mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
mcp.setRequestHandler(CallToolRequestSchema, async ({ params }, extra) => {
  const input = params.arguments || {};
  try {
    if (!toolNames.has(params.name)) throw new BridgeError('invalid_request', 'Unknown Canvas tool.', 400);
    const signal = AbortSignal.any([lifecycle.signal, extra.signal]);
    const broker = await connection.ensure(signal);
    signal.throwIfAborted();
    let response;
    try {
      response = await requestJson(`${broker.baseUrl}/agent/call`, {
        method: 'POST', headers: broker.headers, body: { clientId, name: params.name, input },
        signal, timeout: requestTimeout(params.name) + 2000,
      });
    } catch (error) {
      if (signal.aborted) throw cancelled();
      if (isWrite(params.name, input)) throw unknownExecution('The local bridge connection was lost.');
      throw error instanceof BridgeError ? error : new BridgeError('bridge_unavailable', 'The local bridge connection was lost. Retry the request.');
    }
    if (response.body?.error) throw new BridgeError(response.body.error.code, response.body.error.message, response.status);
    if (response.status !== 200 || !response.body || !Object.hasOwn(response.body, 'result')) throw new BridgeError('invalid_response', 'Local MCP returned an invalid result.', 502);
    const result = response.body.result;
    const blocks = Array.isArray(result?.contentBlocks)
      ? result.contentBlocks.map((block) => block.type === 'note' ? { type: 'text', text: block.text } : block)
      : [{ type: 'text', text: JSON.stringify(result) }];
    return { content: blocks, structuredContent: result, isError: result?.ok === false };
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: `[${error.code || 'bridge_unavailable'}] ${error.message || 'Canvas request failed.'}` }] };
  }
});

await mcp.connect(transport);
if (process.stdin.readableEnded || process.stdin.destroyed) stop();
if (!stopping) {
  void connection.ensure().then(({ health }) => {
    console.error(JSON.stringify({ event: 'mcp.bridge_ready', instanceId: health.instanceId, pid: health.pid, version: health.version }));
  }, (error) => { if (!stopping) console.error(`[${error.code || 'bridge_unavailable'}] ${error.message}`); });
  void announceUpdateIfAvailable();
}
