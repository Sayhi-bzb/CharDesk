import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './input-commit',
  testMatch: /canvas\.input-commit\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 20 * 60_000,
  outputDir: '../test-results/canvas-input-commit/playwright',
  use: { baseURL: 'http://127.0.0.1:4176', trace: 'off', video: 'off' },
  projects: [{ name: 'chromium-input-commit', use: { browserName: 'chromium' } }],
});
