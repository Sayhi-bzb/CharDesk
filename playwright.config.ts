import { defineConfig, devices } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT ?? '5173';
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  testIgnore: /stress\/.*\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [
            { name: 'chardesk-onboarding-v1', value: 'dismissed' },
          ],
        },
      ],
    },
  },
  projects: [
    {
      name: 'webkit-canvas-font',
      testMatch: /canvas-font-settings\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit-shortcuts',
      testMatch: /shortcuts\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'webkit-cell-gallery',
      testMatch: /web-tui.*\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'viewer-webkit',
      testMatch: /viewer\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'viewer-firefox',
      testMatch: /viewer\.spec\.ts/,
      use: { ...devices['Desktop Firefox'] },
    },
  ],
  webServer: {
    command: `npm run dev:app -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI && !process.env.PLAYWRIGHT_PORT,
  },
});
