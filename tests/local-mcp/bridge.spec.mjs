import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import WebSocket from "ws";

test("local stdio MCP reads and edits multiple Canvases after one application pairing", async ({ page, baseURL }, testInfo) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("./server.mjs", import.meta.url))],
    env: { CHARDESK_BRIDGE_TOKEN: randomBytes(32).toString("hex"), CHARDESK_BRIDGE_ORIGIN: baseURL },
    stderr: "pipe",
  });
  let stderr = "";
  const ready = new Promise((resolve) => transport.stderr.on("data", (data) => {
    stderr += data.toString();
    const line = stderr.split("\n").find((line) => line.startsWith('{"bridgeUrl"'));
    if (line) resolve(JSON.parse(line).bridgeUrl);
  }));
  const client = new Client({ name: "test-coding-agent", version: "0.0.0" });
  try {
    await client.connect(transport);
    const bridgeUrl = await ready;
    const call = (name, args) => client.callTool({ name, arguments: args });
    const read = "chardesk_canvas_read";
    const write = "chardesk_canvas_write";
    const search = "chardesk_canvas_search";
    const { tools } = await client.listTools();
    const manage = "chardesk_canvas_manage";
    expect(tools.map((tool) => tool.name).sort()).toEqual([manage, read, search, write]);
    expect(tools.find((tool) => tool.name === search).annotations.readOnlyHint).toBe(true);
    expect(tools.find((tool) => tool.name === write).inputSchema.required).toEqual(["at", "content"]);
    expect((await call(read, {})).isError).toBe(true);

    const refused = async (url, origin, status) => {
      await new Promise((resolve, reject) => {
        const socket = new WebSocket(url, { origin });
        socket.on("unexpected-response", (_request, response) => {
          const code = response.statusCode;
          response.resume();
          socket.terminate();
          if (code === status) resolve();
          else reject(new Error(`Expected ${status}, got ${code}`));
        });
        socket.on("open", () => { socket.close(); reject(new Error("Unauthorized connection accepted")); });
        socket.on("error", () => undefined);
      });
    };
    await refused(bridgeUrl, "https://untrusted.example", 403);
    await refused(bridgeUrl.replace(/token=.*/, "token=wrong"), baseURL, 403);

    const pair = async () => {
      await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      await page.getByRole('menuitem', { name: /^Agent/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Agent', exact: true });
      await expect(dialog.getByRole('group', { name: 'WebMCP', exact: true }).getByRole('status')).toHaveText('Unavailable');
      await expect(dialog.getByLabel('Pairing URL')).not.toBeVisible();
      await dialog.getByRole('button', { name: 'Pair', exact: true }).click();
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await dialog.getByRole('button', { name: 'Copy command', exact: true }).click();
      await expect(dialog.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('npm run mcp:pair');
      await page.screenshot({ path: testInfo.outputPath('local-agent-setup.png') });
      await dialog.getByLabel('Pairing URL').fill('ws://remote.example/bridge?token=wrong');
      await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('Invalid pairing URL');
      await dialog.getByLabel('Pairing URL').fill(bridgeUrl);
      await dialog.getByRole('checkbox', { name: 'Remember on this browser · 30 days' }).check();
      await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(dialog.getByRole('group', { name: 'Local MCP', exact: true }).getByRole('status')).toHaveText('Connected');
      await expect(dialog.getByText('Auto-connect on this browser')).toBeVisible();
      await expect(dialog.getByLabel('Pairing URL')).not.toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('local-agent-dialog.png') });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(dialog.getByRole('group', { name: 'Local MCP', exact: true }).getByRole('status')).toHaveText('Connected');
      expect(await dialog.evaluate((element) => element.getBoundingClientRect().right)).toBeLessThanOrEqual(390);
      await page.screenshot({ path: testInfo.outputPath('local-agent-dialog-mobile.png') });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    };
    await page.goto("/");
    await expect(page.getByTestId("canvas-editor-surface")).toBeVisible();
    expect(await page.evaluate(() => Boolean(document.modelContext))).toBe(false);
    await pair();
    await page.reload();
    await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
    await expect.poll(async () => (await call(read, {})).isError).toBe(false);
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    const agentItem = page.getByRole('menuitem', { name: 'Agent Connected', exact: true });
    await expect(agentItem).toBeVisible();
    await expect(agentItem.getByText('Connected', { exact: true })).toHaveClass(/\bsr-only\b/);
    await page.screenshot({ path: testInfo.outputPath('local-agent-menu.png') });
    await page.keyboard.press('Escape');
    await refused(bridgeUrl, baseURL, 409);

    const before = await page.screenshot();
    const explanation = "GPU\nMany cores work in parallel\nCPU: one complex task\nGPU: many similar tasks";
    const at = [32, 28];
    const written = await call(write, { at, content: explanation });
    expect(written, JSON.stringify(written)).toMatchObject({ isError: false });
    expect(written.structuredContent).toMatchObject({ bounds: [32, 28, 27, 4] });
    const result = await call(read, { viewport: written.structuredContent.bounds });
    expect(result.structuredContent.content).toContain("Many cores work in parallel");
    const found = await call(search, { query: "Many cores", viewport: written.structuredContent.bounds });
    expect(found.structuredContent).toMatchObject({
      matches: [{ origin: [32, 29], bounds: [32, 29, 10, 1], content: "Many cores" }], next: null });
    expect((await call(read, { viewport: found.structuredContent.matches[0].bounds })).structuredContent.content).toContain("Many cores");
    await expect.poll(async () => Buffer.compare(before, await page.screenshot())).not.toBe(0);
    await page.screenshot({ path: testInfo.outputPath("gpu-canvas.png") });
    await call(write, { at, content: "你é" });
    expect((await call(read, { viewport: [...at, 3, 1] })).structuredContent.content).toContain("你é");
    const invalid = await call(write, { at: [32.5, 28], content: "bad input" });
    expect(invalid.isError).toBe(true);
    expect(invalid.structuredContent.code).toBe("invalid_input");

    const listed = await call(manage, { action: "list" });
    const originalCanvasId = listed.structuredContent.currentCanvasId;

    await page.getByRole('button', { name: 'Select canvas', exact: true }).click();
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('menuitem', { name: 'New Freeform', exact: true }).click();
    await expect.poll(async () => (await call(read, {})).isError).toBe(false);
    const canvases = await call(manage, { action: "list" });
    expect(canvases.structuredContent.canvases.length).toBeGreaterThanOrEqual(2);
    const secondWrite = await call(write, { canvasId: originalCanvasId, at: [32, 28], content: "updated from another Canvas" });
    expect(secondWrite, JSON.stringify(secondWrite)).toMatchObject({ isError: false, structuredContent: { canvasId: originalCanvasId } });
    expect((await call(read, { canvasId: originalCanvasId, viewport: [32, 28, 28, 1] })).structuredContent.content).toContain("updated from another Canvas");

    await page.goto("/blackboard");
    await expect(page).toHaveURL(/workspace$/);
    await expect(page.getByRole("table", { name: "My workspace" })).toBeVisible();
    await expect.poll(async () => (await call(read, {})).isError).toBe(true);
    await page.close();
    await expect.poll(async () => (await call(read, {})).isError).toBe(true);
  } finally {
    await client.close();
    await transport.close();
  }
});

