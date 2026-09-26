import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const siteBuild = path.join(repositoryRoot, "apps/chargraph/dist");
const siteOutput = path.join(repositoryRoot, "apps/site/dist/chargraph");

await access(path.join(siteBuild, "index.html"));
await rm(siteOutput, { recursive: true, force: true });
await mkdir(siteOutput, { recursive: true });
await cp(siteBuild, siteOutput, { recursive: true });
