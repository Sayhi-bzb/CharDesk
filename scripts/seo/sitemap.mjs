import { glob, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const docsRoot = path.join(repositoryRoot, "apps/docs/content/docs");
const outputPath = path.join(repositoryRoot, "apps/site/public/sitemap.xml");
const verify = process.argv.slice(2).includes("--verify");

const docsUrl = (entry) => {
  const route = entry
    .replace(/\.mdx$/u, "")
    .replace(/(^|\/)index$/u, "$1")
    .replace(/^\/+|\/+$/gu, "");
  return `https://chardesk.com/docs/${route ? `${route}/` : ""}`;
};

const urls = new Set([
  "https://chardesk.com/",
  "https://chardesk.com/chargraph/",
]);
for await (const entry of glob("**/*.mdx", { cwd: docsRoot })) {
  urls.add(docsUrl(entry));
}

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...[...urls]
    .sort()
    .map((url) => `  <url><loc>${url}</loc></url>`),
  "</urlset>",
  "",
].join("\n");

if (verify) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== sitemap) {
    throw new Error("apps/site/public/sitemap.xml is stale; run npm run sitemap:generate");
  }
  console.log(`Sitemap verified: ${urls.size} canonical URLs`);
} else {
  await writeFile(outputPath, sitemap);
  console.log(`Sitemap generated: ${urls.size} canonical URLs`);
}
