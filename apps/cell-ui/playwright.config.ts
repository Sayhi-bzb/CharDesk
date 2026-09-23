import { defineConfig, devices } from "@playwright/test";

const preview = process.env.CELL_UI_PREVIEW === "1";
const port = process.env.PLAYWRIGHT_PORT ?? (preview ? "5191" : "5190");
const baseURL = process.env.CELL_UI_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "line" : "html",
  use: { baseURL, trace: "on-first-retry" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: process.env.CELL_UI_BASE_URL ? undefined : {
    command: preview
      ? `npm run preview -w @chardesk/cell-ui-site -- --port ${port}`
      : `npm run dev -w @chardesk/cell-ui-site -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI && !process.env.PLAYWRIGHT_PORT,
  },
});
