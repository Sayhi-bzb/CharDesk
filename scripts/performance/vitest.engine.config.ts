import path from "node:path";

import { defineConfig } from "vitest/config";

import { workspaceAliases } from "../testing/workspace-aliases.js";

const root = path.resolve(import.meta.dirname, "../..");

export default defineConfig({
  root,
  resolve: {
    alias: [
      ...workspaceAliases,
      { find: "@", replacement: path.resolve(root, "src") },
    ],
  },
  test: {
    environment: "node",
    include: ["scripts/performance/**/*.perf.ts"],
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 120_000,
  },
});
