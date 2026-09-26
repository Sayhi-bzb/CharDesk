import type { CanvasMode } from "@/domains/sessions/public";
import type { ExportFormat } from "./types";

type ExportFormatDefinition = {
  format: ExportFormat;
  label: string;
  subLabel: string;
  modes: readonly CanvasMode[];
  artifactKind: "text" | "blob";
  supportsColor: boolean;
  supportsClipboard: boolean;
  truncatePreview: boolean;
};

const ALL_STATIC_MODES: readonly CanvasMode[] = ["freeform"];

const EXPORT_FORMATS: readonly ExportFormatDefinition[] = [
  {
    format: "txt",
    label: "TXT",
    subLabel: "plain",
    modes: ALL_STATIC_MODES,
    artifactKind: "text",
    supportsColor: false,
    supportsClipboard: true,
    truncatePreview: false,
  },
  {
    format: "chardesk",
    label: "CharDesk",
    subLabel: "document",
    modes: ["freeform", "slide"],
    artifactKind: "text",
    supportsColor: true,
    supportsClipboard: true,
    truncatePreview: true,
  },
  {
    format: "ansi",
    label: "ANSI",
    subLabel: "terminal",
    modes: ALL_STATIC_MODES,
    artifactKind: "text",
    supportsColor: true,
    supportsClipboard: true,
    truncatePreview: true,
  },
  {
    format: "png",
    label: "PNG",
    subLabel: "image",
    modes: ALL_STATIC_MODES,
    artifactKind: "blob",
    supportsColor: true,
    supportsClipboard: true,
    truncatePreview: false,
  },
] as const;

const FORMAT_ORDER: Record<CanvasMode, readonly ExportFormat[]> = {
  freeform: ["txt", "chardesk", "png"],
  slide: ["chardesk"],
};

export const getAvailableExportFormats = (mode: CanvasMode) =>
  FORMAT_ORDER[mode].map(
    (format) => EXPORT_FORMATS.find((definition) => definition.format === format)!
  );

export const getExportFormatDefinition = (format: ExportFormat) =>
  EXPORT_FORMATS.find((definition) => definition.format === format);
