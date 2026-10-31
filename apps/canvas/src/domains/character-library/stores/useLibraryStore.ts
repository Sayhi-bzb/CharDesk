import { create } from 'zustand';

import {
  CharacterLibrary,
  searchCharacterEntries,
  type CharacterPackId,
  type CharacterRecord,
  type CharacterGroup,
  type UnicodeFacetType,
  type CharacterManifest,
  type UnicodeManifest,
} from '@chardesk/character-library';
export type {
  CharacterPackId,
  CharacterViewId,
  CharacterRecord,
  CharacterGroup,
  UnicodeFacetType,
} from '@chardesk/character-library';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

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
  loadUnicodePage: (facetType: UnicodeFacetType, facetId: string, offset?: number) => Promise<void>;
  searchUnicode: (query: string) => Promise<void>;
}

const DATA_ROOT = `${import.meta.env.BASE_URL}data/characters/`;
const initialPackStatus: Record<CharacterPackId, LoadStatus> = {
  essentials: 'idle',
  nerd: 'idle',
  emoji: 'idle',
};
const initialSearchQueries: Record<CharacterPackId, string> = {
  essentials: '',
  nerd: '',
  emoji: '',
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
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType && !contentType.includes('json')) {
    throw new Error(`Expected JSON for ${url}, received ${contentType}`);
  }
  return response.json() as Promise<T>;
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Character data failed to load';

const searchUnicodeNames = async (
  indexUrl: string,
  normalizedQuery: string,
  limit: number
): Promise<number[]> => {
  if (!nameSearchWorker) {
    nameSearchWorker = new Worker(new URL('./unicode-name-search.worker.ts', import.meta.url), {
      type: 'module',
    });
    const worker = nameSearchWorker;
    const fail = () => {
      if (nameSearchWorker !== worker) return;
      nameSearchWorker = null;
      worker.terminate();
      for (const pending of pendingNameSearches.values())
        pending.reject(new Error('Unicode search worker failed. Retry the search.'));
      pendingNameSearches.clear();
    };
    worker.addEventListener('error', fail);
    worker.addEventListener('messageerror', fail);
    nameSearchWorker.addEventListener(
      'message',
      (
        event: MessageEvent<{
          id: number;
          codePoints?: number[];
          error?: string;
        }>
      ) => {
        const pending = pendingNameSearches.get(event.data.id);
        if (!pending) return;
        pendingNameSearches.delete(event.data.id);
        if (event.data.error) pending.reject(new Error(event.data.error));
        else pending.resolve(event.data.codePoints ?? []);
      }
    );
  }
  const id = nextSearchRequestId++;
  const result = new Promise<number[]>((resolve, reject) => {
    pendingNameSearches.set(id, { resolve, reject });
  });
  nameSearchWorker.postMessage({
    id,
    indexUrl,
    query: normalizedQuery,
    limit,
  });
  return result;
};

const rebuildMainEntries = (packs: Partial<Record<CharacterPackId, CharacterGroup[]>>) => {
  mainEntries = {
    essentials: packs.essentials?.flatMap((group) => group.entries) ?? [],
    nerd: packs.nerd?.flatMap((group) => group.entries) ?? [],
    emoji: packs.emoji?.flatMap((group) => group.entries) ?? [],
  };
};

const createLibrary = () =>
  new CharacterLibrary({
    readJson: <T>(path: string) => fetchJson<T>(assetUrl(path)),
    searchNames:
      typeof Worker === 'undefined'
        ? undefined
        : (path, query, limit) => searchUnicodeNames(assetUrl(path), query, limit),
  });
let library = createLibrary();
let unicodeRequest = 0;

