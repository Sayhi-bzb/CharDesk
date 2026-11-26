import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(appDirectory, "../..");

export default defineConfig({
  base: "/chargraph/",
  publicDir: path.join(appDirectory, "public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: `${path.join(appDirectory, "src")}/`,
      },
      {
        find: /^@chardesk\/ui\/theme\.css$/,
        replacement: path.join(repositoryRoot, "packages/ui/theme.css"),
      },
      {
        find: /^@chardesk\/ui\/styles$/,
        replacement: path.join(repositoryRoot, "packages/ui/src/styles.ts"),
      },
      {
        find: /^@chardesk\/ui$/,
        replacement: path.join(repositoryRoot, "packages/ui/src/index.ts"),
      },
      {
        find: /^@chardesk\/viewer$/,
        replacement: path.join(repositoryRoot, "packages/viewer/src/index.ts"),
      },
      {
        find: /^@chardesk\/fonts\/fonts\.css$/,
        replacement: path.join(repositoryRoot, "packages/fonts/fonts.css"),
      },
      {
        find: /^@chardesk\/fonts$/,
        replacement: path.join(repositoryRoot, "packages/fonts/src/index.ts"),
      },
      {
        find: /^@chardesk\/chargraph\/examples$/,
        replacement: path.join(repositoryRoot, "packages/chargraph/src/examples.ts"),
      },
      {
        find: /^@chardesk\/chargraph\/mermaid$/,
        replacement: path.join(repositoryRoot, "packages/chargraph/src/mermaid.ts"),
      },
      {
        find: /^@chardesk\/chargraph\/markdown$/,
        replacement: path.join(repositoryRoot, "packages/chargraph/src/markdown-default.ts"),
      },
      {
        find: /^@chardesk\/chargraph\/theme$/,
        replacement: path.join(repositoryRoot, "packages/chargraph/src/render-theme.ts"),
      },
      {
        find: /^@chardesk\/chargraph$/,
        replacement: path.join(repositoryRoot, "packages/chargraph/src/index.ts"),
      },
      {
        find: /^@chardesk\/rendering\/canvas$/,
        replacement: path.join(repositoryRoot, "packages/rendering/src/canvas.ts"),
      },
      {
        find: /^@chardesk\/rendering$/,
        replacement: path.join(repositoryRoot, "packages/rendering/src/index.ts"),
      },
      {
        find: /^@chardesk\/protocol$/,
        replacement: path.join(repositoryRoot, "packages/protocol/src/index.ts"),
      },
    ],
  },
});
