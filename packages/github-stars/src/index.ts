const GITHUB_STARS_KEY = "github-stars";

type StarStore = { get(key: string): Promise<string | null> };

export type StarEnvironment = { GITHUB_STARS?: StarStore };

function parseStarSnapshot(value: unknown): { count: number; updatedAt: string } | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("count" in value) || !("updatedAt" in value)) return null;
  const { count, updatedAt } = value;
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return null;
  if (typeof updatedAt !== "string" || !Number.isFinite(Date.parse(updatedAt))) return null;
  return { count, updatedAt };
}

export async function githubStarsResponse(env: StarEnvironment): Promise<Response> {
  let snapshot = null;
  try {
    const stored = await env.GITHUB_STARS?.get(GITHUB_STARS_KEY);
    snapshot = stored ? parseStarSnapshot(JSON.parse(stored) as unknown) : null;
  } catch {
    // Missing or unavailable KV should not break the host page.
  }
  return Response.json(snapshot ?? { error: "unavailable" }, {
    status: snapshot ? 200 : 503,
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
