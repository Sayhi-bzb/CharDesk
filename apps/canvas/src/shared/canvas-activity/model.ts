/** Half-open Cell intervals. Rectangles are only a presentation of this footprint. */
export type ActivityRange = Readonly<{ y: number; from: number; to: number }>;
type Address = Readonly<{ canvasId: string; pageId: string }>;
type Stamp = Readonly<{ clock: number; id: string }>;
type Event = Stamp & { at: number } & (
  | (Address & { kind: 'mutation'; ranges: readonly ActivityRange[]; agent: boolean; deletion: boolean })
  | { kind: 'seen'; changes: readonly string[]; ranges: readonly ActivityRange[] }
  | { kind: 'clear'; canvasId: string; pageId?: string }
);
type Input = Event extends infer E ? E extends Event ? Omit<E, 'id' | 'clock' | 'at'> : never : never;
type Journal = { floor?: Stamp; events: readonly Event[] };
type Change = Address & { id: string; ranges: readonly ActivityRange[]; expiresAt: number };

export type CanvasActivityMarker = Address & Readonly<{
  id: string;
  changes: readonly string[];
  ranges: readonly ActivityRange[];
}>;

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DELETION_RETENTION_MS = 15_000;
// This is a bounded recent-activity journal, never a second document/history log.
const EVENT_LIMIT = 512;
const compare = (a: Stamp, b: Stamp) => a.clock - b.clock || a.id.localeCompare(b.id);
const sameAddress = (a: Address, b: Address) => a.canvasId === b.canvasId && a.pageId === b.pageId;

