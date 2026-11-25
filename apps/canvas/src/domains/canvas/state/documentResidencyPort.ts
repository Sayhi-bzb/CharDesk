import type { CanvasSessionDescriptor } from "@/domains/sessions/public";
import type { CanvasDocumentSeed } from "./CanvasDocumentRegistry";

export type CanvasDocumentLoadRequest = Readonly<{
  descriptor: CanvasSessionDescriptor;
  fallbackSeed?: CanvasDocumentSeed;
}>;

export interface CanvasDocumentResidency {
  ensureLoaded(request: CanvasDocumentLoadRequest): Promise<boolean>;
  setPinnedCanvasIds(ids: readonly string[]): void;
  touch(id: string): void;
  tombstone(id: string): Promise<void>;
  releaseDeleted(id: string): void;
}
