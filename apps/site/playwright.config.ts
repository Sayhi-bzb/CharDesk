import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5199",
  },
  webServer: {
    command: "./node_modules/.bin/vite --config apps/site/vite.config.ts --host 127.0.0.1 --port 5199 --strictPort",
    url: "http://127.0.0.1:5199/",
    reuseExistingServer: !process.env.CI,
  },
});
