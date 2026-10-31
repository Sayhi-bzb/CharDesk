import { Keymap, type KeymapEvent, type KeymapHost, type KeyStrokeInput } from '@opentui/keymap';
import {
  registerDefaultKeys,
  registerEnabledFields,
  registerMetadataFields,
  registerModBindings,
  registerNeovimDisambiguation,
} from '@opentui/keymap/addons';
import type { EditorKeymap, RegisteredKeymapEntry } from '@chardesk/editor-core/editor/keymap';
import type { KeyInput } from '@chardesk/keyboard';

export const inputPriority = (priority: number) => priority * 1_000_000;
export const keyName = (name: string) =>
  ({
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    Enter: 'return',
    ' ': 'space',
    Space: 'space',
    Esc: 'escape',
  })[name] ?? name.toLowerCase();

/** v3 catalog Meta means Command; OpenTUI meta means Alt/Option. */
const legacyStroke = (stroke: string, primary: 'ctrl' | 'super' | 'unknown') =>
  stroke
    .replace(/(^|\+)Mod(?=\+)/gi, `$1${primary === 'super' ? 'super' : 'ctrl'}`)
    .replace(/(^|\+)Meta(?=\+)/gi, '$1super')
    .replace(/Arrow(Left|Right|Up|Down)/g, '$1')
    .replace(/(^|\+)Enter$/i, '$1return');

export const inputStroke = (input: KeyInput): KeyStrokeInput => ({
  name: keyName(input.key),
  ctrl: input.modifiers.ctrl,
  shift: input.modifiers.shift,
  meta: input.modifiers.alt,
  super: input.modifiers.meta,
});

const physicalPunctuation: Readonly<Record<string, string>> = {
  Backquote: '`',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Equal: '=',
  IntlBackslash: '\\',
  Minus: '-',
  Period: '.',
  Quote: "'",
  Semicolon: ';',
  Slash: '/',
};
const inputCandidates = (input: KeyInput) => {
  const direct = inputStroke(input);
  const candidates = [direct];
  if (direct.shift && direct.name.length === 1 && !/[a-z0-9]/i.test(direct.name))
    candidates.push({ ...direct, shift: false });
  const base = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(input.code);
  const physical = base?.[1]?.toLowerCase() ?? base?.[2] ?? physicalPunctuation[input.code];
  if (
    physical &&
    (input.modifiers.alt || input.modifiers.ctrl || input.modifiers.meta || input.key === 'Dead')
  )
    candidates.push({ ...direct, name: physical });
  return candidates;
};

export function createInputKeymap<T extends object, E extends KeymapEvent>(
  host: KeymapHost<T, E>,
  options: { sequenceTimeoutMs?: number } = {}
) {
  const keymap = new Keymap(host);
  registerDefaultKeys(keymap);
  registerEnabledFields(keymap);
  registerMetadataFields(keymap);
  registerModBindings(keymap);
  registerNeovimDisambiguation(keymap, { timeoutMs: options.sequenceTimeoutMs ?? 1500 });
  keymap.appendEventMatchResolver((_event, context) => {
    const input = keymap.getData('input') as KeyInput | undefined;
    return input
      ? inputCandidates(input)
          .slice(1)
          .map((stroke) => context.resolveKey(stroke))
      : undefined;
  });
  return keymap;
}

let nextCatalog = 0;
export function connectBindings<T extends object, E extends KeymapEvent, Context>(
  keymap: Keymap<T, E>,
  catalog: EditorKeymap<Context>,
  options: {
    context: () => Context;
    execute: (entry: RegisteredKeymapEntry<Context>, event: E) => boolean | void;
    enabled?: () => boolean;
    repeat?: (event: E) => boolean;
    priority?: number;
    target?: T;
  }
) {
  const namespace = `catalog-${nextCatalog++}`;
  let entries = new Map<string, RegisteredKeymapEntry<Context>>();
  let tokenEntries = new Map<string, RegisteredKeymapEntry<Context>>();
  let disposers: Array<() => void> = [];
  const clear = () => {
    for (const dispose of disposers.reverse()) dispose();
    disposers = [];
  };
  const refresh = () => {
    clear();
    entries = new Map();
    tokenEntries = new Map();
    for (const [index, entry] of catalog.list().entries()) {
      const command = `${namespace}:${entry.id}`;
      entries.set(command, entry);
      const bindings = entry.shortcuts.flatMap((sequence, sequenceIndex) => {
        const tokens: string[] = [];
        for (const [strokeIndex, stroke] of sequence.entries()) {
          const parsed = keymap.parseKeySequence(
            legacyStroke(stroke, keymap.getHostMetadata().primaryModifier)
          );
          if (parsed.length !== 1) return [];
          const name = `${namespace}-${index}-${sequenceIndex}-${strokeIndex}`;
          disposers.push(keymap.registerToken({ name, key: parsed[0]!.stroke }));
          tokenEntries.set(name, entry);
          tokens.push(`<${name}>`);
        }
        return [{ key: tokens.join(''), cmd: command }];
      });
      disposers.push(
        keymap.registerLayer({
          target: options.target,
          priority:
            inputPriority(options.priority ?? 0) +
            (entry.userDefined ? 100_000 : 0) +
            (entry.weight ?? entry.priority ?? 0),
          enabled: () =>
            (options.enabled?.() ?? true) && catalog.isEnabled(entry, options.context()),
          commands: [
            {
              name: command,
              title: entry.label,
              category: entry.category,
              run: ({ event }) => {
                if (options.repeat?.(event) && (entry.repeat ?? 'ignore') === 'ignore') return;
                return options.execute(entry, event);
              },
            },
          ],
          bindings,
        })
      );
    }
  };
  refresh();
  const unsubscribe = catalog.subscribe(refresh);
  const resolveStroke = (stroke: KeyStrokeInput, exact = false) => {
    for (const candidate of keymap.getActiveKeys()) {
      if (!keymap.createKeyMatcher(candidate.stroke)(stroke)) continue;
      const command =
        typeof candidate.command === 'string' ? entries.get(candidate.command) : undefined;
      if (command) return command;
      // Prefixes have no exact command; the library's selected presentation token
      // identifies the catalog owner without reproducing its sequence matcher.
      if (!exact && candidate.continues && candidate.tokenName) {
        const entry = tokenEntries.get(candidate.tokenName);
        if (entry) return entry;
      }
    }
    return undefined;
  };
  return {
    resolveEvent: (event: E) => resolveStroke(event),
    resolve(input: KeyInput) {
      if (input.composing || input.modifiers.altGraph || input.phase !== 'down') return undefined;
      for (const stroke of inputCandidates(input)) {
        const entry = resolveStroke(stroke, true);
        if (entry) return entry;
      }
      return undefined;
    },
    dispose() {
      unsubscribe();
      clear();
      entries.clear();
      tokenEntries.clear();
    },
  };
}
