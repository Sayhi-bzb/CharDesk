import assert from "node:assert/strict";
import { test } from "node:test";
import { selectReleaseWork } from "./automation.mjs";

const sha = "a".repeat(40);
const verified = { event: "push", head_branch: "main", status: "completed", conclusion: "success", head_sha: sha };
const mergedRelease = {
  base: { ref: "main" }, head: { ref: "release-please--branches--main--components--chardesk" },
  merged_at: "2026-11-14T00:00:00Z", merge_commit_sha: sha,
  labels: [{ name: "autorelease: pending" }],
};
const noApi = () => assert.fail("Unexpected GitHub request");

test("ordinary verified main pushes never prepare or finalize a release", async () => {
  const work = await selectReleaseWork({ eventName: "workflow_run", event: { workflow_run: verified }, api: async endpoint => {
    assert.equal(endpoint, `/commits/${sha}/pulls`);
    return [{ ...mergedRelease, head: { ref: "fix-a-bug" } }];
  } });
  assert.deepEqual(work, { mode: "none" });
});

test("only a verified pending release merge can finalize publication", async () => {
  const select = (run, pulls, api = async () => pulls) => selectReleaseWork({ eventName: "workflow_run", event: { workflow_run: run }, api });
  assert.deepEqual(await select(verified, [mergedRelease]), { mode: "finalize", sha });
  for (const override of [{ event: "pull_request" }, { head_branch: "feature" }, { conclusion: "failure" }, { status: "in_progress" }])
    assert.deepEqual(await select({ ...verified, ...override }, [], noApi), { mode: "none" });
  for (const override of [{ merged_at: null }, { merge_commit_sha: "other" }, { labels: [] }, { base: { ref: "other" } }])
    assert.deepEqual(await select(verified, [{ ...mergedRelease, ...override }]), { mode: "none" });
});

test("daily and manual preparation require a successful Verify of the exact latest main SHA", async () => {
  for (const eventName of ["schedule", "workflow_dispatch"]) {
    for (const run of [verified, { ...verified, conclusion: "failure" }, { ...verified, status: "in_progress" }, { ...verified, head_sha: "old" }, undefined]) {
      const calls = [];
      const work = await selectReleaseWork({ eventName, event: { inputs: {} }, ref: "refs/heads/main", api: async endpoint => {
        calls.push(endpoint);
        return calls.length === 1 ? { object: { sha } } : { workflow_runs: run ? [run] : [] };
      } });
      assert.deepEqual(calls, ["/git/ref/heads/main", `/actions/workflows/ci.yml/runs?event=push&branch=main&head_sha=${sha}&per_page=1`]);
      assert.deepEqual(work, run === verified ? { mode: "prepare", sha } : { mode: "none" });
    }
  }
});

test("manual tag publication and non-main dispatches do not prepare release PRs", async () => {
  for (const [ref, inputs] of [["refs/tags/v0.7.0", { tag: "v0.7.0" }], ["refs/heads/main", { tag: "v0.7.0" }], ["refs/heads/feature", {}]])
    assert.deepEqual(await selectReleaseWork({ eventName: "workflow_dispatch", event: { inputs }, ref, api: noApi }), { mode: "none" });
});
