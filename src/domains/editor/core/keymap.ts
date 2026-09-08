import type { KeyInput } from '@chardesk/keyboard';
import {
  matchesShortcutInput,
  normalizeShortcut,
  shortcutSequenceKey,
  shortcutsEqual,
  type ShortcutSequence,
} from './shortcut';

export type { ShortcutSequence } from './shortcut';

export type ShortcutScope =
  | 'application'
  | 'canvas'
  | 'grid'
  | 'presentation'
  | 'structured';

export type ShortcutConflictKind = 'exact' | 'prefix';

export type ShortcutConflict = {
  kind: ShortcutConflictKind;
  entryId: string;
  shortcut: ShortcutSequence;
  conflictingEntryId: string;
  conflictingShortcut: ShortcutSequence;
};

export type ShortcutConflictEntry = {
  id: string;
  scope?: ShortcutScope;
  shortcuts: readonly ShortcutSequence[];
};

export type ContextExpression =
  | { key: string; equals: string | boolean }
  | { all: readonly ContextExpression[] }
  | { any: readonly ContextExpression[] }
  | { not: ContextExpression };

export type KeymapTarget = { type: 'command'; id: string } | { type: 'tool'; id: string };

export type KeymapEntry<Context = unknown> = {
  id: string;
  shortcuts: readonly (ShortcutSequence | string)[];
  target: KeymapTarget;
  label?: string;
  category?: string;
  scope?: ShortcutScope;
  configurable?: boolean;
  weight?: number;
  /** @deprecated Use weight. */
  priority?: number;
  repeat?: 'allow' | 'ignore';
  when?: ContextExpression | ((context: Context) => boolean);
};

export type RegisteredKeymapEntry<Context = unknown> = Omit<KeymapEntry<Context>, 'shortcuts'> & {
  shortcuts: readonly ShortcutSequence[];
  owner: string;
  registrationOrder: number;
};

export type KeymapBindingSnapshot = {
  id: string;
  owner: string;
  target: KeymapTarget;
  label?: string;
  category?: string;
  scope?: ShortcutScope;
  configurable: boolean;
  defaultShortcuts: readonly ShortcutSequence[];
  shortcuts: readonly ShortcutSequence[];
  userDefined: boolean;
  weight: number;
  repeat: 'allow' | 'ignore';
};

export type EditorKeymapSnapshot = {
  revision: number;
  entries: readonly KeymapBindingSnapshot[];
};

export type KeymapResolution<Context = unknown> =
  | { type: 'none' }
  | { type: 'match'; entry: RegisteredKeymapEntry<Context> }
  | { type: 'conflict'; shortcut: ShortcutSequence; entries: RegisteredKeymapEntry<Context>[] };

export type KeymapDiagnostics<Context = unknown> = {
  shortcut: ShortcutSequence;
  context: Context;
  candidates: readonly RegisteredKeymapEntry<Context>[];
  winner?: RegisteredKeymapEntry<Context>;
  shadowed: readonly RegisteredKeymapEntry<Context>[];
};

const readContextKey = (context: unknown, key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (value, part) =>
        value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined,
      context
    );

const evaluateContextExpression = (
  expression: ContextExpression,
  context: unknown
): boolean => {
  if ('key' in expression) return readContextKey(context, expression.key) === expression.equals;
  if ('all' in expression) {
    return expression.all.every((part) => evaluateContextExpression(part, context));
  }
  if ('any' in expression) {
    return expression.any.some((part) => evaluateContextExpression(part, context));
  }
  return !evaluateContextExpression(expression.not, context);
};

const normalizeSequences = (shortcuts: readonly (ShortcutSequence | string)[]) => {
  const byKey = new Map<string, ShortcutSequence>();
  for (const shortcut of shortcuts) {
    const value = normalizeShortcut(shortcut);
    if (!value) throw new Error(`Invalid shortcut ${String(shortcut)}`);
    byKey.set(shortcutSequenceKey(value), value);
  }
  return [...byKey.values()];
};

const sequencesEqual = (left: readonly ShortcutSequence[], right: readonly ShortcutSequence[]) =>
  left.length === right.length &&
  left.every((sequence, index) => shortcutsEqual(sequence, right[index]));

const isSequencePrefix = (prefix: ShortcutSequence, sequence: ShortcutSequence) =>
  prefix.length < sequence.length &&
  prefix.every((stroke, index) => stroke === sequence[index]);

