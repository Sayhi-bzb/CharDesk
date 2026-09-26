import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const docsBuild = path.join(repositoryRoot, "apps/docs/build/client");
const docsPages = path.join(docsBuild, "docs");
const docsAssets = path.join(docsBuild, "assets");
const docsOutput = path.join(repositoryRoot, "apps/site/dist/docs");
const appAssets = path.join(repositoryRoot, "apps/site/dist/assets");

await access(path.join(docsPages, "index.html"));
await access(docsAssets);
await rm(docsOutput, { recursive: true, force: true });
await mkdir(docsOutput, { recursive: true });
await mkdir(appAssets, { recursive: true });
await cp(docsPages, docsOutput, { recursive: true });
await cp(docsAssets, appAssets, { recursive: true });
const fallback = await readFile(path.join(docsBuild, "index.html"), "utf8");
const noIndexFallback = fallback.replace(
  "</head>",
  '<meta name="robots" content="noindex, nofollow" /></head>',
);
if (noIndexFallback === fallback) {
  throw new Error("Documentation fallback is missing a closing head element");
}
await writeFile(path.join(docsOutput, "404.html"), noIndexFallback);
