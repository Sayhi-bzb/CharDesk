import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
await writeFile(path.join(root, "apps/canvas/dist/robots.txt"), [
  "User-agent: *",
  "Allow: /",
  "",
  "Sitemap: https://canvas.chardesk.com/sitemap.xml",
  "",
].join("\n"));
await writeFile(path.join(root, "apps/canvas/dist/sitemap.xml"), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  '  <url><loc>https://canvas.chardesk.com/</loc></url>',
  '</urlset>',
  '',
].join("\n"));