export const shortcutScopesOverlap = (left?: ShortcutScope, right?: ShortcutScope) => {
  if (!left || !right || left === right) return true;
  if (left === 'application' || right === 'application') return true;
  return left === 'canvas' || right === 'canvas';
};

export const getShortcutConflictKind = (
  left: ShortcutSequence,
  right: ShortcutSequence
): ShortcutConflictKind | null => {
  if (shortcutsEqual(left, right)) return 'exact';
  return isSequencePrefix(left, right) || isSequencePrefix(right, left) ? 'prefix' : null;
};

export const findShortcutConflicts = (
  entries: readonly ShortcutConflictEntry[],
  entryId: string,
  shortcut: ShortcutSequence
): ShortcutConflict[] => {
  const target = entries.find((entry) => entry.id === entryId);
  if (!target) return [];
  return entries.flatMap((candidate) => {
    if (!shortcutScopesOverlap(target.scope, candidate.scope)) return [];
    return candidate.shortcuts.flatMap((conflictingShortcut) => {
      const kind = getShortcutConflictKind(shortcut, conflictingShortcut);
      if (candidate.id === entryId && kind !== 'prefix') return [];
      return kind
        ? [{ kind, entryId, shortcut, conflictingEntryId: candidate.id, conflictingShortcut }]
        : [];
    });
  });
};

export class EditorKeymap<Context = unknown> {
  readonly #entries = new Map<string, RegisteredKeymapEntry<Context>>();
  readonly #overrides = new Map<string, readonly ShortcutSequence[]>();
  readonly #listeners = new Set<() => void>();
  #snapshot: EditorKeymapSnapshot = { revision: 0, entries: [] };
  #registrationOrder = 0;

  register(owner: string, entry: KeymapEntry<Context>) {
    if (this.#entries.has(entry.id)) throw new Error(`Keymap entry ${entry.id} already exists`);
    const shortcuts = normalizeSequences(entry.shortcuts);
    this.#entries.set(entry.id, {
      ...entry,
      shortcuts,
      owner,
      registrationOrder: this.#registrationOrder++,
    });
    this.#emit();
    return () => {
      if (!this.#entries.delete(entry.id)) return;
      this.#emit();
    };
  }

  /** Loads persisted entries, including bindings whose dynamic owner is not mounted yet. */
  hydrateUserBindings(bindings: Readonly<Record<string, readonly ShortcutSequence[]>>) {
    let changed = false;
    for (const [entryId, shortcuts] of Object.entries(bindings)) {
      const next = normalizeSequences(shortcuts);
      const previous = this.#overrides.get(entryId);
      if (
        previous && sequencesEqual(previous, next)
      )
        continue;
      this.#overrides.set(entryId, next);
      changed = true;
    }
    if (changed) this.#emit();
  }

  setUserBindings(entryId: string, shortcuts: readonly ShortcutSequence[] | null) {
    this.updateUserBindings({ [entryId]: shortcuts });
  }

