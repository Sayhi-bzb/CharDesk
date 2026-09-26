import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: /performance\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-perf",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
