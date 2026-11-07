import { readFile } from 'node:fs/promises';
import {
  CharacterLibrary,
  searchCharacterEntries,
  type CharacterGroup,
  type CharacterPackId,
  type CharacterRecord,
  type CharacterViewId,
  type UnicodeFacetType,
} from '@chardesk/character-library';
import type { KeyEvent } from '@opentui/core';
import type { CanvasSurface, TerminalPanel } from './surface.ts';

export function createLocalCharacterLibrary(root = new URL('./characters/', import.meta.url)) {
  return new CharacterLibrary({
    async readJson<T>(path: string) {
      const url = new URL(path, root);
      if (url.protocol !== 'file:' || !url.href.startsWith(root.href))
        throw new Error('Invalid character resource path.');
      return JSON.parse(await readFile(url, 'utf8')) as T;
    },
    yield: () => Bun.sleep(0),
  });
}
export type CharacterPickerHost = {
  surface: CanvasSurface;
  show: (panel: TerminalPanel, enter: () => void, special?: (key: KeyEvent) => boolean) => void;
  dismiss: () => void;
  target: () => string;
};
const views: CharacterViewId[] = ['essentials', 'nerd', 'emoji', 'unicode'];
const PAGE = 20;
/** Transient picker; resource completion never performs a document mutation. */
export class CharacterPicker {
  #generation = 0;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #alive = true;
  #panel: TerminalPanel | null = null;
  #committing = false;
  readonly #detach: () => void;
  #view: CharacterViewId = 'essentials';
  #group: string | null = null;
  #facet: { type: UnicodeFacetType; id: string } | null = null;
  #offset = 0;
  #query = '';
  #target = '';
  #mode: 'insert' | 'brush' = 'insert';
  constructor(
    readonly host: CharacterPickerHost,
    readonly library = createLocalCharacterLibrary()
  ) {
    this.#detach = host.surface.model.subscribe(() => {
      if (
        !this.#committing &&
        this.#target &&
        this.#panel === host.surface.panel &&
        host.target() !== this.#target
      )
        host.dismiss();
    });
  }

  cancel() {
    this.#generation++;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }
  close() {
    this.cancel();
    this.#target = '';
    this.#panel = null;
  }
  dispose() {
    this.#detach();
    this.close();
    this.#alive = false;
  }
  open(mode: 'insert' | 'brush' = 'insert') {
    this.#target = '';
    this.cancel();
    this.#mode = mode;
    this.#offset = 0;
    this.#query = '';
    this.#records();
    this.#target = this.host.target();
  }
  #current(panel: TerminalPanel, generation: number) {
    return this.#alive && this.host.surface.panel === panel && generation === this.#generation;
  }
  #records() {
    let records: CharacterRecord[] = [],
      hasMore = false,
      loading = false;
    const panel: TerminalPanel = {
      title: this.host.surface.t('Character library'),
      input: this.#query,
      items: [],
      selected: 0,
      hint: '',
    };
    const refreshHint = () => {
      panel.hint = this.host.surface
        .t`F10 ${this.#view} · F11 groups/facets · F5/F6 page · F9 retry · Enter`;
    };
    const load = async () => {
      const generation = ++this.#generation;
      loading = true;
      panel.error = undefined;
      panel.items = [this.host.surface.t('Loading…')];
      panel.selected = 0;
      refreshHint();
      this.host.surface.requestRender();
      try {
        let result: { records: CharacterRecord[]; hasMore: boolean };
        if (this.#view === 'unicode') {
          if (this.#query.trim())
            result = await this.library.searchUnicode(this.#query, this.#offset, PAGE);
          else {
            const manifest = await this.library.unicodeManifest();
            const facet = this.#facet ?? {
              type: 'block' as const,
              id:
                manifest.facets.block.find((facet) => facet.id === 'basic-latin')?.id ??
                manifest.facets.block[0]?.id ??
                '',
            };
            result = await this.library.unicodePage(facet.type, facet.id, this.#offset, PAGE);
          }
        } else {
          const groups = await this.library.pack(this.#view);
          const entries = (
            this.#group ? groups.filter((group) => group.id === this.#group) : groups
          ).flatMap((group) => group.entries);
          const matches = this.#query.trim()
            ? searchCharacterEntries(entries, this.#query, PAGE + 1, this.#offset)
            : entries.slice(this.#offset, this.#offset + PAGE + 1);
          result = { records: matches.slice(0, PAGE), hasMore: matches.length > PAGE };
        }
        if (!this.#current(panel, generation)) return;
        records = result.records;
        hasMore = result.hasMore;
        panel.items = records.length
          ? records.map(
              (record) =>
                `${record.grapheme.replace(/\p{Cc}/gu, '□')}  ${record.id}  ${record.name}${record.insertable ? '' : this.host.surface.t(' [not insertable]')}`
            )
          : [this.host.surface.t('No characters found')];
      } catch (error) {
        if (!this.#current(panel, generation)) return;
        records = [];
        panel.items = [];
        panel.error = this.host.surface
          .t`Load failed; F9 retries: ${error instanceof Error ? error.message : String(error)}`;
      } finally {
        if (this.#current(panel, generation)) {
          loading = false;
          this.host.surface.requestRender();
        }
      }
    };
    panel.onInput = (value) => {
      this.#query = value;
      this.#offset = 0;
      this.cancel();
      if (this.#timer) clearTimeout(this.#timer);
      loading = true;
      panel.items = [this.host.surface.t('Searching…')];
      this.#timer = setTimeout(() => {
        this.#timer = null;
        void load();
      }, 120);
    };
    const pick = () => {
      if (loading) return;
      const record = records[panel.selected];
      if (!record) return;
      if (!record.insertable) {
        panel.error = this.host.surface.t('This character cannot be inserted.');
        this.host.surface.requestRender();
        return;
      }
      if (this.host.target() !== this.#target) {
        this.host.dismiss();
        return;
      }
      if (this.#mode === 'brush') this.#commit(record, 'brush');
      else this.#actions(record);
    };
    panel.onPick = pick;
    this.#panel = panel;
    this.host.show(panel, pick, (key) => {
      if (key.name === 'f10') {
        this.cancel();
        this.#view = views[(views.indexOf(this.#view) + 1) % views.length]!;
        this.#group = null;
        this.#offset = 0;
        this.#records();
        return true;
      }
      if (key.name === 'f11') {
        this.cancel();
        void this.#facets();
        return true;
      }
      if (key.name === 'f9') {
        this.cancel();
        void load();
        return true;
      }
      if (key.name === 'f5' || key.name === 'f6') {
        if (loading) return true;
        if (key.name === 'f6' && !hasMore) return true;
        this.#offset = Math.max(0, this.#offset + (key.name === 'f6' ? PAGE : -PAGE));
        void load();
        return true;
      }
      return false;
    });
    void load();
  }
  async #facets() {
    const panel: TerminalPanel = {
      title: this.host.surface.t('Character groups and facets'),
      input: '',
      items: [this.host.surface.t('Loading…')],
      selected: 0,
      hint: this.host.surface.t('F9 / Enter / Esc'),
    };
    let choices: Array<{ label: string; choose: () => void }> = [];
    let filtered = choices;
    const refresh = () => {
      const query = (panel.input ?? '').trim().toLowerCase();
      filtered = choices.filter((item) => item.label.toLowerCase().includes(query));
      panel.items = filtered.length
        ? filtered.map((item) => item.label)
        : [this.host.surface.t('No groups found')];
      panel.selected = 0;
      this.host.surface.requestRender();
    };
    const pick = () => {
      const choice = filtered[panel.selected];
      if (!choice) return;
      choice.choose();
      this.#offset = 0;
      this.#query = '';
      this.#records();
    };
    panel.onPick = pick;
    panel.onInput = refresh;
    this.#panel = panel;
    this.host.show(panel, pick, (key) => {
      if (key.name === 'f9') {
        void this.#facets();
        return true;
      }
      return false;
    });
    const generation = ++this.#generation;
    try {
      if (this.#view === 'unicode') {
        const manifest = await this.library.unicodeManifest();
        choices = (['block', 'script', 'category'] as const).flatMap((type) =>
          manifest.facets[type].map((facet) => ({
            label: `${type} · ${facet.label} (${facet.count})`,
            choose: () => {
              this.#facet = { type, id: facet.id };
            },
          }))
        );
      } else {
        const groups: CharacterGroup[] = await this.library.pack(this.#view as CharacterPackId);
        choices = [
          {
            label: this.host.surface.t('All groups'),
            choose: () => {
              this.#group = null;
            },
          },
          ...groups.map((group) => ({
            label: group.label,
            choose: () => {
              this.#group = group.id;
            },
          })),
        ];
      }
      if (this.#current(panel, generation)) refresh();
    } catch (error) {
      if (this.#current(panel, generation)) {
        panel.items = [];
        panel.error = error instanceof Error ? error.message : String(error);
        this.host.surface.requestRender();
      }
    }
  }
  #actions(record: CharacterRecord) {
    const panel: TerminalPanel = {
      title: `${record.grapheme} · ${record.name}`,
      hint: 'Enter / Esc',
      items: [
        this.host.surface.t('Insert at cursor or fill selection'),
        this.host.surface.t('Use as brush glyph'),
      ],
      selected: 0,
    };
    const pick = () => this.#commit(record, panel.selected === 1 ? 'brush' : 'insert');
    panel.onPick = pick;
    this.#panel = panel;
    this.host.show(panel, pick);
  }
  #commit(record: CharacterRecord, mode: 'insert' | 'brush') {
    if (this.host.target() !== this.#target) {
      this.host.dismiss();
      return;
    }
    this.#committing = true;
    try {
      if (mode === 'brush') {
        this.host.surface.model.setDrawingSettings({ char: record.grapheme });
        this.host.surface.model.setTool('brush');
      } else this.host.surface.model.commands.insert(record.grapheme);
      this.host.dismiss();
    } catch (error) {
      if (this.host.surface.panel) {
        this.host.surface.panel.error = error instanceof Error ? error.message : String(error);
        this.host.surface.requestRender();
      }
    } finally {
      this.#committing = false;
    }
  }
}
