import { chmod, copyFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";

await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });
execFileSync("tsc", ["-p", "tsconfig.json"], {
  cwd: new URL("..", import.meta.url),
  stdio: "inherit",
});

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const runtimeRoot = fileURLToPath(new URL("../dist/runtime", import.meta.url));
await build({
  configFile: fileURLToPath(new URL("../../../apps/canvas/vite.config.ts", import.meta.url)),
  root: fileURLToPath(new URL("../../../apps/canvas", import.meta.url)),
  publicDir: false,
  base: "./",
  build: {
    outDir: runtimeRoot,
    emptyOutDir: true,
    rollupOptions: {
    input: fileURLToPath(new URL("../../../apps/canvas/index.html", import.meta.url)),
    },
  },
});
await copyFile(
  new URL("../../../apps/canvas/public/icon.svg", import.meta.url),
  new URL("../dist/runtime/icon.svg", import.meta.url),
);
await copyFile(
  new URL("../../../apps/canvas/public/startup.css", import.meta.url),
  new URL("../dist/runtime/startup.css", import.meta.url),
);

const external = [
    "@chardesk/fonts",
    "@napi-rs/canvas",
    "d3-scale",
    "elkjs",
    "jsonc-parser",
    "marked",
    "marked-alert",
    "open",
    "saxes",
    "shiki",
    "temml",
    "yaml",
];

const bundle = (entry, fileName) => build({
  configFile: false,
  copyPublicDir: false,
  logLevel: "warn",
  build: {
    emptyOutDir: false,
    minify: false,
    outDir: new URL("../dist", import.meta.url).pathname,
    rollupOptions: {
      external,
      output: { entryFileNames: fileName, codeSplitting: false },
    },
    ssr: entry,
    target: "node20",
  },
});

await bundle(new URL("../src/cli.ts", import.meta.url).pathname, "cli.js");
await bundle(new URL("../src/raster-worker.ts", import.meta.url).pathname, "raster-worker.js");
await chmod(new URL("../dist/cli.js", import.meta.url), 0o755);
await Promise.all([
  "LICENSE.beautiful-mermaid",
  "LICENSE.marked-terminal",
  "UPSTREAM.md",
].map((name) => copyFile(
  new URL(`../../chargraph/${name}`, import.meta.url),
  new URL(`../dist/${name}`, import.meta.url),
)));