export const useLibraryStore = create<LibraryState>((set, get) => {
  const loadPack = async (pack: CharacterPackId) => {
    set((state) => ({
      packStatus: { ...state.packStatus, [pack]: 'loading' },
      packErrors: { ...state.packErrors, [pack]: undefined },
    }));
    try {
      const groups = await library.pack(pack);
      set((state) => {
        const packs = {
          ...state.packs,
          [pack]: groups,
        };
        rebuildMainEntries(packs);
        return {
          packs,
          packStatus: { ...state.packStatus, [pack]: 'ready' },
        };
      });
    } catch (error) {
      set((state) => ({
        packStatus: { ...state.packStatus, [pack]: 'error' },
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
    unicodeStatus: 'idle',
    unicodeError: null,
    unicodeFacetType: 'block',
    unicodeFacetId: null,
    unicodeResults: [],
    unicodeOffset: 0,
    unicodeHasMore: false,
    unicodeSearchLoading: false,

    loadMainPacks: async () => {
      if (get().manifest) return;
      if (Object.values(get().packStatus).every((status) => status === 'idle')) {
        library = createLibrary();
        rebuildMainEntries({});
      }
      set({ packStatus: { essentials: 'loading', nerd: 'loading', emoji: 'loading' } });
      try {
        const manifest = await library.manifest();
        set({ manifest });
        await Promise.all((['essentials', 'nerd', 'emoji'] as const).map((pack) => loadPack(pack)));
      } catch (error) {
        const message = errorMessage(error);
        set({
          packStatus: {
            essentials: 'error',
            nerd: 'error',
            emoji: 'error',
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
      if (manifest) await loadPack(pack);
      else await get().loadMainPacks();
    },

    setPackSearchQuery: (pack, query) => {
      const results = searchCharacterEntries(mainEntries[pack], query);
      set((state) => ({
        searchQueries: { ...state.searchQueries, [pack]: query },
        searchResults: { ...state.searchResults, [pack]: results },
      }));
    },

    loadUnicodeManifest: async () => {
      if (get().unicodeManifest || get().unicodeStatus === 'loading') return;
      const manifest = get().manifest;
      if (!manifest) {
        await get().loadMainPacks();
      }
      const currentManifest = get().manifest;
      if (!currentManifest) return;
      set({ unicodeStatus: 'loading', unicodeError: null });
      try {
        const unicodeManifest = await library.unicodeManifest();
        set({ unicodeManifest, unicodeStatus: 'ready' });
      } catch (error) {
        set({ unicodeStatus: 'error', unicodeError: errorMessage(error) });
      }
    },

    loadUnicodePage: async (facetType, facetId, offset = 0) => {
      const request = ++unicodeRequest;
      await get().loadUnicodeManifest();
      if (!get().unicodeManifest || request !== unicodeRequest) return;
      try {
        const page = await library.unicodePage(facetType, facetId, offset);
        if (request !== unicodeRequest) return;
        set((state) => ({
          unicodeFacetType: facetType,
          unicodeFacetId: facetId,
          unicodeOffset: offset,
          unicodeResults: offset === 0 ? page.records : [...state.unicodeResults, ...page.records],
          unicodeHasMore: page.hasMore,
          unicodeError: null,
          unicodeSearchLoading: false,
        }));
      } catch (error) {
        if (request === unicodeRequest)
          set({ unicodeError: errorMessage(error), unicodeSearchLoading: false });
      }
    },

    searchUnicode: async (query) => {
      const request = ++unicodeRequest;
      await get().loadUnicodeManifest();
      if (!get().unicodeManifest || request !== unicodeRequest) return;
      if (!query.trim()) {
        set({
          unicodeResults: [],
          unicodeFacetId: null,
          unicodeHasMore: false,
          unicodeSearchLoading: false,
        });
        return;
      }
      set({ unicodeSearchLoading: true, unicodeError: null });
      try {
        const result = await library.searchUnicode(query);
        if (request !== unicodeRequest) return;
        set({
          unicodeResults: result.records,
          unicodeFacetId: null,
          unicodeOffset: 0,
          unicodeHasMore: false,
        });
      } catch (error) {
        if (request === unicodeRequest) set({ unicodeError: errorMessage(error) });
      } finally {
        if (request === unicodeRequest) set({ unicodeSearchLoading: false });
      }
    },
  };
});
