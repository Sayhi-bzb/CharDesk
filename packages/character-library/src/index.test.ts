import { expect, test } from 'vitest';
import { CharacterLibrary, searchCharacterEntries, type CharacterRecord } from './index.js';
const record = (code: number): CharacterRecord => ({
  id: `U+${code.toString(16).padStart(4, '0')}`,
  grapheme: String.fromCodePoint(code),
  name: `Letter ${code}`,
  aliases: ['alias'],
  category: 'Lu',
  script: 'Latin',
  coverage: 1,
  insertable: true,
});
function fixture() {
  const reads: string[] = [],
    records = Array.from({ length: 12 }, (_, i) => record(65 + i));
  let concurrent = 0,
    peak = 0,
    fail = '';
  const payloads: Record<string, unknown> = {
    'manifest.json': {
      schemaVersion: 1,
      packs: { essentials: 'pack.json', nerd: 'pack.json', emoji: 'pack.json' },
      unicodeManifest: 'unicode.json',
    },
    'pack.json': {
      groups: [
        {
          id: 'letters',
          label: 'Letters',
          entries: records.map(({ grapheme, id, name }) => ({ grapheme, id, name })),
        },
      ],
    },
    'unicode.json': {
      schemaVersion: 1,
      shardSize: 1,
      nameIndex: 'names.json',
      shards: Object.fromEntries(
        records.map((item) => [
          item.grapheme.codePointAt(0)!.toString(16).padStart(3, '0'),
          `${item.id}.json`,
        ])
      ),
      facets: {
        block: [{ id: 'letters', label: 'Letters', count: 12, ranges: [[65, 76]] }],
        script: [],
        category: [],
      },
    },
    'names.json': {
      entries: records.map((item) => [item.grapheme.codePointAt(0), item.name.toLowerCase()]),
    },
    ...Object.fromEntries(records.map((item) => [`${item.id}.json`, { records: [item] }])),
  };
  const library = new CharacterLibrary({
    async readJson<T>(path: string) {
      reads.push(path);
      concurrent++;
      peak = Math.max(peak, concurrent);
      await Promise.resolve();
      concurrent--;
      if (fail === path) {
        fail = '';
        throw new Error('Unavailable');
      }
      return payloads[path] as T;
    },
  });
  return {
    library,
    reads,
    records,
    get peak() {
      return peak;
    },
    fail(path: string) {
      fail = path;
    },
  };
}
test('packs load once on demand and preserve default metadata, search normalization and deduplication', async () => {
  const f = fixture();
  const [first, second] = await Promise.all([f.library.pack('nerd'), f.library.pack('nerd')]);
  expect(first).toBe(second);
  expect(f.reads).toEqual(['manifest.json', 'pack.json']);
  expect(first[0]!.entries[0]).toMatchObject({
    category: 'Co',
    script: 'Private_Use',
    coverage: 1,
    insertable: true,
    aliases: [],
  });
  const entries = [...f.records, f.records[0]!];
  expect(searchCharacterEntries(entries, 'Ａ')).toHaveLength(12);
  expect(searchCharacterEntries(entries, 'U+0041').map((item) => item.grapheme)).toEqual(['A']);
  expect(searchCharacterEntries(entries, 'alias', 3, 3).map((item) => item.grapheme)).toEqual([
    'D',
    'E',
    'F',
  ]);
});
test('Unicode pages preserve order with four concurrent shard reads and an eight-shard cache', async () => {
  const f = fixture();
  await f.library.unicodeManifest();
  expect(f.reads).toEqual(['manifest.json', 'unicode.json']);
  const page = await f.library.unicodePage('block', 'letters', 0, 12);
  expect(page.records).toEqual(f.records);
  expect(page.hasMore).toBe(false);
  expect(f.peak).toBeLessThanOrEqual(4);
  expect(f.library.cachedShards).toBe(8);
  const count = f.reads.length;
  await f.library.records([76]);
  expect(f.reads).toHaveLength(count);
  await f.library.records([65]);
  expect(f.reads).toHaveLength(count + 1);
  expect(await f.library.records([76, 65])).toEqual([f.records[11], f.records[0]]);
});
test('direct lookup avoids name data, name search paginates, and failed resources can retry', async () => {
  const f = fixture();
  expect((await f.library.searchUnicode('U+0041')).records).toEqual([f.records[0]]);
  expect(f.reads).not.toContain('names.json');
  f.fail('names.json');
  await expect(f.library.searchUnicode('letter')).rejects.toThrow('Unavailable');
  expect(await f.library.searchUnicode('letter', 3, 3)).toEqual({
    records: f.records.slice(3, 6),
    hasMore: true,
  });
  f.fail('pack.json');
  await expect(f.library.pack('emoji')).rejects.toThrow('Unavailable');
  expect(await f.library.pack('emoji')).toHaveLength(1);
  await expect(f.library.records([Infinity])).rejects.toThrow();
  await expect(f.library.unicodePage('block', 'missing')).rejects.toThrow();
});
