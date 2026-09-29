import { getCellViewportRect } from "@chardesk/rendering";
import { useCanvasViewport, type CanvasAnchor } from "@/domains/canvas/public";
import { DEFAULT_CANVAS_CELL_METRICS } from "@/shared/fonts/canvas-profile";
import { useCanvasLiveViewportOptional, useCanvasViewOptional } from "./engine/CanvasWorkspace";

export function CanvasAnchorOverlay({ anchors }: { anchors: readonly CanvasAnchor[] }) {
  const liveViewport = useCanvasLiveViewportOptional();
  const view = useCanvasViewOptional();
  const fallbackViewport = useCanvasViewport();
  const viewport = liveViewport ?? fallbackViewport;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {anchors.map((anchor) => {
        const rect = getCellViewportRect(anchor.point, viewport, DEFAULT_CANVAS_CELL_METRICS);
        return (
          <span
            key={anchor.id}
            data-testid="canvas-anchor-marker"
            data-highlighted={anchor.id === view?.highlightedAnchorId ? "true" : undefined}
            className={anchor.id === view?.highlightedAnchorId
              ? "absolute font-mono text-[12px] leading-3 text-canvas-anchor-highlight"
              : "absolute font-mono text-[12px] leading-3 text-foreground"}
            style={{ left: rect.x - 12, top: rect.y + rect.height / 2 - 6 }}
          >●</span>
        );
      })}
    </div>
  );
}
