import { useRef, useState, type ChangeEvent } from "react";
import { serializeCharDeskDocumentEnvelope } from "@chardesk/document";
import { useCanvasRuntime } from "@/domains/canvas/public";
import { feedback } from "@/shared/services/effects";
import { useUiI18n } from "@/shared/i18n";
import { compileBlackboardDirectory } from "./blackboard-directory";

export function useCanvasImport() {
  const canvas = useCanvasRuntime();
  const { t } = useUiI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const directoryInputRef = useRef<HTMLInputElement | null>(null);
  const importCanvasSession = canvas.commands.sessions.import;
  const [isImporting, setIsImporting] = useState(false);

  const openFilePicker = () => {
    if (isImporting) return;
    fileInputRef.current?.click();
  };

  const openBlackboardPicker = () => {
    if (isImporting) return;
    directoryInputRef.current?.click();
  };

  const reportFailure = (error: unknown) => {
    feedback.error(t("import.failed"), {
      description:
        error instanceof Error
          ? error.message
          : t("import.failedDescription"),
    });
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

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

  const handleBlackboardDirectoryChange = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    setIsImporting(true);
    try {
      const compiled = await compileBlackboardDirectory(files);
      await importCanvasSession(serializeCharDeskDocumentEnvelope({
        mode: compiled.mode,
        title: compiled.title,
        body: compiled.source,
      }), {
        name: compiled.title,
        sourceName: "blackboard.chardesk",
      });
    } catch (error) {
      reportFailure(error);
    } finally {
      setIsImporting(false);
    }
  };

  return {
    directoryInputRef,
    fileInputRef,
    handleBlackboardDirectoryChange,
    handleFileChange,
    isImporting,
    openBlackboardPicker,
    openFilePicker,
  };
}
