import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv, type Plugin } from "vite";

function staticSiteDevRedirect(): Plugin {
  return {
    name: "chardesk-static-site-dev-redirect",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestUrl = request.url ?? "";
        const site = ["docs", "chargraph"].find(
          (name) => requestUrl === `/${name}` || requestUrl.startsWith(`/${name}?`)
        );
        if (!site) {
          next();
          return;
        }

        response.statusCode = 307;
        response.setHeader("Location", `/${site}/${requestUrl.slice(site.length + 1)}`);
        response.end();
      });
    },
  };
}

function webMcpOriginTrial(): Plugin {
  let token = "";
  return {
    name: "chardesk-webmcp-origin-trial",
    configResolved(config) {
      token = (
        process.env.VITE_WEBMCP_ORIGIN_TRIAL_TOKEN ??
        loadEnv(config.mode, config.root, "VITE_").VITE_WEBMCP_ORIGIN_TRIAL_TOKEN ??
        ""
      ).trim();
    },
    transformIndexHtml() {
      if (!token) return [];
      return [{
        tag: "meta",
        attrs: { "http-equiv": "origin-trial", content: token },
        injectTo: "head",
      }];
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // Use relative asset paths by default to avoid blank pages on subpath deploys.
  base: process.env.VITE_BASE_PATH || "./",
  plugins: [staticSiteDevRedirect(), webMcpOriginTrial(), react(), tailwindcss()],
  optimizeDeps: {
    include: ["@tanstack/react-table"],
  },
  server: {
    headers: { "Origin-Agent-Cluster": "?1" },
    watch: {
      ignored: ["**/exp/**/*.md"],
    },
    proxy: {
      "/docs": {
        target: "http://127.0.0.1:5174",
        ws: true,
      },
      "/chargraph": {
        target: "http://127.0.0.1:5185",
        ws: true,
      },
    },
  },
  preview: {
    headers: { "Origin-Agent-Cluster": "?1" },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          const normalizedId = id.replaceAll("\\", "/");
          if (
            /\/node_modules\/(react|react-dom|scheduler)\//.test(normalizedId)
          ) {
            return "react-vendor";
          }
          if (normalizedId.includes("/node_modules/@radix-ui/")) {
            return "radix-ui";
          }
          if (
            /\/node_modules\/(motion|framer-motion|motion-dom|motion-utils)\//.test(
              normalizedId
            )
          ) {
            return "motion";
          }
          if (normalizedId.includes("/node_modules/lucide-react/")) {
            return "icons";
          }
          if (
            normalizedId.includes("/node_modules/shiki/") ||
            normalizedId.includes("/node_modules/@shikijs/")
          ) {
            return undefined;
          }
          return "vendor";
        },
      },
    },
  },
  resolve: {
    alias: [
      {
        find: /^@chardesk\/cell-core$/,
        replacement: path.resolve(import.meta.dirname, "./packages/cell-core/src/index.ts"),
      },
      {
        find: /^@chardesk\/cell-ui\/browser$/,
        replacement: path.resolve(import.meta.dirname, "./packages/cell-ui/src/browser.tsx"),
      },
      {
        find: /^@chardesk\/cell-ui$/,
        replacement: path.resolve(import.meta.dirname, "./packages/cell-ui/src/index.ts"),
      },
      {
        find: /^@chardesk\/collaboration-protocol$/,
        replacement: path.resolve(
          import.meta.dirname,
          "./packages/collaboration-protocol/src/index.ts"
        ),
      },
      {
        find: /^@chardesk\/ui\/theme\.css$/,
        replacement: path.resolve(import.meta.dirname, "./packages/ui/theme.css"),
      },
      {
        find: /^@chardesk\/ui\/styles$/,
        replacement: path.resolve(import.meta.dirname, "./packages/ui/src/styles.ts"),
      },
      {
        find: /^@chardesk\/ui$/,
        replacement: path.resolve(import.meta.dirname, "./packages/ui/src/index.ts"),
      },
      {
        find: /^@chardesk\/font-maple\/fonts\.css$/,
        replacement: path.resolve(import.meta.dirname, "./packages/font-maple/fonts.css"),
      },
      {
        find: /^@chardesk\/font-maple$/,
        replacement: path.resolve(import.meta.dirname, "./packages/font-maple/src/index.ts"),
      },
      {
        find: /^@chardesk\/fonts\/fonts\.css$/,
        replacement: path.resolve(import.meta.dirname, "./packages/fonts/fonts.css"),
      },
      {
        find: /^@chardesk\/fonts$/,
        replacement: path.resolve(import.meta.dirname, "./packages/fonts/src/index.ts"),
      },
      {
        find: /^@chardesk\/blackboard$/,
        replacement: path.resolve(
          import.meta.dirname,
          "./packages/blackboard/src/index.ts"
        ),
      },
      {
        find: /^@chardesk\/chargraph\/markdown$/,
        replacement: path.resolve(
          import.meta.dirname,
          "./packages/chargraph/src/markdown-default.ts"
        ),
      },
      {
        find: /^@chardesk\/chargraph\/mermaid$/,
        replacement: path.resolve(
          import.meta.dirname,
          "./packages/chargraph/src/mermaid.ts"
        ),
      },
      {
        find: /^@chardesk\/chargraph\/theme$/,
        replacement: path.resolve(
          import.meta.dirname,
          "./packages/chargraph/src/render-theme.ts"
        ),
      },
      {
        find: /^@chardesk\/chargraph$/,
        replacement: path.resolve(
          import.meta.dirname,
          "./packages/chargraph/src/index.ts"
        ),
      },
      {
        find: /^@chardesk\/rendering\/canvas$/,
        replacement: path.resolve(
          import.meta.dirname,
          "./packages/rendering/src/canvas.ts"
        ),
      },
      {
        find: /^@chardesk\/rendering$/,
        replacement: path.resolve(
          import.meta.dirname,
          "./packages/rendering/src/index.ts"
        ),
      },
      {
        find: "@chardesk/document",
        replacement: path.resolve(
          import.meta.dirname,
          "./packages/document/src/index.ts"
        ),
      },
      {
        find: "@chardesk/protocol",
        replacement: path.resolve(
          import.meta.dirname,
          "./packages/protocol/src/index.ts"
        ),
      },
      { find: "@", replacement: path.resolve(import.meta.dirname, "./src") },
    ],
  },
});
