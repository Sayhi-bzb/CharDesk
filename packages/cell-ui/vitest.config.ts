import { defineConfig } from "vitest/config";
import { workspaceAliases } from "../../scripts/testing/workspace-aliases.js";

export default defineConfig({
  resolve: { alias: [...workspaceAliases] },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["src/**/*.dom.test.ts", "src/**/*.dom.test.tsx"],
  },
});
