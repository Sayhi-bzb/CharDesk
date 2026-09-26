import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const canvas = path.join(root, "dist");
const site = path.join(root, "dist-site");
const source = path.join(root, "apps/site");
const builtHome = path.join(root, ".tmp/site");

await access(path.join(canvas, "index.html"));
await access(path.join(canvas, "docs/index.html"));
await access(path.join(canvas, "chargraph/index.html"));
execFileSync(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "build", "--config", path.join(source, "vite.config.ts")], {
  cwd: root,
  stdio: "inherit",
});
await rm(site, { recursive: true, force: true });
await mkdir(site, { recursive: true });
for (const name of ["docs", "chargraph", "assets", "fonts", "showcase", "data", "startup.css", "_headers", "_routes.json"]) {
  await cp(path.join(canvas, name), path.join(site, name), { recursive: true, force: true }).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
}
for (const name of ["icon.svg", "robots.txt", "sitemap.xml"]) {
  await cp(path.join(root, "public", name), path.join(site, name));
}
for (const name of ["index.html", "assets"]) {
  await cp(path.join(builtHome, name), path.join(site, name), { recursive: true });
}
for (const name of ["site.js", "_redirects"]) {
  await cp(path.join(source, name), path.join(site, name));
}
await cp(path.join(source, "migration"), path.join(site, "migration"), { recursive: true });
await mkdir(path.join(site, "legacy"), { recursive: true });
const legacy = (await readFile(path.join(canvas, "index.html"), "utf8"))
  .replace('<meta name="robots" content="index, follow" />', '<meta name="robots" content="noindex, nofollow" />')
  .replace('href="./icon.svg"', 'href="/icon.svg"');
await writeFile(path.join(site, "legacy/index.html"), legacy);
await writeFile(path.join(site, "legacy/blackboard.html"), legacy);
const index = await readFile(path.join(site, "index.html"), "utf8");
if (!index.includes('https://canvas.chardesk.com/') || !index.includes('https://ui.chardesk.com/')) {
  throw new Error("Site navigation is missing a product entry");
}
await writeFile(path.join(site, "404.html"), index);
