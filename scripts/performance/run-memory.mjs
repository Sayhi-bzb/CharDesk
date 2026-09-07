import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";

const HOST = "127.0.0.1";
const PORT = 4175;
const URL = `http://${HOST}:${PORT}`;
const REPORT_DIR = path.resolve(
  process.env.CANVAS_MEMORY_REPORT_DIR ?? "test-results/canvas-memory"
);

const waitForServer = (url, timeoutMs = 30_000) => new Promise((resolve, reject) => {
  const startedAt = Date.now();
  const ping = () => {
    const request = http.get(url, (response) => { response.resume(); resolve(); });
    request.on("error", () => {
      if (Date.now() - startedAt > timeoutMs) reject(new Error(`Timed out waiting for ${url}`));
      else setTimeout(ping, 250);
    });
    request.setTimeout(2_000, () => request.destroy());
  };
  ping();
});

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: "inherit", ...options });
  child.on("error", reject);
  child.on("exit", (code, signal) => code === 0
    ? resolve()
    : reject(new Error(`${command} ${args.join(" ")} failed with ${signal ?? `code ${code}`}`)));
});

const preview = spawn(process.execPath, [
  "./node_modules/vite/bin/vite.js",
  "preview",
  "--host", HOST,
  "--port", String(PORT),
  "--strictPort",
], { stdio: "inherit" });
const stop = () => { if (!preview.killed) preview.kill(); };
process.on("exit", stop);
process.on("SIGINT", () => { stop(); process.exit(130); });
process.on("SIGTERM", () => { stop(); process.exit(143); });

let failure;
try {
  await waitForServer(URL);
  await run(process.execPath, [
    "./node_modules/@playwright/test/cli.js",
    "test", "-c", "e2e/playwright.memory.config.ts",
  ], { env: { ...process.env, CANVAS_MEMORY_REPORT_DIR: REPORT_DIR } });
} catch (error) {
  failure = error;
} finally {
  stop();
}
console.log(`Canvas memory report: ${path.join(REPORT_DIR, "report.md")}`);
if (failure) throw failure;
