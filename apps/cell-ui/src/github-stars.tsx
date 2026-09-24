import { useEffect, useState } from "react";

const repositoryUrl = "https://github.com/Sayhi-bzb/CharDesk";
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

export function GitHubStars() {
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

  return <a className="gallery-github-stars" href={repositoryUrl} target="_blank" rel="noopener noreferrer" aria-label={label}>
    <svg aria-hidden="true" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M46 18V30H44V34H42V38H40V40H38V42H36V44H32V46H30V36H28V34H30V32H34V30H36V28H38V18H36V12H32V14H30V16H28V14H20V16H18V14H16V12H12V18H10V28H12V30H14V32H18V36H14V34H12V32H8V34H10V38H12V40H18V46H16V44H12V42H10V40H8V38H6V34H4V30H2V18H4V14H6V10H8V8H10V6H14V4H18V2H30V4H34V6H38V8H40V10H42V14H44V18H46Z" fill="currentColor" />
    </svg>
    <span className="gallery-github-stars__count" aria-live="polite">{count}</span>
  </a>;
}
