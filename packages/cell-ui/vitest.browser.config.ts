import { defineConfig } from "vitest/config";
import { workspaceAliases } from "../../scripts/testing/workspace-aliases.js";

export default defineConfig({
  resolve: { alias: [...workspaceAliases] },
  test: {
    environment: "jsdom",
    include: ["src/**/*.dom.test.ts", "src/**/*.dom.test.tsx"],
  },
});
