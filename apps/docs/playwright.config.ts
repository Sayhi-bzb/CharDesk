import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.DOCS_PREVIEW_PORT ?? 5176);
export default defineConfig({
  testDir: './e2e', fullyParallel: true, workers: 2, reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: { command: 'node scripts/docs/preview.mjs', cwd: '../..', port, reuseExistingServer: false },
});
