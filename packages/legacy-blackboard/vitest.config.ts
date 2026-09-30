import { defineConfig } from "vitest/config";
import { workspaceAliases } from "../../scripts/testing/workspace-aliases.js";

export default defineConfig({
  resolve: { alias: [...workspaceAliases] },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
