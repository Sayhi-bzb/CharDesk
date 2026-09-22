import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (relative) => readFile(path.join(repositoryRoot, relative), "utf8");

const [html, robots, sitemap, cellUi] = await Promise.all([
  read("dist/index.html"),
  read("dist/robots.txt"),
  read("dist/sitemap.xml"),
  read("apps/cell-ui/index.html"),
]);

for (const required of [
  '<link rel="canonical" href="https://chardesk.com/"',
  '<meta name="robots" content="index, follow"',
  'property="og:image:alt"',
  'name="twitter:image:alt"',
  'type="application/ld+json"',
  '"@type": "SoftwareApplication"',
]) {
  if (!html.includes(required)) throw new Error(`App SEO metadata is missing: ${required}`);
}
if (html.includes('name="keywords"')) {
  throw new Error("App HTML retains obsolete keyword metadata");
}
if (!robots.includes("Sitemap: https://chardesk.com/sitemap.xml")) {
  throw new Error("robots.txt does not advertise the canonical sitemap");
}
if (!cellUi.includes('<meta name="robots" content="noindex, nofollow"')) {
  throw new Error("Cell UI must remain excluded from search indexes");
}

const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((match) => match[1]);
if (urls.length === 0 || new Set(urls).size !== urls.length) {
  throw new Error("Sitemap must contain unique canonical URLs");
}
for (const required of [
  "https://chardesk.com/",
  "https://chardesk.com/docs/",
  "https://chardesk.com/chargraph/",
]) {
  if (!urls.includes(required)) throw new Error(`Sitemap is missing ${required}`);
}
if (urls.some((url) =>
  !url.startsWith("https://chardesk.com/")
  || url.startsWith("https://chardesk.com/cell-ui/"),
)) {
  throw new Error("Sitemap contains a non-canonical or excluded URL");
}

console.log(`App SEO verified with ${urls.length} sitemap URLs`);
