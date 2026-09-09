import type { CanvasSurfaceReader } from "@/domains/canvas/public";
import type { CanvasMode } from "@/domains/sessions/public";
import type { SlideDeckSnapshot } from "@/domains/slides/public";
import type { CharDeskFontProfile } from "@chardesk/fonts";

export type ExportFormat =
  | "txt"
  | "chardesk"
  | "ansi"
  | "png";

export type ExportContext = {
  fontProfile?: CharDeskFontProfile;
  canvasMode: CanvasMode;
  surface: CanvasSurfaceReader;
  includeColor: boolean;
  showGrid: boolean;
  slideDeck?: SlideDeckSnapshot | null;
  documentName?: string;
};

type ExportArtifactBase = {
  format: ExportFormat;
  filename: string;
  mimeType: string;
};

export type TextExportArtifact = ExportArtifactBase & {
  kind: "text";
  content: string;
};

type BlobExportArtifact = ExportArtifactBase & {
  kind: "blob";
  content: Promise<Blob>;
};

export type ExportArtifact = TextExportArtifact | BlobExportArtifact;

type ExportErrorCode =
  | "unsupported-format"
  | "empty-content"
  | "canvas-unavailable"
  | "image-too-large"
  | "encoding-failed"
  | "clipboard-unavailable"
  | "clipboard-write-failed"
  | "download-failed";

type ExportError = {
  code: ExportErrorCode;
  cause?: unknown;
};

export class ExportPipelineError extends Error {
  readonly code: ExportErrorCode;
  readonly cause?: unknown;

  constructor(code: ExportErrorCode, cause?: unknown) {
    super(code, { cause });
    this.name = "ExportPipelineError";
    this.code = code;
    this.cause = cause;
  }
}

export type ExportResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ExportError };

export const exportSucceeded = <T>(value: T): ExportResult<T> => ({
  ok: true,
  value,
});

export const exportFailed = (
  code: ExportErrorCode,
  cause?: unknown
): ExportResult<never> => ({
  ok: false,
  error: cause === undefined ? { code } : { code, cause },
});

export const exportFailedFromCause = (
  cause: unknown,
  fallback: ExportErrorCode
): ExportResult<never> =>
  cause instanceof ExportPipelineError
    ? exportFailed(cause.code, cause.cause)
    : exportFailed(fallback, cause);
