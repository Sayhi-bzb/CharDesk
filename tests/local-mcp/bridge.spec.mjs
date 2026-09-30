import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import WebSocket from "ws";

test("local stdio MCP reads and edits the connected Canvas, rejects other pages, and detects disconnect", async ({ page, baseURL }, testInfo) => {
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
      await page.getByRole('menuitem', { name: 'Connect local agent', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Connect local agent' });
      await dialog.getByLabel('Pairing URL').fill('ws://remote.example/bridge?token=wrong');
      await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText('Paste the local pairing URL');
      await dialog.getByLabel('Pairing URL').fill(bridgeUrl);
      await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
      await expect(dialog.getByRole('status')).toContainText('Connected · Canvas read/write enabled');
      await page.screenshot({ path: testInfo.outputPath('local-agent-dialog.png') });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(dialog.getByRole('status')).toContainText('Connected · Canvas read/write enabled');
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
    await refused(bridgeUrl, baseURL, 409);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([read, write]);
    expect(tools.find((tool) => tool.name === write).inputSchema.required).toEqual(["at", "content"]);

    const before = await page.screenshot();
    const explanation = "GPU\nMany cores work in parallel\nCPU: one complex task\nGPU: many similar tasks";
    const at = [32, 28];
    const written = await call(write, { at, content: explanation });
    expect(written, JSON.stringify(written)).toMatchObject({ isError: false });
    expect(written.structuredContent).toMatchObject({ canvasId: expect.any(String), bounds: [32, 28, 27, 4] });
    const result = await call(read, { viewport: written.structuredContent.bounds });
    expect(result.structuredContent.content).toContain("Many cores work in parallel");
    await expect.poll(async () => Buffer.compare(before, await page.screenshot())).not.toBe(0);
    await page.screenshot({ path: testInfo.outputPath("gpu-canvas.png") });
    await call(write, { at, content: "你é" });
    expect((await call(read, { viewport: [...at, 3, 1] })).structuredContent.content).toContain("你é");
    const invalid = await call(write, { at: [32.5, 28], content: "bad input" });
    expect(invalid.isError).toBe(true);
    expect(invalid.structuredContent.code).toBe("invalid_input");

    const changed = await page.evaluate(async () => {
      const { getApplicationEditorHost } = await import('/src/app/compositionRoot.ts');
      const canvas = getApplicationEditorHost().canvas;
      const before = canvas.getState().activeCanvasId;
      canvas.commands.sessions.create('freeform');
      return { before, after: canvas.getState().activeCanvasId };
    });
    expect(changed.after).not.toBe(changed.before);
    await expect.poll(async () => (await call(read, {})).isError).toBe(true);

    await page.goto("/blackboard");
    await expect(page.getByTestId("canvas-editor-surface")).toBeVisible();
    await pair();
    expect((await call(write, { at: [0, 0], content: "A" })).structuredContent.code).toBe("source_backed_canvas");
    await page.close();
    await expect.poll(async () => (await call(read, {})).isError).toBe(true);
  } finally {
    await client.close();
    await transport.close();
  }
});
