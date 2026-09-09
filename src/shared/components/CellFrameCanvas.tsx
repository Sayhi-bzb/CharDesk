import { useEffect, useRef } from "react";
import type { CellRect } from "@chardesk/cell-core";
import { presentCharDeskCellFrame } from "@chardesk/rendering/canvas";
import { useCanvasFont } from "@/shared/fonts/hooks";
import type { GridCellSource } from "@/shared/types";
import {
  createGridCellFrame,
  DEFAULT_ARTIFACT_CANVAS_PALETTE,
  DEFAULT_GRID_RENDER_METRICS,
  loadRenderFonts,
  prepareCanvasSurface,
  resolveCellFrameCanvasLayout,
} from "@/shared/metrics";

type CellFrameCanvasProps = {
  source: GridCellSource;
  viewport: CellRect;
  fit?: "native" | "contain";
  zoom?: number;
  padding?: number;
  maxScale?: number;
  className?: string;
};

export function CellFrameCanvas({
  source,
  viewport,
  fit = "native",
  zoom = 1,
  padding = 8,
  maxScale = 2,
  className,
}: CellFrameCanvasProps) {
  const { profile: fontProfile } = useCanvasFont();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nativeWidth =
    viewport.width * DEFAULT_GRID_RENDER_METRICS.cellWidth * zoom;
  const nativeHeight =
    viewport.height * DEFAULT_GRID_RENDER_METRICS.cellHeight * zoom;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewport.width === 0 || viewport.height === 0) return;
    let active = true;

    const render = () => {
      if (!active) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const surface =
        fit === "contain"
          ? canvas.getBoundingClientRect()
          : { width: nativeWidth, height: nativeHeight };
      prepareCanvasSurface(
        canvas,
        ctx,
        surface.width,
        surface.height,
        window.devicePixelRatio || 1
      );
      if (fit === "contain") {
        canvas.style.width = "100%";
        canvas.style.height = "100%";
      }
      const layout =
        fit === "contain"
          ? resolveCellFrameCanvasLayout({
              viewportWidth: surface.width,
              viewportHeight: surface.height,
              frameViewport: viewport,
              metrics: DEFAULT_GRID_RENDER_METRICS,
              padding,
              maxScale,
            })
          : {
              offset: {
                x:
                  viewport.x === 0
                    ? 0
                    : -viewport.x *
                      DEFAULT_GRID_RENDER_METRICS.cellWidth *
                      zoom,
                y:
                  viewport.y === 0
                    ? 0
                    : -viewport.y *
                      DEFAULT_GRID_RENDER_METRICS.cellHeight *
                      zoom,
              },
              width: nativeWidth,
              height: nativeHeight,
              scale: zoom,
            };
      if (!layout) return;
      presentCharDeskCellFrame(
        ctx,
        createGridCellFrame(source, viewport),
        {
          metrics: DEFAULT_GRID_RENDER_METRICS,
          palette: DEFAULT_ARTIFACT_CANVAS_PALETTE,
          offset: layout.offset,
          zoom: layout.scale,
          fontProfile,
        }
      );
    };

    render();
    const observer =
      fit !== "contain" || typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(render);
    observer?.observe(canvas);
    document.fonts?.addEventListener("loadingdone", render);
    const samples: string[] = [];
    source.visit(viewport, (_x, _y, cell) => samples.push(cell.char));
    void loadRenderFonts(samples, fontProfile)
      .then(render)
      .catch(() => {});

    return () => {
      active = false;
      observer?.disconnect();
      document.fonts?.removeEventListener("loadingdone", render);
    };
  }, [
    fit,
    fontProfile,
    maxScale,
    nativeHeight,
    nativeWidth,
    padding,
    source,
    viewport,
    zoom,
  ]);

  if (viewport.width === 0 || viewport.height === 0) return null;
  return (
    <canvas
      ref={canvasRef}
      data-testid="cell-frame-canvas"
      data-fit={fit}
      className={className ? `block ${className}` : "block"}
      style={
        fit === "contain"
          ? { width: "100%", height: "100%" }
          : { width: `${nativeWidth}px`, height: `${nativeHeight}px` }
      }
      aria-hidden="true"
    />
  );
}
