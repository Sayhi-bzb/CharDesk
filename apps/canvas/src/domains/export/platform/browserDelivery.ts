import { clipboard } from "@/shared/services/effects";
import {
  exportFailed,
  exportFailedFromCause,
  exportSucceeded,
  type ExportArtifact,
  type ExportResult,
} from "../core/types";

export const deliverExportDownload = async (
  artifact: ExportArtifact
): Promise<ExportResult<true>> => {
  try {
    const blob =
      artifact.kind === "blob"
        ? await artifact.content
        : new Blob([artifact.content], { type: artifact.mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = artifact.filename;
    link.href = url;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return exportSucceeded(true);
  } catch (cause) {
    return exportFailedFromCause(cause, "download-failed");
  }
};

export const deliverExportClipboard = async (
  artifact: ExportArtifact
): Promise<ExportResult<true>> => {
  try {
    if (artifact.kind === "text") {
      return (await clipboard.writeText(artifact.content))
        ? exportSucceeded(true)
        : exportFailed("clipboard-write-failed");
    }
    if (typeof ClipboardItem === "undefined") {
      return exportFailed("clipboard-unavailable");
    }

    let contentError: unknown;
    const content = artifact.content.catch((cause) => {
      contentError = cause;
      throw cause;
    });
    void content.catch(() => undefined);
    const written = await clipboard.writeItemsResult([
      new ClipboardItem({ [artifact.mimeType]: content }),
    ]);
    return written.ok
      ? exportSucceeded(true)
      : contentError
        ? exportFailedFromCause(contentError, "encoding-failed")
        : exportFailed("clipboard-write-failed", written.cause);
  } catch (cause) {
    return exportFailedFromCause(cause, "clipboard-write-failed");
  }
};
