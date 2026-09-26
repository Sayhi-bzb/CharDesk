import { useEffect, useState } from "react";

export const repositoryUrl = "https://github.com/Sayhi-bzb/CharDesk";
const starsUrl = "/api/github-stars";
const numberFormatter = new Intl.NumberFormat("en-US");

let starsRequest: Promise<number | null> | null = null;

const loadStars = (): Promise<number | null> => {
  starsRequest ??= fetch(starsUrl)
    .then(async (response) => {
      if (!response.ok) return null;
      const result: unknown = await response.json();
      if (typeof result !== "object" || result === null || !("count" in result)) return null;
      const count = result.count;
      return typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? count : null;
    })
    .catch(() => null);
  return starsRequest;
};

export function useGitHubStars() {
  const [stars, setStars] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void loadStars().then((count) => {
      if (!active) return;
      setStars(count);
      setLoaded(true);
    });
    return () => { active = false; };
  }, []);

  const count = stars === null ? "—" : numberFormatter.format(stars);
  const label = !loaded ? "CharDesk on GitHub, star count loading"
    : stars === null ? "CharDesk on GitHub, star count unavailable"
      : `CharDesk on GitHub, ${count} stars`;

  return { count, label, loaded };
}
