import type {
  CharacterGroup,
  CharacterManifest,
  CharacterPackId,
  CharacterRecord,
  PackAsset,
  PackedCharacterGroup,
  UnicodeFacetType,
  UnicodeManifest,
} from './types.js';
export * from './types.js';
export const CHARACTER_PAGE_SIZE = 240;
export const CHARACTER_SEARCH_LIMIT = 100;
export const CHARACTER_SHARD_CACHE_LIMIT = 8;
export type CharacterResourcePort = {
  readJson: <T>(path: string) => Promise<T>;
  searchNames?: (path: string, query: string, limit: number) => Promise<number[]>;
  yield?: () => Promise<void>;
};
export const normalizeCharacterQuery = (query: string) =>
  query.trim().normalize('NFKC').toLowerCase();
export const codePointQuery = (query: string) => {
  const match = query.trim().match(/^(?:U\+|0X)?([0-9A-F]{2,6})$/i);
  return match ? Number.parseInt(match[1]!, 16) : null;
};
export const normalizedSearchText = (entry: CharacterRecord) =>
  `${entry.grapheme} ${entry.id} ${entry.name} ${entry.aliases.join(' ')}`
    .normalize('NFKC')
    .toLowerCase();
export const normalizePackGroups = (
  pack: CharacterPackId,
  groups: PackedCharacterGroup[]
): CharacterGroup[] =>
  groups.map((group) => ({
    ...group,
    entries: group.entries.map((entry) => ({
      aliases: [],
      category: pack === 'nerd' ? 'Co' : pack === 'emoji' ? 'Emoji' : 'So',
      script: pack === 'nerd' ? 'Private_Use' : 'Common',
      coverage: pack === 'nerd' ? 1 : pack === 'emoji' ? 4 : 0,
      insertable: true,
      ...entry,
    })),
  }));
export function searchCharacterEntries(
  entries: readonly CharacterRecord[],
  query: string,
  limit = CHARACTER_SEARCH_LIMIT,
  offset = 0
) {
  const normalized = normalizeCharacterQuery(query);
  if (!normalized) return [];
  const code = codePointQuery(normalized),
    seen = new Set<string>(),
    result: CharacterRecord[] = [];
  let skipped = 0;
  for (const entry of entries) {
    if (
      seen.has(entry.grapheme) ||
      !(
        (code !== null && entry.grapheme.codePointAt(0) === code) ||
        normalizedSearchText(entry).includes(normalized)
      )
    )
      continue;
    seen.add(entry.grapheme);
    if (skipped++ < offset) continue;
    result.push(entry);
    if (result.length >= limit) break;
  }
  return result;
}
export function searchUnicodeNameIndex(
  entries: readonly (readonly [number, string])[],
  query: string,
  limit: number
) {
  const result: number[] = [];
  for (const [code, text] of entries) {
    if (text.includes(query)) {
      result.push(code);
      if (result.length >= limit) break;
    }
  }
  return result;
}
export function codePointsFromRanges(
  ranges: Array<[number, number]>,
  offset: number,
  limit: number
) {
  const result: number[] = [];
  let skipped = 0;
  for (const [start, end] of ranges) {
    const length = end - start + 1;
    if (skipped + length <= offset) {
      skipped += length;
      continue;
    }
    for (
      let value = start + Math.max(0, offset - skipped);
      value <= end && result.length < limit;
      value++
    )
      result.push(value);
    skipped += length;
    if (result.length >= limit) break;
  }
  return result;
}
const pageBounds = (offset: number, limit: number) => {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > CHARACTER_PAGE_SIZE
  )
    throw new Error('Invalid character page.');
};

