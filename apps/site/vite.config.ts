import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { workspaceAliases } from "../../scripts/testing/workspace-aliases.js";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  resolve: { alias: [...workspaceAliases] },
  build: {
    outDir: path.resolve(import.meta.dirname, "../../.tmp/site"),
    emptyOutDir: true,
  },
});
