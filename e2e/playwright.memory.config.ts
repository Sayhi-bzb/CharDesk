import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./memory",
  testMatch: /canvas\.memory\.spec\.ts/,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 20 * 60_000,
  outputDir: "../test-results/canvas-memory/playwright",
  use: {
    baseURL: "http://127.0.0.1:4175",
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
  },
  projects: [{
    name: "chromium-memory",
    use: {
      browserName: "chromium",
      launchOptions: { args: ["--enable-precise-memory-info"] },
    },
  }],
});