/** Shared catalog and bounded resource caches. Hosts own transport, workers and UI state. */
export class CharacterLibrary {
  #manifest: Promise<CharacterManifest> | null = null;
  #unicode: Promise<UnicodeManifest> | null = null;
  #packs = new Map<CharacterPackId, Promise<CharacterGroup[]>>();
  #shards = new Map<string, CharacterRecord[]>();
  #pending = new Map<string, Promise<CharacterRecord[]>>();
  #names: Promise<{ entries: Array<[number, string]> }> | null = null;
  readonly port: CharacterResourcePort;
  constructor(port: CharacterResourcePort) {
    this.port = port;
  }
  get cachedShards() {
    return this.#shards.size;
  }
  manifest() {
    return (this.#manifest ??= this.port
      .readJson<CharacterManifest>('manifest.json')
      .then((value) => {
        if (value.schemaVersion !== 1 || !value.packs || !value.unicodeManifest)
          throw new Error('Unsupported character manifest.');
        return value;
      })
      .catch((error) => {
        this.#manifest = null;
        throw error;
      }));
  }
  unicodeManifest() {
    return (this.#unicode ??= this.manifest()
      .then((manifest) => this.port.readJson<UnicodeManifest>(manifest.unicodeManifest))
      .then((value) => {
        if (
          value.schemaVersion !== 1 ||
          !Number.isSafeInteger(value.shardSize) ||
          value.shardSize < 1 ||
          !value.facets ||
          !value.shards ||
          !value.nameIndex
        )
          throw new Error('Unsupported Unicode manifest.');
        return value;
      })
      .catch((error) => {
        this.#unicode = null;
        throw error;
      }));
  }
  pack(pack: CharacterPackId) {
    let task = this.#packs.get(pack);
    if (!task) {
      task = this.manifest()
        .then((manifest) => this.port.readJson<PackAsset>(manifest.packs[pack]))
        .then((asset) => {
          if (
            (asset.schemaVersion !== undefined && asset.schemaVersion !== 1) ||
            !Array.isArray(asset.groups)
          )
            throw new Error('Unsupported character pack.');
          return normalizePackGroups(pack, asset.groups);
        })
        .catch((error) => {
          this.#packs.delete(pack);
          throw error;
        });
      this.#packs.set(pack, task);
    }
    return task;
  }
  async #shard(manifest: UnicodeManifest, id: string) {
    const cached = this.#shards.get(id);
    if (cached) {
      this.#shards.delete(id);
      this.#shards.set(id, cached);
      return cached;
    }
    let task = this.#pending.get(id);
    if (!task) {
      const path = manifest.shards[id];
      if (!path) return [];
      task = this.port
        .readJson<{ records: CharacterRecord[] }>(path)
        .then((data) => {
          if (!Array.isArray(data.records)) throw new Error('Invalid Unicode shard.');
          this.#shards.set(id, data.records);
          while (this.#shards.size > CHARACTER_SHARD_CACHE_LIMIT)
            this.#shards.delete(this.#shards.keys().next().value!);
          return data.records;
        })
        .finally(() => this.#pending.delete(id));
      this.#pending.set(id, task);
    }
    return task;
  }
  async records(codePoints: readonly number[]) {
    if (
      codePoints.length > CHARACTER_PAGE_SIZE ||
      codePoints.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 0x10ffff)
    )
      throw new Error('Invalid Unicode code points.');
    const manifest = await this.unicodeManifest();
    const wanted = new Set(codePoints),
      ids = [
        ...new Set(
          codePoints.map((value) =>
            Math.floor(value / manifest.shardSize)
              .toString(16)
              .padStart(3, '0')
          )
        ),
      ];
    const byCode = new Map<number, CharacterRecord>();
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, ids.length) }, async () => {
        while (cursor < ids.length) {
          const id = ids[cursor++]!;
          for (const record of await this.#shard(manifest, id)) {
            const code = record.grapheme.codePointAt(0);
            if (code !== undefined && wanted.has(code)) byCode.set(code, record);
          }
        }
      })
    );
    return codePoints.flatMap((value) => {
      const record = byCode.get(value);
      return record ? [record] : [];
    });
  }
  async unicodePage(type: UnicodeFacetType, id: string, offset = 0, limit = CHARACTER_PAGE_SIZE) {
    pageBounds(offset, limit);
    const manifest = await this.unicodeManifest(),
      facet = manifest.facets[type]?.find((item) => item.id === id);
    if (!facet) throw new Error('Unknown Unicode facet.');
    const codes = codePointsFromRanges(facet.ranges, offset, limit);
    return { records: await this.records(codes), hasMore: offset + codes.length < facet.count };
  }
  async searchUnicode(query: string, offset = 0, limit = CHARACTER_SEARCH_LIMIT) {
    pageBounds(offset, limit);
    const normalized = normalizeCharacterQuery(query);
    if (!normalized) return { records: [], hasMore: false };
    const direct =
      codePointQuery(query) ??
      (Array.from(query.trim()).length === 1 ? (query.trim().codePointAt(0) ?? null) : null);
    if (direct !== null)
      return { records: offset ? [] : await this.records([direct]), hasMore: false };
    const manifest = await this.unicodeManifest();
    let codes: number[];
    if (this.port.searchNames)
      codes = await this.port.searchNames(manifest.nameIndex, normalized, offset + limit + 1);
    else {
      const index = await (this.#names ??= this.port
        .readJson<{ entries: Array<[number, string]> }>(manifest.nameIndex)
        .catch((error) => {
          this.#names = null;
          throw error;
        }));
      codes = [];
      for (let start = 0; start < index.entries.length; start += 2048) {
        codes.push(
          ...searchUnicodeNameIndex(
            index.entries.slice(start, start + 2048),
            normalized,
            offset + limit + 1 - codes.length
          )
        );
        if (codes.length >= offset + limit + 1) break;
        await this.port.yield?.();
      }
    }
    return {
      records: await this.records(codes.slice(offset, offset + limit)),
      hasMore: codes.length > offset + limit,
    };
  }
}
