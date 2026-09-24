import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGitHubStars } from "./use-github-stars";

describe("useGitHubStars", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the same-origin snapshot only after the menu opens", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ count: 1234, updatedAt: "2026-09-23T00:00:00.000Z" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ enabled }) => useGitHubStars(enabled),
      { initialProps: { enabled: false } }
    );
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current).toBe(1234));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/github-stars",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("omits invalid or unavailable snapshots", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ count: -1 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useGitHubStars(true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(result.current).toBeNull();
  });

  it("keeps a loaded count when a later request fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ count: 321 }) })
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ enabled }) => useGitHubStars(enabled), {
      initialProps: { enabled: true },
    });
    await waitFor(() => expect(result.current).toBe(321));
    rerender({ enabled: false });
    rerender({ enabled: true });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(result.current).toBe(321);
  });
});
