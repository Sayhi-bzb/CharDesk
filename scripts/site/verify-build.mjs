import { access, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const site = path.join(root, "apps/site/dist");
const read = (name) => readFile(path.join(site, name), "utf8");

const [html, redirects, sitemap, robots] = await Promise.all([
  read("index.html"), read("_redirects"), read("sitemap.xml"), read("robots.txt"),
]);
const legacy = await read("legacy/index.html");
if (await read("icon.svg") !== await readFile(path.join(root, "apps/site/public/icon.svg"), "utf8")) {
  throw new Error("Product-home icon differs from the shared source icon");
}
const homeScript = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/);
const homeStyle = html.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/);
if (!homeScript || !homeStyle) throw new Error("Cell UI product home assets are missing");
await Promise.all([homeScript[1], homeStyle[1]].map((url) => access(path.join(site, url.slice(1)))));
for (const required of [
  'rel="canonical" href="https://chardesk.com/"',
  'href="https://canvas.chardesk.com/"',
  'href="https://ui.chardesk.com/"',
]) {
  if (!html.includes(required)) throw new Error(`Product home is missing ${required}`);
}
if (!redirects.includes("/blackboard https://canvas.chardesk.com/blackboard 302")
  || !redirects.includes("/blackboard/* https://canvas.chardesk.com/blackboard/:splat 302")
  || !redirects.includes("/s/* https://canvas.chardesk.com/s/:splat 302")) {
  throw new Error("Legacy Canvas redirects are missing");
}
if (!legacy.includes('name="robots" content="noindex, nofollow"')
  || !(await read("legacy/blackboard.html")).includes('name="robots" content="noindex, nofollow"')) {
  throw new Error("Legacy workspace recovery route is missing or indexable");
}
if (!sitemap.includes("https://chardesk.com/docs/") || !sitemap.includes("https://chardesk.com/chargraph/")) {
  throw new Error("Product-home sitemap is incomplete");
}
if (!robots.includes("Sitemap: https://chardesk.com/sitemap.xml")) {
  throw new Error("Product-home robots.txt points to the wrong origin");
}
if (existsSync(path.join(site, "_routes.json"))) {
  throw new Error("The public site must not inherit Canvas Functions routing");
}
await Promise.all([
  "docs/index.html",
  "chargraph/index.html",
  "startup.css",
  "migration/bridge.html",
  "migration/bridge.js",
  "legacy/index.html",
  "showcase/01-shared-medium.png",
  "data/characters/manifest.json",
].map((name) => access(path.join(site, name))));
console.log("Product home, legacy routes, and migration bridge verified");
