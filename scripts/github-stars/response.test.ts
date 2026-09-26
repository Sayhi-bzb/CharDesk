import { describe, expect, it } from "vitest";
import { githubStarsResponse, type StarEnvironment } from "../../packages/github-stars/src/index";

const environment = (value: string | null): StarEnvironment => ({
  GITHUB_STARS: { get: async () => value },
});

describe("GitHub Stars Pages response", () => {
  it("returns a validated shared snapshot", async () => {
    const snapshot = { count: 1234, updatedAt: "2026-09-23T12:00:00.000Z" };
    const response = await githubStarsResponse(environment(JSON.stringify(snapshot)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(snapshot);
  });

  it.each([null, "not json", JSON.stringify({ count: -1, updatedAt: "no" })])(
    "returns unavailable for a missing or malformed snapshot: %s",
    async (value) => {
      const response = await githubStarsResponse(environment(value));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "unavailable" });
    }
  );

  it("returns unavailable when KV is not bound or fails", async () => {
    expect((await githubStarsResponse({})).status).toBe(503);
    expect((await githubStarsResponse({ GITHUB_STARS: { get: async () => { throw Error("offline"); } } })).status).toBe(503);
  });
});
