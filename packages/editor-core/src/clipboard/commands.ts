import {
  buildClipboardPayload,
  hasClipboardSource,
  type ClipboardPayload,
  type ClipboardPayloadFormat,
} from './payload.js';
import type { GridCellSource, Point, SelectionArea } from '@chardesk/cell-plane/types';
import type { RichTextCell, RichTextRow } from '../textCommandTypes.js';
import type { CanvasAnchorSeed } from '../canvasAnchorModel.js';
export type ClipboardCommandResult =
  | { status: 'applied'; changed: boolean; warning?: 'plain-fallback' }
  | { status: 'dispatched'; changed: false }
  | { status: 'noop'; reason: 'empty-source' | 'empty-clipboard' | 'unsupported-data' }
  | { status: 'failed'; reason: 'clipboard-failed' | 'stale-target' | 'prepare-failed' };
export type ClipboardState = Readonly<{
  target: string;
  reader: GridCellSource;
  selections: SelectionArea[];
  cursor: Point | null;
  foreground: string;
  selectResult: boolean;
}>;
export type PreparedClipboardPaste = {
  richRows?: readonly RichTextRow[];
  richCells?: RichTextCell[] | null;
  plainText?: string | null;
  diagnostics?: readonly { code: string; message: string }[];
  headings?: readonly { level: number; row: number; label: string }[];
};
/** Syntax preparation is asynchronous and independent of clipboard transport. */
export type ClipboardTextPreparation = (
  text: string,
  state: ClipboardState
) => Promise<PreparedClipboardPaste>;
/** A terminal dispatch is not an acknowledgement from the user's clipboard. */
export type ClipboardWriteResult = {
  status: 'written' | 'dispatched' | 'unavailable' | 'failed';
  warning?: 'plain-fallback';
};
export interface ClipboardPort {
  read(
    state: ClipboardState
  ): Promise<PreparedClipboardPaste | { error: 'clipboard-failed' | 'unsupported-data' }>;
  write(
    payload: ClipboardPayload,
    options: { rich: boolean; ansi: boolean }
  ): Promise<ClipboardWriteResult>;
}
export type ClipboardMutationPort = {
  transact: <T>(fn: () => T) => T;
  deleteSelection: () => void;
  erasePoints: (points: Point[]) => void;
  pasteRichRows: (
    rows: readonly RichTextRow[],
    at?: Point,
    options?: { selectResult?: boolean; anchorSeeds?: readonly CanvasAnchorSeed[] }
  ) => void;
  pasteRichData: (cells: RichTextCell[], at?: Point, options?: { selectResult?: boolean }) => void;
  pastePlainText: (text: string, color: string, selectResult: boolean) => boolean;
};
/** Shared across per-event Web adapters so newer mutations supersede older IO. */
export class ClipboardRequestScope {
  #generation = 0;
  begin() {
    return ++this.#generation;
  }
  isCurrent(generation: number) {
    return generation === this.#generation;
  }
}

