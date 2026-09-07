import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

const host = '127.0.0.1';
const port = 4176;
const reportDir = path.resolve(
  process.env.CANVAS_INPUT_COMMIT_REPORT_DIR ?? 'test-results/canvas-input-commit'
);
const preview = spawn(process.execPath, [
  './node_modules/vite/bin/vite.js', 'preview', '--host', host,
  '--port', String(port), '--strictPort',
], { stdio: 'inherit' });
const stop = () => { if (!preview.killed) preview.kill(); };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });
process.on('SIGTERM', () => { stop(); process.exit(143); });

const waitForServer = (timeoutMs = 30_000) => new Promise((resolve, reject) => {
  const startedAt = Date.now();
  const ping = () => {
    const request = http.get(`http://${host}:${port}`, (response) => {
      response.resume();
      resolve();
    });
    request.on('error', () => {
      if (Date.now() - startedAt > timeoutMs) reject(new Error('Input commit preview timed out'));
      else setTimeout(ping, 250);
    });
  };
  ping();
});

try {
  await waitForServer();
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      './node_modules/@playwright/test/cli.js', 'test',
      '-c', 'e2e/playwright.input-commit.config.ts',
    ], {
      stdio: 'inherit',
      env: { ...process.env, CANVAS_INPUT_COMMIT_REPORT_DIR: reportDir },
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0
      ? resolve()
      : reject(new Error(`Input commit benchmark failed with ${signal ?? `code ${code}`}`)));
  });
  console.log(`Canvas input commit report: ${path.join(reportDir, 'report.md')}`);
} finally {
  stop();
}
