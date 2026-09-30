import { defineConfig } from "@playwright/test";
import canvas from "../../apps/canvas/playwright.config.ts";

export default defineConfig({
  ...canvas,
  testDir: ".",
  testMatch: ["agent-dialog.spec.mjs", "bridge.spec.mjs", "pi.spec.mjs"],
  projects: [{ name: "local-mcp-chromium", use: { browserName: "chromium", headless: true } }],
  workers: 1,
  retries: 0,
  reporter: "line",
  webServer: { ...canvas.webServer, cwd: new URL("../../", import.meta.url).pathname },
});