  updateUserBindings(updates: Readonly<Record<string, readonly ShortcutSequence[] | null>>) {
    const normalizedUpdates = Object.entries(updates).map(([entryId, shortcuts]) => {
      if (!this.#entries.has(entryId)) throw new Error(`Unknown keymap entry ${entryId}`);
      if (shortcuts === null) return [entryId, null] as const;
      return [entryId, normalizeSequences(shortcuts)] as const;
    });

    let changed = false;
    for (const [entryId, shortcuts] of normalizedUpdates) {
      const previous = this.#overrides.get(entryId);
      if (shortcuts === null) {
        changed = this.#overrides.delete(entryId) || changed;
      } else if (
        !previous ||
        !sequencesEqual(previous, shortcuts)
      ) {
        this.#overrides.set(entryId, shortcuts);
        changed = true;
      }
    }
    if (changed) this.#emit();
  }

  resetUserBindings() {
    if (this.#overrides.size === 0) return;
    this.#overrides.clear();
    this.#emit();
  }

  getUserBindings() {
    return Object.fromEntries(this.#overrides);
  }

  subscribe(listener: () => void) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  getSnapshot() {
    return this.#snapshot;
  }
  has(entryId: string) {
    return this.#entries.has(entryId);
  }

  getBindings(entryId: string) {
    const entry = this.#entries.get(entryId);
    return entry ? (this.#overrides.get(entryId) ?? entry.shortcuts) : undefined;
  }

  #matchesContext(entry: RegisteredKeymapEntry<Context>, context: Context) {
    if (!entry.when) return true;
    return typeof entry.when === 'function'
      ? entry.when(context)
      : evaluateContextExpression(entry.when, context);
  }

  #compare = (left: RegisteredKeymapEntry<Context>, right: RegisteredKeymapEntry<Context>) =>
    Number(this.#overrides.has(right.id)) - Number(this.#overrides.has(left.id)) ||
    (right.weight ?? right.priority ?? 0) - (left.weight ?? left.priority ?? 0) ||
    right.registrationOrder - left.registrationOrder;

  resolve(shortcut: ShortcutSequence, context: Context) {
    const normalized = normalizeShortcut(shortcut);
    if (!normalized) return [];
    return [...this.#entries.values()]
      .filter((entry) =>
        (this.#overrides.get(entry.id) ?? entry.shortcuts).some((value) =>
          shortcutsEqual(value, normalized)
        )
      )
      .filter((entry) => this.#matchesContext(entry, context))
      .sort(this.#compare);
  }

  resolveCandidates(shortcuts: readonly ShortcutSequence[], context: Context) {
    const matches = new Map<string, RegisteredKeymapEntry<Context>>();
    for (const shortcut of shortcuts) {
      for (const entry of this.resolve(shortcut, context)) matches.set(entry.id, entry);
    }
    return [...matches.values()].sort(this.#compare);
  }

  resolveInput(input: KeyInput, context: Context) {
    return [...this.#entries.values()]
      .filter((entry) => this.#matchesContext(entry, context))
      .filter((entry) =>
        (this.#overrides.get(entry.id) ?? entry.shortcuts).some(
          (sequence) => sequence.length === 1 && matchesShortcutInput(input, sequence[0])
        )
      )
      .sort(this.#compare);
  }

  getSequenceStarts(input: KeyInput, context: Context) {
    return [...this.#entries.values()]
      .flatMap((entry) => {
        if (!this.#matchesContext(entry, context)) return [];
        return (this.#overrides.get(entry.id) ?? entry.shortcuts)
          .filter((sequence) => sequence.length > 1 && matchesShortcutInput(input, sequence[0]))
          .map((sequence) => ({ entry, sequence }));
      })
      .sort((left, right) => this.#compare(left.entry, right.entry));
  }

  resolveBest(shortcut: ShortcutSequence, context: Context): KeymapResolution<Context> {
    const first = this.resolve(shortcut, context)[0];
    return first ? { type: 'match', entry: first } : { type: 'none' };
  }

  diagnose(shortcut: ShortcutSequence, context: Context): KeymapDiagnostics<Context> {
    const candidates = this.resolve(shortcut, context);
    return {
      shortcut,
      context,
      candidates,
      winner: candidates[0],
      shadowed: candidates.slice(1),
    };
  }

  getConflicts(context: Context) {
    const byShortcut = new Map<string, { shortcut: ShortcutSequence; entryIds: string[] }>();
    for (const entry of this.#entries.values()) {
      if (!this.#matchesContext(entry, context)) continue;
      for (const shortcut of this.#overrides.get(entry.id) ?? entry.shortcuts) {
        const key = shortcutSequenceKey(shortcut);
        const value = byShortcut.get(key) ?? { shortcut, entryIds: [] };
        value.entryIds.push(entry.id);
        byShortcut.set(key, value);
      }
    }
    return [...byShortcut.values()].filter(({ entryIds }) => entryIds.length > 1);
  }

  #emit() {
    this.#snapshot = {
      revision: this.#snapshot.revision + 1,
      entries: [...this.#entries.values()].map((entry) => ({
        id: entry.id,
        owner: entry.owner,
        target: entry.target,
        label: entry.label,
        category: entry.category,
        scope: entry.scope,
        configurable: entry.configurable ?? true,
        defaultShortcuts: entry.shortcuts,
        shortcuts: this.#overrides.get(entry.id) ?? entry.shortcuts,
        userDefined: this.#overrides.has(entry.id),
        weight: entry.weight ?? entry.priority ?? 0,
        repeat: entry.repeat ?? 'ignore',
      })),
    };
    this.#listeners.forEach((listener) => listener());
  }
}
