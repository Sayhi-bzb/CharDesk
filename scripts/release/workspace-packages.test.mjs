import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { releasedPackages } from "./workspace-packages.mjs";

const readJson = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));

test("released packages include every CharDesk runtime dependency", () => {
  const names = new Set(releasedPackages.map(({ name }) => name));
  for (const { name, path } of releasedPackages) {
    const manifest = readJson(`${path}/package.json`);
    for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      for (const dependency of Object.keys(manifest[field] ?? {})) {
        if (dependency.startsWith("@chardesk/"))
          assert(names.has(dependency), `${name} depends on unreleased ${dependency}`);
      }
    }
  }
});

test("Release Please owns every released package and lockfile version", () => {
  const updates = readJson("release-please-config.json").packages["."]["extra-files"];
  for (const { path } of releasedPackages) {
    assert(updates.some((update) => update.path === `${path}/package.json` && update.jsonpath === "$.version"), path);
    assert(updates.some((update) => update.path === "package-lock.json" && update.jsonpath === `$.packages['${path}'].version`), path);
  }
});
