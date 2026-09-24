const githubUrl = "https://api.github.com/repos/Sayhi-bzb/CharDesk/stargazers/count";
const starKey = "github-stars";

export async function publishGitHubStars({
  githubToken,
  cloudflareToken,
  accountId,
  namespaceId,
  fetcher = fetch,
  now = () => new Date(),
}) {
  if (!githubToken || !cloudflareToken || !accountId || !namespaceId) {
    throw new Error("GitHub Stars publishing credentials are incomplete.");
  }

  const github = await fetcher(githubUrl, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
  if (!github.ok) throw new Error(`GitHub Stars request failed: ${github.status}`);
  const result = await github.json();
  const count = result?.count;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new Error("GitHub returned an invalid Star count.");
  }

  const updatedAt = now().toISOString();
  const cloudflare = await fetcher(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/${starKey}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${cloudflareToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ count, updatedAt }),
    },
  );
  if (!cloudflare.ok) throw new Error(`Cloudflare KV write failed: ${cloudflare.status}`);
  const write = await cloudflare.json();
  if (write?.success !== true) throw new Error("Cloudflare KV write was not acknowledged.");
  return { count, updatedAt };
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  publishGitHubStars({
    githubToken: process.env.GITHUB_TOKEN,
    cloudflareToken: process.env.CLOUDFLARE_API_TOKEN,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    namespaceId: process.env.CLOUDFLARE_KV_NAMESPACE_ID,
  }).then(({ count }) => {
    process.stdout.write(`Published GitHub Star count: ${count}\n`);
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
