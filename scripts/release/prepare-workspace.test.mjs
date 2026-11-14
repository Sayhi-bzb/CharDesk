import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { prepareWorkspaceUpdates } from "./prepare-workspace.mjs";

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "chardesk-release-"));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf8" });
  git("init", "--quiet");
  fs.writeFileSync(path.join(cwd, "package-lock.json"), '{"version":"0.1.0","dependency":"^0.1.0"}\n');
  fs.writeFileSync(path.join(cwd, "registry.json"), "old registry\n");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
  return { cwd, git };
}
const update = (file, transform, createIfMissing = false) => ({ path: file, createIfMissing, updater: { updateContent: transform } });

test("one candidate contains cumulative version, lockfile, dependency and registry changes", t => {
  const { cwd, git } = fixture(t);
  const before = git("rev-parse", "HEAD");
  const updates = prepareWorkspaceUpdates({ updates: [
    update("package-lock.json", content => content.replace('"version":"0.1.0"', '"version":"0.2.0"')),
    update("package-lock.json", content => content.replace('"dependency":"^0.1.0"', '"dependency":"^0.2.0"')),
    update("CHANGELOG.md", () => "release\n", true),
    update("CHANGELOG.md", content => content + "notes\n"),
  ] }, { cwd, sync: () => fs.writeFileSync(path.join(cwd, "registry.json"), "new registry\n") });
  assert.deepEqual(updates.map(item => item.path), ["CHANGELOG.md", "package-lock.json", "registry.json"]);
  const result = Object.fromEntries(updates.map(item => [item.path, item.updater.updateContent("old remote content")]));
  assert.deepEqual(JSON.parse(result["package-lock.json"]), { version: "0.2.0", dependency: "^0.2.0" });
  assert.equal(result["registry.json"], "new registry\n");
  assert.equal(result["CHANGELOG.md"], "release\nnotes\n");
  assert.equal(git("rev-parse", "HEAD"), before, "preparation never creates a second commit");
});

test("failed synchronization prevents any prepared candidate", t => {
  const { cwd } = fixture(t);
  assert.throws(() => prepareWorkspaceUpdates({ updates: [] }, { cwd, sync: () => { throw new Error("verification failed"); } }), /verification failed/);
});

test("dirty tracked content cannot be included in a release", t => {
  const { cwd } = fixture(t);
  fs.writeFileSync(path.join(cwd, "registry.json"), "user change");
  assert.throws(() => prepareWorkspaceUpdates({ updates: [] }, { cwd }), /clean checkout/);
});

test("reject missing files, paths outside checkout and existing untracked collisions", t => {
  const { cwd } = fixture(t);
  fs.writeFileSync(path.join(cwd, "untracked"), "user change");
  for (const [file, create, error] of [["missing", false, /Missing release file/], ["../outside", true, /escapes checkout/], [".git/config", true, /escapes checkout/], ["untracked", true, /Command failed/]]) {
    assert.throws(() => prepareWorkspaceUpdates({ updates: [update(file, () => "changed", create)] }, { cwd, sync: () => assert.fail("must not synchronize") }), error);
  }
  assert.equal(fs.readFileSync(path.join(cwd, "untracked"), "utf8"), "user change");
});
