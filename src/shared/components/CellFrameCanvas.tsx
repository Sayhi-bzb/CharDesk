import { useEffect, useRef } from "react";
import type { CellRect } from "@chardesk/cell-core";
import { resolveCellFrameViewportLayout } from "@chardesk/rendering";
import {
  loadCharDeskCanvasFonts,
  prepareCharDeskCanvasSurface,
  presentCharDeskCellFrame,
} from "@chardesk/rendering/canvas";
import { useCanvasFont } from "@/shared/fonts/hooks";
import { useCanvasAppearance } from "@/shared/canvas-appearance/hooks";
import type { GridCellSource } from "@/shared/types";
import { createGridCellFrame } from "@/shared/cell-rendering/cell-frame";
import {
  DEFAULT_CANVAS_CELL_METRICS,
} from "@/shared/fonts/canvas-profile";

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
  const appearance = useCanvasAppearance();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nativeWidth =
    viewport.width * DEFAULT_CANVAS_CELL_METRICS.cellWidth * zoom;
  const nativeHeight =
    viewport.height * DEFAULT_CANVAS_CELL_METRICS.cellHeight * zoom;

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
      prepareCharDeskCanvasSurface(
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
          ? resolveCellFrameViewportLayout({
              viewportWidth: surface.width,
              viewportHeight: surface.height,
              frameViewport: viewport,
              metrics: DEFAULT_CANVAS_CELL_METRICS,
              padding,
              maxScale,
            })
          : {
              offset: {
                x:
                  viewport.x === 0
                    ? 0
                    : -viewport.x *
                      DEFAULT_CANVAS_CELL_METRICS.cellWidth *
                      zoom,
                y:
                  viewport.y === 0
                    ? 0
                    : -viewport.y *
                      DEFAULT_CANVAS_CELL_METRICS.cellHeight *
                      zoom,
              },
              width: nativeWidth,
              height: nativeHeight,
              scale: zoom,
            };
      if (!layout) return;
      presentCharDeskCellFrame(
        ctx,
        createGridCellFrame(source, viewport, "full", appearance.palette),
        {
          metrics: DEFAULT_CANVAS_CELL_METRICS,
          palette: appearance.palette,
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
    void loadCharDeskCanvasFonts(samples, { fontProfile })
      .then(render)
      .catch(() => {});

    return () => {
      active = false;
      observer?.disconnect();
      document.fonts?.removeEventListener("loadingdone", render);
    };
  }, [
    fit,
    appearance.palette,
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
