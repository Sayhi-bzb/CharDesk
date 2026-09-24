import assert from "node:assert/strict";
import { test } from "node:test";
import { publishGitHubStars } from "./publish.mjs";

const credentials = {
  githubToken: "github-test",
  cloudflareToken: "cloudflare-test",
  accountId: "account",
  namespaceId: "namespace",
  now: () => new Date("2026-09-23T12:00:00.000Z"),
};

test("publishes one validated snapshot to Cloudflare KV", async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    return requests.length === 1
      ? { ok: true, json: async () => ({ count: 1234 }) }
      : { ok: true, json: async () => ({ success: true }) };
  };
  assert.deepEqual(await publishGitHubStars({ ...credentials, fetcher }), {
    count: 1234,
    updatedAt: "2026-09-23T12:00:00.000Z",
  });
  assert.match(requests[0].url, /api\.github\.com\/repos\/Sayhi-bzb\/CharDesk\/stargazers\/count$/);
  assert.equal(requests[0].options.headers.Authorization, "Bearer github-test");
  assert.equal(requests[0].options.headers["X-GitHub-Api-Version"], "2026-03-10");
  assert.equal(requests[1].options.method, "PUT");
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    count: 1234,
    updatedAt: "2026-09-23T12:00:00.000Z",
  });
});

test("does not overwrite the snapshot when GitHub fails or returns invalid data", async () => {
  let writes = 0;
  const invalid = async () => ({ ok: true, json: async () => ({ count: -1 }) });
  await assert.rejects(publishGitHubStars({ ...credentials, fetcher: invalid }), /invalid Star count/);
  const failed = async () => { writes += 1; return { ok: false, status: 403 }; };
  await assert.rejects(publishGitHubStars({ ...credentials, fetcher: failed }), /GitHub Stars request failed: 403/);
  assert.equal(writes, 1);
});

test("fails when Cloudflare does not acknowledge a write", async () => {
  let requests = 0;
  const fetcher = async () => {
    requests += 1;
    return requests === 1
      ? { ok: true, json: async () => ({ count: 42 }) }
      : { ok: true, json: async () => ({ success: false }) };
  };
  await assert.rejects(publishGitHubStars({ ...credentials, fetcher }), /not acknowledged/);
});
