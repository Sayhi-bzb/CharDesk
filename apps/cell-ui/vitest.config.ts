import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vitest/config";
import { workspaceAliases } from "../../scripts/testing/workspace-aliases.js";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: [...workspaceAliases] },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          globals: true,
          include: ["src/**/*.{test,spec}.ts"],
          exclude: ["**/*.dom.{test,spec}.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/test/setup-dom.ts"],
          include: ["src/**/*.dom.{test,spec}.ts", "src/**/*.dom.{test,spec}.tsx"],
        },
      },
    ],
  },
});
