import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const synchronize = cwd => {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  for (const script of ["release:sync", "release:verify"])
    execFileSync(npm, ["run", script], { cwd, stdio: "inherit" });
};

// Complete the candidate locally before Release Please writes its one PR commit.
export function prepareWorkspaceUpdates(release, { cwd, sync = synchronize }) {
  cwd = path.resolve(cwd);
  if (git(cwd, ["status", "--porcelain", "--untracked-files=no"]).trim())
    throw new Error("Release preparation requires a clean checkout");
  const paths = new Set();
  for (const update of release.updates) {
    const target = path.resolve(cwd, update.path);
    if (!target.startsWith(cwd + path.sep) || update.path.split(/[\\/]/).includes(".git"))
      throw new Error(`Release update escapes checkout: ${update.path}`);
    const exists = fs.existsSync(target);
    if (!exists && !update.createIfMissing) throw new Error(`Missing release file: ${update.path}`);
    if (exists && !paths.has(update.path)) git(cwd, ["ls-files", "--error-unmatch", "--", update.path]);
    paths.add(update.path);
    const next = update.updater.updateContent(exists ? fs.readFileSync(target, "utf8") : "");
    if (next !== undefined) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, next);
    }
  }
  sync(cwd);
  for (const file of git(cwd, ["diff", "--name-only", "-z", "HEAD"]).split("\0").filter(Boolean)) paths.add(file);
  return [...paths].sort().map(file => {
    const content = fs.readFileSync(path.join(cwd, file), "utf8");
    return { path: file, createIfMissing: true, updater: { updateContent: () => content } };
  });
}