test('remembered pairing survives MCP restart and can be revoked or forgotten', async ({ page, baseURL }, testInfo) => {
  test.setTimeout(45_000);
  const directory = await mkdtemp(join(tmpdir(), 'chardesk-mcp-restart-'));
  let transport;
  let client;
  let bridgeUrl;
  const start = async (port = '0') => {
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL('./server.mjs', import.meta.url))],
      env: { CHARDESK_BRIDGE_PORT: port, CHARDESK_BRIDGE_ORIGIN: baseURL,
        CHARDESK_BRIDGE_PAIRING_FILE: join(directory, 'pairing.json') }, stderr: 'pipe',
    });
    let stderr = '';
    const ready = new Promise((resolve) => transport.stderr.on('data', (data) => {
      stderr += data.toString();
      const line = stderr.split('\n').find((entry) => entry.startsWith('{"bridgeUrl"'));
      if (line) resolve(JSON.parse(line).bridgeUrl);
    }));
    client = new Client({ name: 'pairing-regression', version: '0.0.0' });
    await client.connect(transport);
    bridgeUrl = await ready;
  };
  const read = () => client.callTool({ name: 'chardesk_canvas_read', arguments: {} });
  const openDialog = async () => {
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Agent/ }).click();
    return page.getByRole('dialog', { name: 'Agent', exact: true });
  };
  try {
    await start();
    const originalUrl = bridgeUrl;
    await page.goto('/');
    await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
    const dialog = await openDialog();
    await dialog.getByRole('button', { name: 'Pair', exact: true }).click();
    await dialog.getByLabel('Pairing URL').fill(bridgeUrl);
    await dialog.getByRole('checkbox', { name: 'Remember on this browser · 30 days' }).check();
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Forget pairing' })).toBeVisible();
    await client.close();
    await transport.close();
    await start(new URL(originalUrl).port);
    expect(bridgeUrl).toBe(originalUrl);
    await expect.poll(async () => (await read()).isError, { timeout: 15_000 }).toBe(false);
    await expect(dialog.getByRole('group', { name: 'Local MCP', exact: true }).getByRole('status')).toContainText('Connected');
    await page.screenshot({ path: testInfo.outputPath('remembered-agent.png') });

    const url = new URL(bridgeUrl);
    const denied = await fetch(`http://127.0.0.1:${url.port}/revoke`, { method: 'POST' });
    expect(denied.status).toBe(403);
    const revoked = await fetch(`http://127.0.0.1:${url.port}/revoke`, {
      method: 'POST', headers: { authorization: `Bearer ${url.searchParams.get('token')}` },
    });
    expect(revoked.status).toBe(204);
    await expect(dialog.getByRole('group', { name: 'Local MCP', exact: true }).getByRole('status')).toHaveText('Offline');
    await expect(dialog.getByRole('alert')).toContainText('Start Pi or pair again');
    expect((await read()).isError).toBe(true);
    await dialog.getByRole('button', { name: 'Forget pairing' }).click();
    await expect(dialog.getByRole('button', { name: 'Forget pairing' })).not.toBeVisible();
    await page.reload();
    await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();
    expect((await read()).isError).toBe(true);
  } finally {
    await client?.close();
    await transport?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
