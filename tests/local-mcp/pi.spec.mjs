import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("Pi's real model reads, writes a GPU explanation, and verifies the live Canvas", async ({ page }, testInfo) => {
  test.skip(process.env.CHARDESK_TEST_PI !== "1", "Opt-in: uses the installed Pi agent and its configured model credentials.");
  test.setTimeout(180_000);
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(9494, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => reservation.close(resolve));
  const root = fileURLToPath(new URL("../../", import.meta.url));
  await page.goto("/");
  await expect(page.getByTestId('canvas-editor-surface')).toBeVisible();

  const pi = spawn(process.env.PI_EXECUTABLE || "pi", [
    "--mode", "rpc", "--no-session", "--approve",
    "--no-context-files", "--no-skills", "--no-prompt-templates",
    "--no-builtin-tools",
  ], {
    cwd: root,
    env: { ...process.env, PI_OFFLINE: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  let diagnostics = "";
  const events = [];
  const waiters = new Set();
  pi.stderr.on("data", (data) => { diagnostics += data.toString().replace(/token=[a-f0-9]{64}/g, 'token=[redacted]'); });
  pi.stdout.on("data", (data) => {
    output += data.toString();
    let newline;
    while ((newline = output.indexOf("\n")) >= 0) {
      const line = output.slice(0, newline);
      output = output.slice(newline + 1);
      try {
        const event = JSON.parse(line);
        events.push(event);
        for (const waiter of waiters) waiter(event);
      } catch { diagnostics += line.replace(/token=[a-f0-9]{64}/g, 'token=[redacted]') + '\n'; }
    }
  });
  const exited = new Promise((resolve) => pi.once("exit", resolve));
  const settled = new Promise((resolve, reject) => {
    waiters.add((event) => {
      if (event.type === "agent_settled") resolve();
      if (event.type === "response" && event.success === false) reject(new Error(event.error));
    });
    pi.once("error", reject);
    pi.once("exit", (code) => reject(new Error(`Pi exited early (${code}): ${diagnostics.slice(-2000)}`)));
  });
  // Observe a premature startup failure without an unhandled rejection.
  void settled.catch(() => undefined);
  try {
    await expect.poll(async () => {
      if (pi.exitCode !== null) throw new Error(`Pi startup failed: ${diagnostics.slice(-2000)}`);
      return await new Promise((resolve) => {
        const socket = createServer();
        socket.once('error', () => resolve(false));
        socket.once('listening', () => socket.close(() => resolve(true)));
        socket.listen(9494, '127.0.0.1');
      });
    }, { timeout: 15_000, message: 'Pi did not start the Chardesk MCP bridge on 127.0.0.1:9494.' }).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    await page.getByRole('menuitem', { name: /^Agent/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Agent', exact: true });
    await dialog.getByRole('button', { name: 'Pair', exact: true }).click();
    await dialog.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(dialog.getByRole('group', { name: 'Local MCP', exact: true }).getByRole('status')).toHaveText('Connected');
    await page.keyboard.press('Escape');
    const before = await page.screenshot();
    pi.stdin.write(`${JSON.stringify({ type: "prompt", id: "gpu", message:
      "I want to understand GPUs. Use only the connected canvas_read and canvas_write tools. "
      + "First read viewport [32,28,35,4]. Then write your own simple English explanation at [32,28]: "
      + "exactly four lines, at most 32 cells per line, containing GPU and comparing CPU with GPU. "
      + "Do not include markdown syntax or copy coordinate rulers. Then read the returned write bounds to verify. "
      + "Finish with a short confirmation. Do not change files or execute shell commands." })}\n`);
    await Promise.race([settled, new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error("Pi model run timed out.")), 120_000);
      timer.unref();
    })]);
    const calls = events.filter((event) => event.type === "tool_execution_start");
    await writeFile(testInfo.outputPath('pi-events.json'), JSON.stringify(events, null, 2));
    expect(events.filter((event) => event.type === 'tool_execution_end' && event.isError)
      .map((event) => event.result)).toEqual([]);
    expect(calls.map((event) => event.toolName).filter((name) => name !== "mcp__chardesk__canvas_manage")).toEqual([
      "mcp__chardesk__canvas_read", "mcp__chardesk__canvas_write",
      "mcp__chardesk__canvas_read",
    ]);
    expect(events.filter((event) => event.type === "tool_execution_end").every((event) => !event.isError)).toBe(true);
    const written = calls[1].args;
    expect(written.at).toEqual([32, 28]);
    expect(written.content).toContain("GPU");
    expect(written.content).toContain("CPU");
    expect(written.content.split("\n")).toHaveLength(4);
    const verified = events.filter((event) => event.type === 'tool_execution_end').at(-1);
    const actual = JSON.parse(verified.result.content.find((part) => part.type === 'text').text);
    for (const line of written.content.split("\n")) expect(actual.content).toContain(line);
    await expect.poll(async () => Buffer.compare(before, await page.screenshot())).not.toBe(0);
    await page.screenshot({ path: testInfo.outputPath("pi-gpu-canvas.png") });
    await testInfo.attach("pi-tool-calls", {
      body: JSON.stringify(events.filter((event) => event.type.startsWith("tool_execution_")), null, 2),
      contentType: "application/json",
    });
  } finally {
    pi.stdin.end();
    const timer = setTimeout(() => pi.kill("SIGTERM"), 5_000);
    await exited;
    clearTimeout(timer);
  }
});
