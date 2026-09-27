import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:5192" },
  webServer: {
    command: "npm run dev -w @chardesk/cell-ui-lab",
    url: "http://127.0.0.1:5192",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