export function normalizeActivityRanges(ranges: readonly ActivityRange[]): ActivityRange[] {
  const sorted = [...ranges].sort((a, b) => a.y - b.y || a.from - b.from);
  const result: { y: number; from: number; to: number }[] = [];
  for (const range of sorted) {
    if (range.to <= range.from) continue;
    const last = result.at(-1);
    if (last && last.y === range.y && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else result.push({ ...range });
  }
  return result;
}

function subtract(ranges: readonly ActivityRange[], cuts: readonly ActivityRange[]): ActivityRange[] {
  const byRow = new Map<number, ActivityRange[]>();
  for (const cut of cuts) {
    const row = byRow.get(cut.y) ?? [];
    row.push(cut);
    byRow.set(cut.y, row);
  }
  return ranges.flatMap((range) => {
    let pieces = [range];
    for (const cut of byRow.get(range.y) ?? []) {
      pieces = pieces.flatMap((piece) => {
        if (cut.to <= piece.from || cut.from >= piece.to) return [piece];
        return [
          ...(piece.from < cut.from ? [{ ...piece, to: cut.from }] : []),
          ...(piece.to > cut.to ? [{ ...piece, from: cut.to }] : []),
        ];
      });
    }
    return pieces;
  });
}

const isRange = (value: unknown): value is ActivityRange => {
  if (!value || typeof value !== 'object') return false;
  const r = value as ActivityRange;
  return Number.isSafeInteger(r.y) && Number.isSafeInteger(r.from) && Number.isSafeInteger(r.to) && r.to > r.from;
};
const isStamp = (value: unknown): value is Stamp => {
  if (!value || typeof value !== 'object') return false;
  const s = value as Stamp;
  return Number.isSafeInteger(s.clock) && s.clock >= 0 && typeof s.id === 'string';
};
const isEvent = (value: unknown): value is Event => {
  if (!isStamp(value)) return false;
  const e = value as Event;
  if (!Number.isFinite(e.at)) return false;
  if (e.kind === 'seen') return Array.isArray(e.changes) && e.changes.every((id) => typeof id === 'string')
    && Array.isArray(e.ranges) && e.ranges.every(isRange);
  if (typeof e.canvasId !== 'string') return false;
  if (e.kind === 'clear') return e.pageId === undefined || typeof e.pageId === 'string';
  return e.kind === 'mutation' && typeof e.pageId === 'string' && typeof e.agent === 'boolean'
    && typeof e.deletion === 'boolean' && Array.isArray(e.ranges) && e.ranges.every(isRange);
};

/** Replaying ordered semantic events makes late cross-tab writes respect deletion/acknowledgement. */
export class CanvasActivityStore {
  #journal: Journal = { events: [] };
  #clock = 0;
  #snapshot: readonly CanvasActivityMarker[] = [];
  #expiresAt = Infinity;
  #listeners = new Set<() => void>();
  readonly #now: () => number;
  readonly #id: () => string;

  constructor({ now = Date.now, id = () => crypto.randomUUID() }: { now?: () => number; id?: () => string } = {}) {
    this.#now = now;
    this.#id = id;
  }

  getSnapshot = () => this.#snapshot;
  getJournal = () => this.#journal;
  getExpiresAt = () => this.#expiresAt;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  record = (input: Input) => {
    const event = { ...input, at: this.#now(), clock: Math.max(this.#now(), this.#clock + 1), id: this.#id() } as Event;
    this.merge({ events: [event] });
    return event;
  };

  merge = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const incoming = value as Journal;
    if (!Array.isArray(incoming.events) || !incoming.events.every(isEvent)) return;
    let floor = this.#journal.floor;
    if (isStamp(incoming.floor) && (!floor || compare(incoming.floor, floor) > 0)) floor = incoming.floor;
    const events = new Map(this.#journal.events.map((e) => [e.id, e]));
    for (const event of incoming.events) events.set(event.id, event);
    let ordered = [...events.values()].sort(compare);
    this.#clock = Math.max(this.#clock, ordered.at(-1)?.clock ?? 0, floor?.clock ?? 0);
    const cutoff = this.#now() - RETENTION_MS;
    // Drop a prefix only: a retained acknowledgement must never lose its newer
    // invalidation while retaining an older publication.
    let firstRetained = Math.max(0, ordered.length - EVENT_LIMIT);
    ordered.forEach((e, i) => {
      if ((floor && compare(e, floor) <= 0) || e.at < cutoff) firstRetained = Math.max(firstRetained, i + 1);
    });
    const retained = ordered.slice(firstRetained);
    const lastDropped = ordered[firstRetained - 1];
    if (lastDropped && (!floor || compare(lastDropped, floor) > 0)) floor = { clock: lastDropped.clock, id: lastDropped.id };
    ordered = retained;
    if (floor?.id === this.#journal.floor?.id && ordered.length === this.#journal.events.length
      && ordered.every((e, i) => e.id === this.#journal.events[i].id)) return;
    this.#journal = { floor, events: ordered };
    this.refresh();
  };

  refresh = () => {
    const pending = new Map<string, Change>();
    const now = this.#now();
    for (const event of this.#journal.events) {
      for (const [id, change] of pending) {
        if (event.kind === 'clear') {
          if (change.canvasId === event.canvasId && (event.pageId === undefined || change.pageId === event.pageId)) pending.delete(id);
        } else if ((event.kind === 'mutation' && sameAddress(event, change))
          || (event.kind === 'seen' && event.changes.includes(id))) {
          const ranges = subtract(change.ranges, event.ranges);
          if (ranges.length) pending.set(id, { ...change, ranges });
          else pending.delete(id);
        }
      }
      if (event.kind === 'mutation' && event.agent) {
        const expiresAt = event.at + (event.deletion ? DELETION_RETENTION_MS : RETENTION_MS);
        if (expiresAt > now) pending.set(event.id, { ...event, expiresAt });
      }
    }
    const groups = new Map<string, CanvasActivityMarker>();
    this.#expiresAt = Infinity;
    for (const change of pending.values()) {
      if (change.expiresAt <= now) continue;
      this.#expiresAt = Math.min(this.#expiresAt, change.expiresAt);
      const id = JSON.stringify([change.canvasId, change.pageId]);
      const group = groups.get(id);
      groups.set(id, {
        id, canvasId: change.canvasId, pageId: change.pageId,
        changes: [...(group?.changes ?? []), change.id],
        ranges: [...(group?.ranges ?? []), ...change.ranges],
      });
    }
    this.#snapshot = [...groups.values()].map((group) => ({ ...group, ranges: normalizeActivityRanges(group.ranges) }));
    this.#listeners.forEach((listener) => listener());
  };
}
