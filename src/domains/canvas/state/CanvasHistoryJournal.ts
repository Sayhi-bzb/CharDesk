import type { CanvasMutationEnvelope } from "./canvasMutationEnvelope";

type CanvasHistoryAvailability = {
  canUndo: boolean;
  canRedo: boolean;
};

type CanvasHistoryAction = {
  forward: CanvasMutationEnvelope;
  inverse: CanvasMutationEnvelope;
};

type CanvasHistoryGroup = {
  actions: CanvasHistoryAction[];
  bytes: number;
};

type CanvasDocumentHistory = {
  undo: CanvasHistoryGroup[];
  redo: CanvasHistoryGroup[];
  bytes: number;
  mergeOpen: boolean;
  lastCapturedAt: number;
};

type CanvasHistoryJournalOptions = {
  maxGroups?: number;
  maxBytes?: number;
  apply: (envelope: CanvasMutationEnvelope) => void;
};

const DEFAULT_MAX_GROUPS = 500;
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;

const operationBytes = (envelope: CanvasMutationEnvelope) => {
  if (envelope.kind !== "cell-plane") return JSON.stringify(envelope).length * 2;
  const operation = envelope.operation;
  return 128 + ("payload" in operation
    ? operation.payload.byteLength
    : JSON.stringify(operation.rows).length * 2);
};

/** Session-only semantic Undo/Redo history that survives a Y.Doc generation swap. */
export class CanvasHistoryJournal {
  readonly #histories = new Map<string, CanvasDocumentHistory>();
  readonly #apply: (envelope: CanvasMutationEnvelope) => void;
  readonly #maxGroups: number;
  readonly #maxBytes: number;

  constructor(options: CanvasHistoryJournalOptions) {
    this.#apply = options.apply;
    this.#maxGroups = options.maxGroups ?? DEFAULT_MAX_GROUPS;
    this.#maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  capture(
    documentId: string,
    action: CanvasHistoryAction,
    mode: "save" | "merge"
  ) {
    const history = this.#get(documentId);
    const bytes = operationBytes(action.forward) + operationBytes(action.inverse);
    if (bytes > this.#maxBytes) {
      history.undo.length = 0;
      history.redo.length = 0;
      history.bytes = 0;
      history.mergeOpen = false;
      return;
    }
    const now = performance.now();
    const group =
      mode === "merge" && history.mergeOpen && now - history.lastCapturedAt <= 500
        ? history.undo.at(-1)
        : undefined;
    if (group) {
      group.actions.push(action);
      group.bytes += bytes;
    } else {
      history.undo.push({ actions: [action], bytes });
    }
    history.bytes += bytes;
    history.redo.forEach((redoGroup) => { history.bytes -= redoGroup.bytes; });
    history.redo.length = 0;
    history.mergeOpen = mode === "merge";
    history.lastCapturedAt = now;
    this.#trim(history);
    if (history.bytes > this.#maxBytes) {
      history.undo.length = 0;
      history.redo.length = 0;
      history.bytes = 0;
      history.mergeOpen = false;
    }
  }

  undo(documentId: string) {
    const history = this.#get(documentId);
    const group = history.undo.pop();
    if (!group) return false;
    for (let index = group.actions.length - 1; index >= 0; index -= 1) {
      this.#apply(group.actions[index]!.inverse);
    }
    history.redo.push(group);
    history.mergeOpen = false;
    return true;
  }

  redo(documentId: string) {
    const history = this.#get(documentId);
    const group = history.redo.pop();
    if (!group) return false;
    group.actions.forEach(({ forward }) => this.#apply(forward));
    history.undo.push(group);
    history.mergeOpen = false;
    return true;
  }

  clear(documentId: string) {
    this.#histories.delete(documentId);
  }

  finishCapture(documentId: string) {
    const history = this.#histories.get(documentId);
    if (history) history.mergeOpen = false;
  }

  getAvailability(documentId: string): CanvasHistoryAvailability {
    const history = this.#histories.get(documentId);
    return {
      canUndo: (history?.undo.length ?? 0) > 0,
      canRedo: (history?.redo.length ?? 0) > 0,
    };
  }

  getUndoDepth(documentId: string) {
    return this.#histories.get(documentId)?.undo.length ?? 0;
  }

  getStats() {
    let groups = 0;
    let actions = 0;
    let bytes = 0;
    this.#histories.forEach((history) => {
      const historyGroups = [...history.undo, ...history.redo];
      groups += historyGroups.length;
      actions += historyGroups.reduce(
        (count, group) => count + group.actions.length,
        0
      );
      bytes += history.bytes;
    });
    return {
      documents: this.#histories.size,
      groups,
      actions,
      bytes,
    };
  }

  rollbackTo(documentId: string, undoDepth: number) {
    let changed = false;
    while (this.getUndoDepth(documentId) > undoDepth) {
      if (!this.undo(documentId)) break;
      changed = true;
    }
    if (changed) {
      const history = this.#get(documentId);
      history.redo.forEach((group) => { history.bytes -= group.bytes; });
      history.redo.length = 0;
    }
    return changed;
  }

  #get(documentId: string) {
    let history = this.#histories.get(documentId);
    if (!history) {
      history = {
        undo: [],
        redo: [],
        bytes: 0,
        mergeOpen: false,
        lastCapturedAt: 0,
      };
      this.#histories.set(documentId, history);
    }
    return history;
  }

  #trim(history: CanvasDocumentHistory) {
    while (
      history.undo.length > this.#maxGroups ||
      (history.bytes > this.#maxBytes && history.undo.length > 1)
    ) {
      history.bytes -= history.undo.shift()!.bytes;
    }
  }
}
