import { useCallback } from "react";
import { useCanvasFontRuntime } from "@/shared/fonts/hooks";
import { useCanvasAppearance } from "@/shared/canvas-appearance/hooks";
import { useCanvasRuntime } from "@/domains/canvas/public";
import {
  deliverExportDownload,
  prepareExport,
  type ExportFormat,
} from "@/domains/export/public";

export type CanvasSessionExportErrorCode = "image-too-large" | "save-failed";

type CanvasSessionExportResult =
  | { ok: true }
  | { ok: false; errorCode: CanvasSessionExportErrorCode };

export function useCanvasSessionExport() {
  const canvas = useCanvasRuntime();
  const fonts = useCanvasFontRuntime();
  const appearance = useCanvasAppearance();
  const save = useCallback(
    async (
      sessionId: string,
      format: ExportFormat
    ): Promise<CanvasSessionExportResult> => {
      const fontProfile = fonts.getSnapshot().profile;
      const session = await canvas.materializeSession(sessionId);
      if (!session) return { ok: false, errorCode: "save-failed" };
      const prepared = prepareExport(
        {
          canvasMode: session.mode,
          fontProfile,
          artifactPalette:
            session.mode === "freeform" ? appearance.palette : undefined,
          surface: session.surface,
          includeColor: true,
          showGrid: false,
          slideDeck: session.slideDeck,
          documentName: session.name,
        },
        format
      );
      const delivered = prepared.ok
        ? await deliverExportDownload(prepared.value)
        : prepared;
      return delivered.ok
        ? { ok: true }
        : {
            ok: false,
            errorCode:
              delivered.error.code === "image-too-large"
                ? "image-too-large"
                : "save-failed",
          };
    },
    [appearance.palette, canvas, fonts]
  );

  return { save };
}
