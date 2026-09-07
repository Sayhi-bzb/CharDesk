import { useEffect, useRef } from "react";
import { useCanvasFont } from "@/shared/fonts/hooks";
import type { StructuredTemplatePreview } from "@/domains/structured-content/public";
import { cn } from "@chardesk/ui";
import {
  DEFAULT_GRID_RENDER_METRICS,
  drawCellBackground,
  drawCellText,
  loadRenderFonts,
  prepareCanvasSurface,
} from "@/shared/metrics";
import { resolveStructuredTemplatePreviewLayout } from "./structured-template-preview-layout";

type StructuredTemplatePreviewFit = "native" | "contain";
type StructuredTemplatePreviewMode = "full" | "characters";

type StructuredTemplatePreviewGridProps = {
  preview: StructuredTemplatePreview;
  cellWidth: number;
  cellHeight: number;
  fontSize: number;
  fit?: StructuredTemplatePreviewFit;
  mode?: StructuredTemplatePreviewMode;
  padding?: number;
  maxScale?: number;
  className?: string;
};

export function StructuredTemplatePreviewGrid({
  preview,
  cellWidth,
  cellHeight,
  fontSize,
  fit = "native",
  mode = "full",
  padding = 8,
  maxScale = 2,
  className,
}: StructuredTemplatePreviewGridProps) {
  const { profile: fontProfile } = useCanvasFont();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const width = preview.width * cellWidth;
  const height = preview.height * cellHeight;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || preview.width === 0 || preview.height === 0) return;
    let active = true;

    const render = () => {
      if (!active) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const viewport =
        fit === "contain"
          ? canvas.getBoundingClientRect()
          : { width, height };
      const layout =
        fit === "contain"
          ? resolveStructuredTemplatePreviewLayout({
              viewportWidth: viewport.width,
              viewportHeight: viewport.height,
              columns: preview.width,
              rows: preview.height,
              cellWidth,
              cellHeight,
              padding,
              maxScale,
            })
          : {
              x: 0,
              y: 0,
              width,
              height,
              scale: 1,
            };
      if (!layout) return;

      const metrics = {
        ...DEFAULT_GRID_RENDER_METRICS,
        cellWidth,
        cellHeight,
        fontSize,
      };
      const dpr = window.devicePixelRatio || 1;
      prepareCanvasSurface(canvas, ctx, viewport.width, viewport.height, dpr);
      if (mode === "full") {
        preview.rows.forEach((row, y) => {
          row.forEach((cell, x) => {
            drawCellBackground(
              ctx,
              cell,
              layout.x + x * cellWidth * layout.scale,
              layout.y + y * cellHeight * layout.scale,
              { metrics, zoom: layout.scale }
            );
          });
        });
      }
      preview.rows.forEach((row, y) => {
        row.forEach((cell, x) => {
          if (cell.char === " " && !cell.attrs) return;
          drawCellText(
            ctx,
            cell,
            layout.x + x * cellWidth * layout.scale,
            layout.y + y * cellHeight * layout.scale,
            { metrics, zoom: layout.scale, fontProfile }
          );
        });
      });
    };

    render();
    const observer =
      fit !== "contain" || typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(render);
    observer?.observe(canvas);
    document.fonts?.addEventListener("loadingdone", render);
    void loadRenderFonts(
      preview.rows.flatMap((row) => row.map((cell) => cell.char)), fontProfile
    ).then(render).catch(() => { /* Keep the existing preview if a fallback font fails. */ });

    return () => {
      active = false;
      observer?.disconnect();
      document.fonts?.removeEventListener("loadingdone", render);
    };
  }, [
    cellHeight,
    cellWidth,
    fit,
    fontSize,
    fontProfile,
    height,
    maxScale,
    mode,
    padding,
    preview,
    width,
  ]);

  if (preview.width === 0 || preview.height === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      data-testid="structured-template-preview-grid"
      data-fit={fit}
      data-preview-mode={mode}
      className={cn("block font-mono", className)}
      style={
        fit === "contain"
          ? { width: "100%", height: "100%" }
          : { width: `${width}px`, height: `${height}px` }
      }
      aria-hidden="true"
    />
  );
}
