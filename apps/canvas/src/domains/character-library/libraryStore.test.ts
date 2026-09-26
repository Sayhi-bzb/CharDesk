import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useLibraryStore,
  type CharacterRecord,
} from "@/domains/character-library/public";

const record = (
  grapheme: string,
  name: string,
  overrides: Partial<CharacterRecord> = {}
): CharacterRecord => ({
  id: `U+${grapheme.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`,
  grapheme,
  name,
  aliases: [],
  category: "So",
  script: "Common",
  coverage: 1,
  insertable: true,
  ...overrides,
});

const manifest = {
  schemaVersion: 1,
  unicodeVersion: "17.0.0",
  emojiVersion: "17.0",
  packs: {
    essentials: "packs/essentials.json",
    nerd: "packs/nerd.json",
    emoji: "packs/emoji.json",
  },
  unicodeManifest: "unicode/manifest.json",
  counts: { essentials: 1, nerd: 1, emoji: 1, main: 3, unicode: 1 },
};

const payloads: Record<string, unknown> = {
  "manifest.json": manifest,
  "packs/essentials.json": {
    groups: [{ id: "ascii", label: "ASCII", entries: [record("A", "LATIN CAPITAL LETTER A")] }],
  },
  "packs/nerd.json": {
    groups: [{ id: "icons", label: "Icons", entries: [{
      id: "U+E5FF", grapheme: "", name: "nf-folder",
    }] }],
  },
  "packs/emoji.json": {
    groups: [{ id: "faces", label: "Faces", entries: [{
      id: "U+1F600", grapheme: "😀", name: "grinning face", aliases: ["face-smiling"],
    }] }],
  },
  "unicode/manifest.json": {
    schemaVersion: 1,
    unicodeVersion: "17.0.0",
    shardSize: 1024,
    shards: { "000": "unicode/shards/000.json" },
    nameIndex: "unicode/name-index.json",
    facets: {
      block: [{ id: "basic-latin", label: "Basic Latin", count: 1, ranges: [[65, 65]] }],
      script: [{ id: "latin", label: "Latin", count: 1, ranges: [[65, 65]] }],
      category: [{ id: "lu", label: "Lu", count: 1, ranges: [[65, 65]] }],
    },
  },
  "unicode/shards/000.json": {
    records: [record("A", "LATIN CAPITAL LETTER A")],
  },
  "unicode/name-index.json": {
    entries: [[65, "latin capital letter a"]],
  },
};

const mockFetch = (failPath?: string) => {
  const requested: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = String(input).split("/data/characters/")[1];
    requested.push(path);
    if (path === failPath) return new Response("failed", { status: 503 });
    return new Response(JSON.stringify(payloads[path]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
  return requested;
};

const resetStore = () => {
  useLibraryStore.setState({
    manifest: null,
    packs: {},
    packStatus: { essentials: "idle", nerd: "idle", emoji: "idle" },
    packErrors: {},
    searchQueries: { essentials: "", nerd: "", emoji: "" },
    searchResults: { essentials: [], nerd: [], emoji: [] },
    unicodeManifest: null,
    unicodeStatus: "idle",
    unicodeError: null,
    unicodeFacetType: "block",
    unicodeFacetId: null,
    unicodeResults: [],
    unicodeOffset: 0,
    unicodeHasMore: false,
    unicodeSearchLoading: false,
  });
};

describe("useLibraryStore", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetStore();
  });

  it("loads all main packs and scopes names, aliases, and U+ searches by pack", async () => {
    mockFetch();
    await useLibraryStore.getState().loadMainPacks();

    expect(useLibraryStore.getState().packStatus).toEqual({
      essentials: "ready",
      nerd: "ready",
      emoji: "ready",
    });
    expect(useLibraryStore.getState().packs.nerd?.[0].entries[0]).toEqual(
      expect.objectContaining({
        category: "Co",
        script: "Private_Use",
        coverage: 1,
        insertable: true,
      })
    );
    expect(useLibraryStore.getState().packs.emoji?.[0].entries[0]).toEqual(
      expect.objectContaining({
        aliases: ["face-smiling"],
        category: "Emoji",
        script: "Common",
        coverage: 4,
      })
    );
    useLibraryStore.getState().setPackSearchQuery("nerd", "folder");
    expect(useLibraryStore.getState().searchResults.nerd[0]?.grapheme).toBe("");
    expect(useLibraryStore.getState().searchResults.emoji).toEqual([]);
    useLibraryStore.getState().setPackSearchQuery("emoji", "face-smiling");
    expect(useLibraryStore.getState().searchResults.emoji[0]?.grapheme).toBe("😀");
    useLibraryStore.getState().setPackSearchQuery("emoji", "U+1F600");
    expect(useLibraryStore.getState().searchResults.emoji[0]?.grapheme).toBe("😀");
    expect(useLibraryStore.getState().searchQueries).toEqual({
      essentials: "",
      nerd: "folder",
      emoji: "U+1F600",
    });
  });

  it("keeps successful packs when one pack fails", async () => {
    mockFetch("packs/nerd.json");
    await useLibraryStore.getState().loadMainPacks();

    expect(useLibraryStore.getState().packStatus).toEqual({
      essentials: "ready",
      nerd: "error",
      emoji: "ready",
    });
    expect(useLibraryStore.getState().packs.essentials).toBeDefined();
    expect(useLibraryStore.getState().packErrors.nerd).toContain("503");
  });

  it("loads only the Unicode manifest until a facet page is requested", async () => {
    const requested = mockFetch();
    await useLibraryStore.getState().loadMainPacks();
    await useLibraryStore.getState().loadUnicodeManifest();

    expect(requested).toContain("unicode/manifest.json");
    expect(requested).not.toContain("unicode/shards/000.json");

    await useLibraryStore
      .getState()
      .loadUnicodePage("block", "basic-latin");
    expect(requested).toContain("unicode/shards/000.json");
    expect(useLibraryStore.getState().unicodeResults[0]?.name).toBe(
      "LATIN CAPITAL LETTER A"
    );
  });

  it("loads the Unicode name index only for name search", async () => {
    const requested = mockFetch();
    await useLibraryStore.getState().loadMainPacks();
    await useLibraryStore.getState().searchUnicode("latin capital");

    expect(requested).toContain("unicode/name-index.json");
    expect(useLibraryStore.getState().unicodeResults[0]?.grapheme).toBe("A");
  });
});
