import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";

const HOST = "127.0.0.1";
const PORT = 4174;
const URL = `http://${HOST}:${PORT}`;
const REPORT_DIR = path.resolve(
  process.env.CANVAS_STRESS_REPORT_DIR ?? path.join("test-results", "canvas-stress")
);

const waitForServer = (url, timeoutMs = 30_000) =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const ping = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });
      request.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(ping, 250);
      });
      request.setTimeout(2_000, () => request.destroy());
    };
    ping();
  });

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed with ${signal ?? `code ${code}`}`));
    });
  });

const preview = spawn(
  process.execPath,
  [
    "./node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    HOST,
    "--port",
    String(PORT),
    "--strictPort",
  ],
  { stdio: "inherit" }
);

const stopPreview = () => {
  if (!preview.killed) preview.kill();
};

process.on("exit", stopPreview);
process.on("SIGINT", () => {
  stopPreview();
  process.exit(130);
});
process.on("SIGTERM", () => {
  stopPreview();
  process.exit(143);
});

try {
  await waitForServer(URL);
  const playwrightArguments = [
    "./node_modules/@playwright/test/cli.js",
    "test",
    "-c",
    "e2e/playwright.stress.config.ts",
    ...(process.env.CANVAS_STRESS_GREP
      ? ["--grep", process.env.CANVAS_STRESS_GREP]
      : []),
  ];
  await run(process.execPath, playwrightArguments, {
    env: { ...process.env, CANVAS_STRESS_REPORT_DIR: REPORT_DIR },
  });
  console.log(`Canvas stress report: ${path.join(REPORT_DIR, "report.md")}`);
} finally {
  stopPreview();
}
