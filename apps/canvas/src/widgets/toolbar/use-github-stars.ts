import { useEffect, useState } from "react";

export function useGitHubStars(enabled: boolean) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();

    void fetch("/api/github-stars", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`GitHub Stars request failed: ${response.status}`);
        return response.json() as Promise<{ count?: unknown }>;
      })
      .then(({ count: stars }) => {
        if (!Number.isSafeInteger(stars) || Number(stars) < 0) return;
        setCount(Number(stars));
      })
      .catch(() => {
        // Star metadata is optional; leave the menu usable when the snapshot is unavailable.
      });

    return () => controller.abort();
  }, [enabled]);

  return count;
}
