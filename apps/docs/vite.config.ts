import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "app"
);
const repositoryRoot = path.resolve(appDirectory, "../../..");

export default defineConfig(({ command }) => ({
  base: command === "serve" && process.env.DOCS_BUILD_TARGET === "engineering" ? "/docs/" : undefined,
  publicDir: process.env.DOCS_BUILD_TARGET === "engineering"
    ? path.join(repositoryRoot, "public")
    : path.resolve(appDirectory, "../public"),
  plugins: [fumadocsMdx(), tailwindcss(), reactRouter()],
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: `${appDirectory}/`,
      },
      {
        find: /^@chardesk\/ui\/theme\.css$/,
        replacement: path.join(repositoryRoot, "packages/ui/theme.css"),
      },
      {
        find: /^@chardesk\/ui$/,
        replacement: path.join(repositoryRoot, "packages/ui/src/index.ts"),
      },
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-dom",
      "react-dom/client",
    ],
  },
  ssr: {
    noExternal: [
      "fumadocs-core",
      "fumadocs-ui",
      "@fumadocs/base-ui",
      "@chardesk/ui",
      "@chardesk/docs-ui",
      "@chardesk/cell-ui",
    ],
  },
}));
