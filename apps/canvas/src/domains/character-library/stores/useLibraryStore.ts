import { create } from "zustand";

export type CharacterPackId = "essentials" | "nerd" | "emoji";
export type CharacterViewId = CharacterPackId | "unicode";
export type UnicodeFacetType = "block" | "script" | "category";

export interface CharacterRecord {
  id: string;
  grapheme: string;
  name: string;
  aliases: string[];
  category: string;
  script: string;
  coverage: number;
  insertable: boolean;
}

export interface CharacterGroup {
  id: string;
  label: string;
  entries: CharacterRecord[];
}

type PackedCharacterRecord = Pick<CharacterRecord, "id" | "grapheme" | "name"> &
  Partial<Omit<CharacterRecord, "id" | "grapheme" | "name">>;

interface PackedCharacterGroup {
  id: string;
  label: string;
  entries: PackedCharacterRecord[];
}

interface PackAsset {
  schemaVersion: number;
  groups: PackedCharacterGroup[];
}

interface CharacterManifest {
  schemaVersion: number;
  unicodeVersion: string;
  emojiVersion: string;
  packs: Record<CharacterPackId, string>;
  unicodeManifest: string;
  counts: Record<CharacterPackId | "main" | "unicode", number>;
}

interface UnicodeFacet {
  id: string;
  label: string;
  count: number;
  ranges: Array<[number, number]>;
}

interface UnicodeManifest {
  schemaVersion: number;
  unicodeVersion: string;
  shardSize: number;
  shards: Record<string, string>;
  nameIndex: string;
  facets: Record<UnicodeFacetType, UnicodeFacet[]>;
}

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface LibraryState {
  manifest: CharacterManifest | null;
  packs: Partial<Record<CharacterPackId, CharacterGroup[]>>;
  packStatus: Record<CharacterPackId, LoadStatus>;
  packErrors: Partial<Record<CharacterPackId, string>>;
  searchQueries: Record<CharacterPackId, string>;
  searchResults: Record<CharacterPackId, CharacterRecord[]>;
  unicodeManifest: UnicodeManifest | null;
  unicodeStatus: LoadStatus;
  unicodeError: string | null;
  unicodeFacetType: UnicodeFacetType;
  unicodeFacetId: string | null;
  unicodeResults: CharacterRecord[];
  unicodeOffset: number;
  unicodeHasMore: boolean;
  unicodeSearchLoading: boolean;
  loadMainPacks: () => Promise<void>;
  retryPack: (pack: CharacterPackId) => Promise<void>;
  setPackSearchQuery: (pack: CharacterPackId, query: string) => void;
  loadUnicodeManifest: () => Promise<void>;
  loadUnicodePage: (
    facetType: UnicodeFacetType,
    facetId: string,
    offset?: number
  ) => Promise<void>;
  searchUnicode: (query: string) => Promise<void>;
}

const PAGE_SIZE = 240;
const MAX_SEARCH_RESULTS = 100;
const MAX_SHARD_CACHE = 8;
const DATA_ROOT = `${import.meta.env.BASE_URL}data/characters/`;
const initialPackStatus: Record<CharacterPackId, LoadStatus> = {
  essentials: "idle",
  nerd: "idle",
  emoji: "idle",
};
const initialSearchQueries: Record<CharacterPackId, string> = {
  essentials: "",
  nerd: "",
  emoji: "",
};
const initialSearchResults: Record<CharacterPackId, CharacterRecord[]> = {
  essentials: [],
  nerd: [],
  emoji: [],
};

let mainEntries: Record<CharacterPackId, CharacterRecord[]> = {
  essentials: [],
  nerd: [],
  emoji: [],
};
const shardCache = new Map<string, CharacterRecord[]>();
let nameIndex: Array<[number, string]> | null = null;
let nameSearchWorker: Worker | null = null;
let nextSearchRequestId = 1;
const pendingNameSearches = new Map<
  number,
  { resolve: (codePoints: number[]) => void; reject: (error: Error) => void }
>();

const assetUrl = (relativePath: string) => `${DATA_ROOT}${relativePath}`;

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !contentType.includes("json")) {
    throw new Error(`Expected JSON for ${url}, received ${contentType}`);
  }
  return response.json() as Promise<T>;
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Character data failed to load";

