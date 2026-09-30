import { useRef, useState, type ChangeEvent } from "react";
import { useCanvasRuntime } from "@/domains/canvas/public";
import { feedback } from "@/shared/services/effects";
import { useUiI18n } from "@/shared/i18n";

export function useCanvasImport() {
  const canvas = useCanvasRuntime();
  const { t } = useUiI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importCanvasSession = canvas.commands.sessions.import;
  const [isImporting, setIsImporting] = useState(false);

  const openFilePicker = () => {
    if (isImporting) return;
    fileInputRef.current?.click();
  };

  const reportFailure = (error: unknown) => {
    feedback.error(t("import.failed"), {
      description:
        error instanceof Error
          ? error.message
          : t("import.failedDescription"),
    });
  };

  const importFile = async (file: File) => {
    setIsImporting(true);
    try {
      const raw = await file.text();
      await importCanvasSession(raw, {
        name: file.name.replace(/\.(?:slides\.md|chardesk|ans|txt|md)$/i, ""),
        sourceName: file.name,
      });
    } catch (error) {
      reportFailure(error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await importFile(file);
  };

  const handleDrop = async (items: DataTransferItem[], droppedFiles: File[]) => {
    if (isImporting) return;
    const entries = items.map((item) => item.webkitGetAsEntry?.()).filter(
      (entry): entry is FileSystemEntry => Boolean(entry),
    );
    if (droppedFiles.length === 1 && entries.every((entry) => entry.isFile)) {
      await importFile(droppedFiles[0]);
      return;
    }
    reportFailure(new Error(t("import.dropUnsupported")));
  };

  return {
    fileInputRef,
    handleDrop,
    handleFileChange,
    isImporting,
    openFilePicker,
  };
}
