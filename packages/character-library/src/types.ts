export type CharacterPackId = 'essentials' | 'nerd' | 'emoji';
export type CharacterViewId = CharacterPackId | 'unicode';
export type UnicodeFacetType = 'block' | 'script' | 'category';

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

export type PackedCharacterRecord = Pick<CharacterRecord, 'id' | 'grapheme' | 'name'> &
  Partial<Omit<CharacterRecord, 'id' | 'grapheme' | 'name'>>;

export interface PackedCharacterGroup {
  id: string;
  label: string;
  entries: PackedCharacterRecord[];
}

export interface PackAsset {
  schemaVersion: number;
  groups: PackedCharacterGroup[];
}

export interface CharacterManifest {
  schemaVersion: number;
  unicodeVersion: string;
  emojiVersion: string;
  packs: Record<CharacterPackId, string>;
  unicodeManifest: string;
  counts: Record<CharacterPackId | 'main' | 'unicode', number>;
}

export interface UnicodeFacet {
  id: string;
  label: string;
  count: number;
  ranges: Array<[number, number]>;
}

export interface UnicodeManifest {
  schemaVersion: number;
  unicodeVersion: string;
  shardSize: number;
  shards: Record<string, string>;
  nameIndex: string;
  facets: Record<UnicodeFacetType, UnicodeFacet[]>;
}