const searchUnicodeNames = async (
  indexUrl: string,
  normalizedQuery: string
): Promise<number[]> => {
  if (typeof Worker === "undefined") {
    if (!nameIndex) {
      const data = await fetchJson<{ entries: Array<[number, string]> }>(indexUrl);
      nameIndex = data.entries;
    }
    return nameIndex
      .filter(([, text]) => text.includes(normalizedQuery))
      .slice(0, MAX_SEARCH_RESULTS)
      .map(([codePoint]) => codePoint);
  }
  if (!nameSearchWorker) {
    nameSearchWorker = new Worker(
      new URL("./unicode-name-search.worker.ts", import.meta.url),
      { type: "module" }
    );
    nameSearchWorker.addEventListener("message", (event: MessageEvent<{
      id: number;
      codePoints?: number[];
      error?: string;
    }>) => {
      const pending = pendingNameSearches.get(event.data.id);
      if (!pending) return;
      pendingNameSearches.delete(event.data.id);
      if (event.data.error) pending.reject(new Error(event.data.error));
      else pending.resolve(event.data.codePoints ?? []);
    });
  }
  const id = nextSearchRequestId++;
  const result = new Promise<number[]>((resolve, reject) => {
    pendingNameSearches.set(id, { resolve, reject });
  });
  nameSearchWorker.postMessage({
    id,
    indexUrl,
    query: normalizedQuery,
    limit: MAX_SEARCH_RESULTS,
  });
  return result;
};

const normalizePackGroups = (
  pack: CharacterPackId,
  groups: PackedCharacterGroup[]
): CharacterGroup[] =>
  groups.map((group) => ({
    ...group,
    entries: group.entries.map((entry) => ({
      aliases: [],
      category: pack === "nerd" ? "Co" : pack === "emoji" ? "Emoji" : "So",
      script: pack === "nerd" ? "Private_Use" : "Common",
      coverage: pack === "nerd" ? 1 : pack === "emoji" ? 4 : 0,
      insertable: true,
      ...entry,
    })),
  }));

const rebuildMainEntries = (
  packs: Partial<Record<CharacterPackId, CharacterGroup[]>>
) => {
  mainEntries = {
    essentials: packs.essentials?.flatMap((group) => group.entries) ?? [],
    nerd: packs.nerd?.flatMap((group) => group.entries) ?? [],
    emoji: packs.emoji?.flatMap((group) => group.entries) ?? [],
  };
};

const codePointQuery = (query: string) => {
  const match = query.trim().match(/^(?:U\+|0X)?([0-9A-F]{2,6})$/i);
  return match ? Number.parseInt(match[1], 16) : null;
};

const normalizedSearchText = (entry: CharacterRecord) =>
  `${entry.grapheme} ${entry.id} ${entry.name} ${entry.aliases.join(" ")}`
    .normalize("NFKC")
    .toLowerCase();

const codePointsFromRanges = (
  ranges: Array<[number, number]>,
  offset: number,
  limit: number
) => {
  const output: number[] = [];
  let skipped = 0;
  for (const [start, end] of ranges) {
    const length = end - start + 1;
    if (skipped + length <= offset) {
      skipped += length;
      continue;
    }
    const first = start + Math.max(0, offset - skipped);
    for (let value = first; value <= end && output.length < limit; value += 1) {
      output.push(value);
    }
    skipped += length;
    if (output.length >= limit) break;
  }
  return output;
};

const fetchShard = async (
  manifest: UnicodeManifest,
  shardId: string
) => {
  const cached = shardCache.get(shardId);
  if (cached) {
    shardCache.delete(shardId);
    shardCache.set(shardId, cached);
    return cached;
  }
  const relativePath = manifest.shards[shardId];
  if (!relativePath) return [];
  const data = await fetchJson<{ records: CharacterRecord[] }>(
    assetUrl(relativePath)
  );
  shardCache.set(shardId, data.records);
  while (shardCache.size > MAX_SHARD_CACHE) {
    const oldest = shardCache.keys().next().value;
    if (oldest === undefined) break;
    shardCache.delete(oldest);
  }
  return data.records;
};

const loadRecords = async (
  manifest: UnicodeManifest,
  codePoints: number[]
) => {
  const shardIds = [
    ...new Set(
      codePoints.map((value) =>
        Math.floor(value / manifest.shardSize).toString(16).padStart(3, "0")
      )
    ),
  ];
  const records = (await Promise.all(
    shardIds.map((shardId) => fetchShard(manifest, shardId))
  )).flat();
  const byCodePoint = new Map(
    records.map((record) => [record.grapheme.codePointAt(0), record])
  );
  return codePoints.flatMap((value) => {
    const record = byCodePoint.get(value);
    return record ? [record] : [];
  });
};