export const createClipboardCommands = (options: {
  isActive?: () => boolean;
  requests?: ClipboardRequestScope;
  getState: () => ClipboardState;
  mutations: ClipboardMutationPort;
  port: ClipboardPort;
  onFailure?: (reason: 'clipboard-failed' | 'stale-target' | 'prepare-failed') => void;
  onPasteDiagnostics?: (diagnostics: readonly { code: string; message: string }[]) => void;
  autoAnchors?: () => boolean;
  prepareText?: ClipboardTextPreparation;
}) => {
  const { getState, mutations, port } = options;
  const requests = options.requests ?? new ClipboardRequestScope();
  const fail = (
    reason: 'clipboard-failed' | 'stale-target' | 'prepare-failed'
  ): ClipboardCommandResult => {
    options.onFailure?.(reason);
    return { status: 'failed', reason };
  };
  const applied = (changed: boolean): ClipboardCommandResult => ({ status: 'applied', changed });
  const payload = (state: ClipboardState, format: ClipboardPayloadFormat = 'plain') =>
    buildClipboardPayload(state.reader, state.selections, state.cursor, state.foreground, format);

  const paste = async (
    read: (state: ClipboardState) => ReturnType<ClipboardPort['read']>
  ): Promise<ClipboardCommandResult> => {
    const request = requests.begin();
    const initial = getState();
    const current = () =>
      requests.isCurrent(request) &&
      (!options.isActive || options.isActive()) &&
      getState().target === initial.target;
    let loaded: Awaited<ReturnType<ClipboardPort['read']>>;
    try {
      loaded = await read(initial);
    } catch {
      return fail(current() ? 'clipboard-failed' : 'stale-target');
    }
    if (!current()) return fail('stale-target');
    if ('error' in loaded)
      return loaded.error === 'unsupported-data'
        ? { status: 'noop', reason: 'unsupported-data' }
        : fail(loaded.error);
    let data: PreparedClipboardPaste = loaded;
    const hasRichData =
      data.richRows?.some((row) => row.spans.some((span) => span.text.length > 0)) ||
      data.richCells?.some((cell) => cell.char.length > 0);
    if (!hasRichData && data.plainText && options.prepareText) {
      try {
        data = await options.prepareText(data.plainText, initial);
      } catch {
        return current() ? fail('prepare-failed') : fail('stale-target');
      }
    }
    if (!current()) return fail('stale-target');
    return mutations.transact(() => {
      if (!current()) return fail('stale-target');
      const state = getState();
      const done = () => {
        options.onPasteDiagnostics?.(data.diagnostics ?? []);
        return applied(true);
      };
      if (data.richRows?.some((row) => row.spans.some((span) => span.text.length > 0))) {
        const anchorSeeds =
          state.selectResult && (options.autoAnchors?.() ?? true)
            ? (data.headings ?? [])
                .filter((h) => h.level <= 3)
                .map((h) => ({ point: { x: 0, y: h.row }, label: h.label, level: h.level }))
            : [];
        mutations.pasteRichRows(data.richRows, undefined, {
          selectResult: state.selectResult,
          anchorSeeds,
        });
        return done();
      }
      if (data.richCells?.some((cell) => cell.char.length > 0)) {
        mutations.pasteRichData(data.richCells, undefined, { selectResult: state.selectResult });
        return done();
      }
      if (
        data.plainText &&
        mutations.pastePlainText(data.plainText, state.foreground, state.selectResult)
      )
        return done();
      options.onPasteDiagnostics?.(data.diagnostics ?? []);
      return { status: 'noop', reason: 'empty-clipboard' };
    });
  };
  return {
    canCopyOrCut: () => {
      const s = getState();
      return hasClipboardSource(s.selections, s.cursor);
    },
    copy: async (
      request: { rich?: boolean; ansi?: boolean } = {}
    ): Promise<ClipboardCommandResult> => {
      let data: ClipboardPayload | null;
      try {
        data = payload(getState(), request.ansi ? 'ansi' : 'plain');
      } catch {
        return fail('prepare-failed');
      }
      if (!data) return { status: 'noop', reason: 'empty-source' };
      try {
        const result = await port.write(data, { rich: !!request.rich, ansi: !!request.ansi });
        if (result.status === 'written')
          return { ...applied(false), ...(result.warning ? { warning: result.warning } : {}) };
        if (result.status === 'dispatched') return { status: 'dispatched', changed: false };
        return fail('clipboard-failed');
      } catch {
        return fail('clipboard-failed');
      }
    },
    cut: async (): Promise<ClipboardCommandResult> => {
      const request = requests.begin();
      const initial = getState();
      let data: ClipboardPayload | null;
      try {
        data = payload(initial);
      } catch {
        return fail('prepare-failed');
      }
      if (!data) return { status: 'noop', reason: 'empty-source' };
      let result: ClipboardWriteResult;
      try {
        result = await port.write(data, { rich: true, ansi: false });
        if (result.status !== 'written' && result.status !== 'dispatched')
          return fail('clipboard-failed');
      } catch {
        return fail('clipboard-failed');
      }
      if (!requests.isCurrent(request) || (options.isActive && !options.isActive()))
        return fail('stale-target');
      if (result.status === 'dispatched') return { status: 'dispatched', changed: false };
      return mutations.transact(() => {
        const state = getState();
        if (
          state.target !== initial.target ||
          JSON.stringify(payload(state)) !== JSON.stringify(data)
        )
          return fail('stale-target');
        if (state.selections.length) mutations.deleteSelection();
        else if (state.cursor) mutations.erasePoints([state.cursor]);
        return { ...applied(true), ...(result.warning ? { warning: result.warning } : {}) };
      });
    },
    paste: () => paste((state) => port.read(state)),
    pasteProvided: (data: PreparedClipboardPaste) => paste(async () => data),
  };
};
