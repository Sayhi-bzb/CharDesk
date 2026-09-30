import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import WebSocket from "ws";

test("stdio MCP publishes search and forwards its unchanged input and output", { timeout: 10000 }, async () => {
  const origin = "http://127.0.0.1:5173";
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL("./server.mjs", import.meta.url))],
    env: { CHARDESK_BRIDGE_TOKEN: randomBytes(32).toString("hex"), CHARDESK_BRIDGE_ORIGIN: origin }, stderr: "pipe" });
  let stderr = "";
  const ready = new Promise((resolve) => transport.stderr.on("data", (data) => {
    stderr += data.toString();
    const line = stderr.split("\n").find((value) => value.startsWith('{"bridgeUrl"'));
    if (line) resolve(JSON.parse(line).bridgeUrl);
  }));
  const client = new Client({ name: "search-contract-test", version: "0.0.0" });
  let page;
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const search = tools.find(({ name }) => name === "chardesk_canvas_search");
    assert.ok(search);
    assert.equal(search.annotations.readOnlyHint, true);
    assert.deepEqual(search.inputSchema.required, ["query"]);
    assert.equal((await client.callTool({ name: search.name, arguments: { query: "Hello" } })).isError, true);
    page = new WebSocket(await ready, { origin });
    await once(page, "open");
    await once(page, "message");
    page.send(JSON.stringify({ method: "authorize", grant: {
      scope: "application",
      permissions: { inspect: true, read: true, search: true, write: true },
    } }));
    await once(page, "message");
    assert.equal(search.inputSchema.properties.regex.type, "boolean");
    assert.equal(search.inputSchema.properties.ignoreCase.type, "boolean");
    const input = { query: "hello \\w+\nwelcome", regex: true, ignoreCase: true, viewport: [-20, -10, 80, 24], after: [-10, -5] };
    const result = { canvasId: "example", matches: [{ viewport: [-13, -7, 32, 5], content: [" ".repeat(32), " ".repeat(32), `        Hello there${" ".repeat(13)}`, " ".repeat(32), " ".repeat(32)].join("\n") }], next: null };
    const requests = [];
    page.on("message", (data) => {
      const request = JSON.parse(data.toString());
      if (request.method !== "call") return;
      requests.push(request);
      page.send(JSON.stringify({ id: request.id, result }));
    });
    const output = await client.callTool({ name: search.name, arguments: input });
    assert.equal(output.isError, false);
    assert.deepEqual(output.structuredContent, result);
    assert.deepEqual(JSON.parse(output.content[0].text), result);
    assert.deepEqual(requests[0].params, { name: search.name, input });
    assert.equal((await client.callTool({ name: "unknown_tool", arguments: {} })).isError, true);
    assert.equal(requests.length, 1);
  } finally {
    if (page?.readyState === WebSocket.OPEN) {
      const closed = once(page, "close");
      page.close();
      await closed;
    }
    await client.close();
  }
});
