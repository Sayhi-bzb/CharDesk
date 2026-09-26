import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './input-scheduling',
  testMatch: /canvas\.input-scheduling\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 20 * 60_000,
  outputDir: '../test-results/canvas-input-scheduling/playwright',
  use: { baseURL: 'http://127.0.0.1:4177', trace: 'off', video: 'off' },
  projects: [{ name: 'chromium-input-scheduling', use: { browserName: 'chromium' } }],
});
