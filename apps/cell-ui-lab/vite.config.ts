import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import { workspaceAliases } from "../../scripts/testing/workspace-aliases.js";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: [...workspaceAliases] },
  server: { fs: { allow: ["../.."] } },
});
