import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, type Plugin } from "vite";
import { workspaceAliases } from "../../scripts/testing/workspace-aliases.js";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const packagesRoot = path.join(repositoryRoot, "packages");

function repositorySourceModules(): Plugin {
  return {
    name: "cell-ui-repository-source-modules",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        if (!request.url?.startsWith("/packages/")) return next();
        const url = new URL(request.url, "http://cell-ui.local");
        const sourcePath = path.resolve(repositoryRoot, `.${decodeURIComponent(url.pathname)}`);
        if (!sourcePath.startsWith(`${packagesRoot}${path.sep}`)) return next();
        request.url = `/@fs${sourcePath}${url.search}`;
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [repositorySourceModules(), react()],
  publicDir: path.join(repositoryRoot, "public"),
  server: {
    fs: { allow: [repositoryRoot] },
    headers: { "Origin-Agent-Cluster": "?1" },
  },
  resolve: { alias: [...workspaceAliases] },
  preview: { headers: { "Origin-Agent-Cluster": "?1" } },
});