export const useLibraryStore = create<LibraryState>((set, get) => {
  const loadPack = async (
    manifest: CharacterManifest,
    pack: CharacterPackId
  ) => {
    set((state) => ({
      packStatus: { ...state.packStatus, [pack]: "loading" },
      packErrors: { ...state.packErrors, [pack]: undefined },
    }));
    try {
      const asset = await fetchJson<PackAsset>(assetUrl(manifest.packs[pack]));
      set((state) => {
        const packs = {
          ...state.packs,
          [pack]: normalizePackGroups(pack, asset.groups),
        };
        rebuildMainEntries(packs);
        return {
          packs,
          packStatus: { ...state.packStatus, [pack]: "ready" },
        };
      });
    } catch (error) {
      set((state) => ({
        packStatus: { ...state.packStatus, [pack]: "error" },
        packErrors: { ...state.packErrors, [pack]: errorMessage(error) },
      }));
    }
  };

  return {
    manifest: null,
    packs: {},
    packStatus: initialPackStatus,
    packErrors: {},
    searchQueries: initialSearchQueries,
    searchResults: initialSearchResults,
    unicodeManifest: null,
    unicodeStatus: "idle",
    unicodeError: null,
    unicodeFacetType: "block",
    unicodeFacetId: null,
    unicodeResults: [],
    unicodeOffset: 0,
    unicodeHasMore: false,
    unicodeSearchLoading: false,

    loadMainPacks: async () => {
      if (get().manifest) return;
      try {
        const manifest = await fetchJson<CharacterManifest>(
          `${DATA_ROOT}manifest.json`
        );
        set({ manifest });
        await Promise.all(
          (["essentials", "nerd", "emoji"] as const).map((pack) =>
            loadPack(manifest, pack)
          )
        );
      } catch (error) {
        const message = errorMessage(error);
        set({
          packStatus: {
            essentials: "error",
            nerd: "error",
            emoji: "error",
          },
          packErrors: {
            essentials: message,
            nerd: message,
            emoji: message,
          },
        });
      }
    },

    retryPack: async (pack) => {
      const manifest = get().manifest;
      if (manifest) await loadPack(manifest, pack);
      else await get().loadMainPacks();
    },

    setPackSearchQuery: (pack, query) => {
      const normalized = query.trim().normalize("NFKC").toLowerCase();
      if (!normalized) {
        set((state) => ({
          searchQueries: { ...state.searchQueries, [pack]: query },
          searchResults: { ...state.searchResults, [pack]: [] },
        }));
        return;
      }
      const exactCodePoint = codePointQuery(normalized);
      const results: CharacterRecord[] = [];
      const seen = new Set<string>();
      for (const entry of mainEntries[pack]) {
        const matches =
          (exactCodePoint !== null &&
            entry.grapheme.codePointAt(0) === exactCodePoint) ||
          normalizedSearchText(entry).includes(normalized);
        if (!matches || seen.has(entry.grapheme)) continue;
        seen.add(entry.grapheme);
        results.push(entry);
        if (results.length >= MAX_SEARCH_RESULTS) break;
      }
      set((state) => ({
        searchQueries: { ...state.searchQueries, [pack]: query },
        searchResults: { ...state.searchResults, [pack]: results },
      }));
    },

    loadUnicodeManifest: async () => {
      if (get().unicodeManifest || get().unicodeStatus === "loading") return;
      const manifest = get().manifest;
      if (!manifest) {
        await get().loadMainPacks();
      }
      const currentManifest = get().manifest;
      if (!currentManifest) return;
      set({ unicodeStatus: "loading", unicodeError: null });
      try {
        const unicodeManifest = await fetchJson<UnicodeManifest>(
          assetUrl(currentManifest.unicodeManifest)
        );
        set({ unicodeManifest, unicodeStatus: "ready" });
      } catch (error) {
        set({ unicodeStatus: "error", unicodeError: errorMessage(error) });
      }
    },

    loadUnicodePage: async (facetType, facetId, offset = 0) => {
      await get().loadUnicodeManifest();
      const manifest = get().unicodeManifest;
      if (!manifest) return;
      const facet = manifest.facets[facetType].find(
        (candidate) => candidate.id === facetId
      );
      if (!facet) return;
      const codePoints = codePointsFromRanges(facet.ranges, offset, PAGE_SIZE);
      const records = await loadRecords(manifest, codePoints);
      set((state) => ({
        unicodeFacetType: facetType,
        unicodeFacetId: facetId,
        unicodeOffset: offset,
        unicodeResults:
          offset === 0 ? records : [...state.unicodeResults, ...records],
        unicodeHasMore: offset + codePoints.length < facet.count,
      }));
    },

    searchUnicode: async (query) => {
      await get().loadUnicodeManifest();
      const manifest = get().unicodeManifest;
      if (!manifest || !query.trim()) return;
      set({ unicodeSearchLoading: true });
      try {
        const directCodePoint =
          codePointQuery(query) ??
          (Array.from(query.trim()).length === 1
            ? query.trim().codePointAt(0) ?? null
            : null);
        let codePoints: number[];
        if (directCodePoint !== null) {
          codePoints = [directCodePoint];
        } else {
          const normalized = query.trim().normalize("NFKC").toLowerCase();
          codePoints = await searchUnicodeNames(
            assetUrl(manifest.nameIndex),
            normalized
          );
        }
        const records = await loadRecords(manifest, codePoints);
        set({
          unicodeResults: records,
          unicodeFacetId: null,
          unicodeOffset: 0,
          unicodeHasMore: false,
        });
      } finally {
        set({ unicodeSearchLoading: false });
      }
    },
  };
});
