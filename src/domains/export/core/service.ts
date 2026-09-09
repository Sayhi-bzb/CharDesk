import { serializeCharDeskDocumentEnvelope } from "@chardesk/document";
import type { CharDeskFontProfile } from "@chardesk/fonts";
import type { GridCellSource, SelectionArea } from "@/shared/types";
import {
  createPngBlobFromGrid,
  createSelectionPngBlob,
} from "../formats/raster";
import { exportToAnsi, exportToCharDesk, exportToString } from "../formats/text";
import { exportSlideDeckBodyToMarkdown } from "../formats/slidesMarkdown";
import { getExportFormatDefinition } from "./registry";
import {
  exportFailed,
  exportFailedFromCause,
  exportSucceeded,
  type ExportArtifact,
  type ExportContext,
  type ExportFormat,
  type ExportResult,
  type TextExportArtifact,
} from "./types";

const textArtifact = (
  format: ExportFormat,
  content: string,
  filename: string,
  mimeType: string
): TextExportArtifact => ({
  kind: "text",
  format,
  content,
  filename,
  mimeType,
});

const getTimestamp = () => Date.now();

export const prepareSelectionPngExport = (
  grid: GridCellSource,
  selections: SelectionArea[],
  showGrid: boolean,
  includeColor = true,
  fontProfile?: CharDeskFontProfile
): ExportResult<ExportArtifact> => {
  if (selections.length === 0) return exportFailed("empty-content");
  try {
    return exportSucceeded({
      kind: "blob",
      format: "png",
      content: createSelectionPngBlob(grid, selections, showGrid, includeColor, fontProfile),
      filename: `chardesk-selection-${getTimestamp()}.png`,
      mimeType: "image/png",
    });
  } catch (cause) {
    return exportFailedFromCause(cause, "encoding-failed");
  }
};

export const prepareTextExport = (
  context: ExportContext,
  format: ExportFormat
): ExportResult<TextExportArtifact> => {
  const definition = getExportFormatDefinition(format);
  if (
    !definition?.modes.includes(context.canvasMode) ||
    definition.artifactKind !== "text"
  ) {
    return exportFailed("unsupported-format");
  }

  try {
    const grid = context.surface;
    switch (format) {
      case "txt":
        return exportSucceeded(
          textArtifact(
            format,
            exportToString(grid),
            `chardesk-${getTimestamp()}.txt`,
            "text/plain;charset=utf-8"
          )
        );
      case "chardesk": {
        if (context.canvasMode === "slide" && !context.slideDeck) {
          return exportFailed("canvas-unavailable");
        }
        const body = context.canvasMode === "slide"
            ? exportSlideDeckBodyToMarkdown(context.slideDeck!, {
                includeColor: context.includeColor,
              })
            : exportToCharDesk(grid, {
                includeColor: context.includeColor,
              });
        return exportSucceeded(
          textArtifact(
            format,
            serializeCharDeskDocumentEnvelope({
              mode: context.canvasMode,
              body,
              ...(context.documentName ? { title: context.documentName } : {}),
            }),
            `chardesk-${getTimestamp()}.chardesk`,
            "text/plain;charset=utf-8"
          )
        );
      }
      case "ansi":
        return exportSucceeded(
          textArtifact(
            format,
            exportToAnsi(grid, {
              includeColor: context.includeColor,
            }),
            `chardesk-${getTimestamp()}.ans`,
            "text/plain;charset=utf-8"
          )
        );
      case "png":
        return exportFailed("unsupported-format");
    }
  } catch (cause) {
    return exportFailed("encoding-failed", cause);
  }
};

export const prepareExport = (
  context: ExportContext,
  format: ExportFormat
): ExportResult<ExportArtifact> => {
  const textResult = prepareTextExport(context, format);
  if (textResult.ok || format !== "png") return textResult;

  try {
    if (!context.surface.getContentBounds()) return exportFailed("empty-content");
    return exportSucceeded({
      kind: "blob",
      format: "png",
      content: createPngBlobFromGrid(
        context.surface,
        context.showGrid,
        context.includeColor,
        context.fontProfile
      ),
      filename: `chardesk-${getTimestamp()}.png`,
      mimeType: "image/png",
    });
  } catch (cause) {
    return exportFailedFromCause(cause, "encoding-failed");
  }
};
