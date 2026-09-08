"use client";

import { useEffect, useRef, useState } from "react";
import type {
  SlideDescriptor,
  SlideGridEntry,
} from "@/domains/slides/public";
import { useHostVisualTheme } from "@/shared/hooks/useHostVisualTheme";
import { drawSlideCanvas } from "./slide-canvas-renderer";

export function SlidePreviewCanvas({
  slide,
  contentRevision = 0,
  loadGrid,
}: {
  slide: SlideDescriptor;
  contentRevision?: number;
  loadGrid?: () => SlideGridEntry[];
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualTheme = useHostVisualTheme(hostRef);
  const [visible, setVisible] = useState(
    () => typeof IntersectionObserver === "undefined"
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      { rootMargin: "240px 0px" }
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !visualTheme) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      const { width, height } = canvas.getBoundingClientRect();
      drawSlideCanvas({
        canvas,
        slide: { ...slide, grid: loadGrid?.() ?? [] },
        size: slide.size,
        viewportWidth: width,
        viewportHeight: height,
        padding: 0,
        backdropColor: null,
        pageColor: null,
        defaultTextColor: visualTheme.host.previewText,
      });
    };

    render();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(render);
    observer?.observe(canvas);
    document.fonts?.addEventListener("loadingdone", render);

    return () => {
      observer?.disconnect();
      document.fonts?.removeEventListener("loadingdone", render);
    };
  }, [contentRevision, loadGrid, slide, visible, visualTheme]);

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0">
      {visible ? (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          data-testid="slide-preview-canvas"
          className="block size-full"
        />
      ) : null}
    </div>
  );
}
