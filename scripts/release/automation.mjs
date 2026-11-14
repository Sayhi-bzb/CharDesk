import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function isVerifiedMainRun(run) {
  return run?.event === "push" && run.head_branch === "main" && run.status === "completed" && run.conclusion === "success";
}

export function isPendingReleaseMerge(pull, sha) {
  return pull.base?.ref === "main" && pull.head?.ref === "release-please--branches--main--components--chardesk" &&
    pull.merged_at != null && pull.merge_commit_sha === sha &&
    pull.labels?.some(label => label.name === "autorelease: pending");
}

export async function selectReleaseWork({ eventName, event, ref, api }) {
  if (eventName === "workflow_run") {
    const run = event.workflow_run;
    if (!isVerifiedMainRun(run)) return { mode: "none" };
    const pulls = await api(`/commits/${run.head_sha}/pulls`);
    return pulls.some(pull => isPendingReleaseMerge(pull, run.head_sha))
      ? { mode: "finalize", sha: run.head_sha } : { mode: "none" };
  }
  if (eventName !== "schedule" && !(eventName === "workflow_dispatch" && !event.inputs?.tag && ref === "refs/heads/main")) return { mode: "none" };
  const { object: { sha } } = await api("/git/ref/heads/main");
  const { workflow_runs: runs } = await api(`/actions/workflows/ci.yml/runs?event=push&branch=main&head_sha=${sha}&per_page=1`);
  return runs[0]?.head_sha === sha && isVerifiedMainRun(runs[0])
    ? { mode: "prepare", sha } : { mode: "none" };
}

export function repositoryApi({ token, repository, fetcher = fetch }) {
  if (!token || !repository) throw new Error("GitHub release credentials and repository are required");
  return async endpoint => {
    const response = await fetcher(`https://api.github.com/repos/${repository}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!response.ok) throw new Error(`GitHub release lookup failed: ${response.status} ${endpoint}`);
    return response.json();
  };
}

async function main() {
  const work = await selectReleaseWork({
    eventName: process.env.GITHUB_EVENT_NAME,
    event: JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")),
    ref: process.env.GITHUB_REF,
    api: repositoryApi({ token: process.env.GH_TOKEN, repository: process.env.GITHUB_REPOSITORY }),
  });
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `mode=${work.mode}\nsha=${work.sha ?? ""}\n`);
  console.log(work.mode === "none" ? "No verified release work is due." : `Selected ${work.mode} at ${work.sha}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
