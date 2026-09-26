/// <reference lib="webworker" />

interface SearchRequest {
  id: number;
  indexUrl: string;
  query: string;
  limit: number;
}

type SearchResponse =
  | { id: number; codePoints: number[] }
  | { id: number; error: string };

let loadedUrl = "";
let entriesPromise: Promise<Array<[number, string]>> | null = null;

const loadEntries = (indexUrl: string) => {
  if (indexUrl !== loadedUrl || !entriesPromise) {
    loadedUrl = indexUrl;
    entriesPromise = fetch(indexUrl).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load ${indexUrl}: ${response.status}`);
      }
      const data = (await response.json()) as { entries: Array<[number, string]> };
      return data.entries;
    });
  }
  return entriesPromise;
};

self.addEventListener("message", async (event: MessageEvent<SearchRequest>) => {
  const { id, indexUrl, query, limit } = event.data;
  try {
    const entries = await loadEntries(indexUrl);
    const codePoints = entries
      .filter(([, text]) => text.includes(query))
      .slice(0, limit)
      .map(([codePoint]) => codePoint);
    self.postMessage({ id, codePoints } satisfies SearchResponse);
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : "Unicode search failed",
    } satisfies SearchResponse);
  }
});
