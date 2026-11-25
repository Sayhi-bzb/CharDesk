import type { CanvasDocumentDraft } from './canvasDocumentModel.js';
import { serializeCanvasDocument } from './documentText.js';

declare const identity: unique symbol;
export type ContentVersion = string & { readonly [identity]: 'content-version' };
export type HistoryPosition = string & { readonly [identity]: 'history-position' };
export type SemanticContentId = string & { readonly [identity]: 'semantic-content' };

export function semanticDocumentSource(document: CanvasDocumentDraft): string {
  return serializeCanvasDocument({
    ...document,
    id: 'semantic-content',
    activePageId: document.pages[0]!.id,
    pages: document.pages.map((page) => ({
      ...page,
      size: page.size && { columns: page.size.columns, rows: page.size.rows },
      anchors: [...(page.anchors ?? [])].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        .map((anchor) => ({ id: anchor.id, point: { x: anchor.point.x, y: anchor.point.y },
          label: anchor.label, order: anchor.order, parentId: anchor.parentId, detached: anchor.detached })),
      grid: page.grid && [...page.grid].sort(([a], [b]) => {
        const [ax, ay] = a.split(',').map(Number);
        const [bx, by] = b.split(',').map(Number);
        return ay! - by! || ax! - bx!;
      }),
    })),
  });
}

export type ContentProof = Readonly<{
  version: ContentVersion;
  position: HistoryPosition;
  lineage: string;
}>;
export type SavedContent = ContentProof & {
  semantic: () => SemanticContentId | Promise<SemanticContentId>;
};
export interface DocumentPersistencePort {
  capture(): SavedContent;
  baseline(): SavedContent | null;
  isDirty(): boolean;
  acknowledge(snapshot: SavedContent): void;
  invalidate(): void;
  dispose(): void;
}

type SaveStatePort = {
  proof(): ContentProof;
  capture(): SavedContent;
  changed(): void;
  synchronous?: boolean;
  dispose?(): void;
};

export class DocumentSaveState implements DocumentPersistencePort {
  #baseline: SavedContent | null = null;
  #resolvedBaseline: SemanticContentId | undefined;
  #baselineGeneration = 0;
  #observed: { version: ContentVersion; semantic: SemanticContentId } | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #pending = false;
  #disposed = false;
  private readonly port: SaveStatePort;
  constructor(port: SaveStatePort) {
    this.port = port;
  }

  capture() { return this.port.capture(); }
  baseline() { return this.#baseline; }

  acknowledge(snapshot: SavedContent) {
    this.#baseline = snapshot;
    this.#resolvedBaseline = undefined;
    this.#baselineGeneration++;
    this.#observed = null;
  }
  invalidate() {
    this.#baseline = null;
    this.#baselineGeneration++;
    this.#resolvedBaseline = undefined;
  }
  isDirty() {
    const baseline = this.#baseline;
    if (!baseline) return true;
    const current = this.port.proof();
    if (current.version === baseline.version) return false;
    if (current.lineage === baseline.lineage && current.position === baseline.position) return false;
    if (this.#observed?.version === current.version && this.#resolvedBaseline !== undefined)
      return this.#observed.semantic !== this.#resolvedBaseline;
    if (this.port.synchronous && current.lineage !== baseline.lineage) {
      const saved = baseline.semantic(), now = this.port.capture().semantic();
      if (typeof saved === 'string' && typeof now === 'string') {
        this.#resolvedBaseline = saved;
        this.#observed = { version: current.version, semantic: now };
        return saved !== now;
      }
    }
    this.#schedule();
    return true;
  }
  #schedule() {
    if (this.#disposed || this.#timer || this.#pending || !this.#baseline) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      const baseline = this.#baseline;
      if (!baseline || this.#disposed) return;
      const generation = this.#baselineGeneration;
      let captured: SavedContent;
      try { captured = this.port.capture(); } catch { return; }
      this.#pending = true;
      void Promise.resolve().then(() => Promise.all([baseline.semantic(), captured.semantic()])).then(([saved, current]) => {
        if (this.#disposed || generation !== this.#baselineGeneration) return;
        this.#resolvedBaseline = saved;
        this.#observed = { version: captured.version, semantic: current };
        if (captured.version === this.port.proof().version) this.port.changed();
      }).catch(() => {
      }).finally(() => {
        this.#pending = false;
        if (!this.#disposed && (generation !== this.#baselineGeneration ||
          captured.version !== this.port.proof().version)) this.#schedule();
      });
    }, 100);
    this.#timer.unref?.();
  }
  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.port.dispose?.();
  }
}
