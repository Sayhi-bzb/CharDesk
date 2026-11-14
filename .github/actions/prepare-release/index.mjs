import { execFileSync } from "node:child_process";
import { GitHub, Manifest } from "release-please";
import { ManifestPlugin } from "release-please/build/src/plugin.js";
import { repositoryApi } from "../../../scripts/release/automation.mjs";
import { prepareWorkspaceUpdates } from "../../../scripts/release/prepare-workspace.mjs";

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
const expectedSha = process.env.RELEASE_SHA;
const cwd = process.cwd();
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
if (!expectedSha || head !== expectedSha) throw new Error("Checkout must match the verified release SHA");
const api = repositoryApi({ token, repository });
const currentHead = async () => (await api("/git/ref/heads/main")).object.sha;

// Defer if main has advanced beyond the verified checkout.
if (await currentHead() !== expectedSha) {
  console.log("Main advanced; defer release preparation until its next verified run.");
} else {
  const [owner, repo] = repository.split("/");
  const github = await GitHub.create({ owner, repo, token });
  const manifest = await Manifest.fromManifest(github, "main");
  class WorkspaceRelease extends ManifestPlugin {
    async run(candidates) {
      if (candidates.length > 1 || candidates.some(candidate => candidate.path !== "."))
        throw new Error("Workspace release preparation requires the single root release");
      for (const candidate of candidates)
        candidate.pullRequest.updates = prepareWorkspaceUpdates(candidate.pullRequest, { cwd });
      if (await currentHead() !== expectedSha) {
        console.log("Main advanced during preparation; no release PR will be written.");
        return [];
      }
      return candidates;
    }
  }
  manifest.plugins.push(new WorkspaceRelease(github, "main", manifest.repositoryConfig));
  if (process.argv.includes("--dry-run")) {
    const candidates = await manifest.buildPullRequests();
    console.log(JSON.stringify(candidates.map(candidate => ({
      version: candidate.version?.toString(),
      files: candidate.updates.map(update => update.path),
    })), null, 2));
  } else {
    await manifest.createPullRequests();
  }
}
