import { Button, Tooltip, TooltipPopup, TooltipTrigger } from "@chardesk/ui";
import { useCanvasState, useCanvasViewport } from "@/domains/canvas/public";
import type { Point } from "@/shared/types";
import {
  useCanvasLiveViewportOptional,
  useCanvasViewOptional,
} from "@/widgets/canvas-editor/engine/CanvasWorkspace";
import type { EditorViewportFrame } from "@/widgets/editor-chrome/public";
import {
  resolveRemoteSelectionLayout,
  resolveRemoteSelectionRevealViewport,
  resolveRemoteSelectionVisuals,
} from "./remoteSelectionGeometry";
import { useCollaborationSnapshot } from "./useCollaborationSnapshot";

export function RemoteSelectionOverlay({
  viewportFrame,
}: {
  viewportFrame?: EditorViewportFrame;
}) {
  const { peers } = useCollaborationSnapshot();
  const canvasView = useCanvasViewOptional();
  const liveViewport = useCanvasLiveViewportOptional();
  const fallbackViewport = useCanvasViewport();
  const contentSurface = useCanvasState((state) => state.contentSurface);
  const viewport = {
    offset: liveViewport?.offset ?? fallbackViewport.offset,
    zoom: liveViewport?.zoom ?? fallbackViewport.zoom,
  };
  const visuals = resolveRemoteSelectionVisuals({
    peers,
    grid: contentSurface.reader,
    viewport,
  });
  const size = canvasView?.containerSize;
  const paneRect = {
    x: 0,
    y: 0,
    width: size?.width ?? viewportFrame?.width ?? 0,
    height: size?.height ?? viewportFrame?.height ?? 0,
  };
  const layout = resolveRemoteSelectionLayout(visuals, paneRect);

  const reveal = (center: Point) => {
    if (!canvasView) return;
    const targetCenter = viewportFrame?.center ?? {
      x: paneRect.width / 2,
      y: paneRect.height / 2,
    };
    canvasView.runtime.camera.animateTo(
      resolveRemoteSelectionRevealViewport(viewport, targetCenter, center),
      { duration: 220 }
    );
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 z-(--layer-presence) overflow-hidden"
    >
      <svg className="absolute inset-0 size-full" aria-hidden="true">
        {layout.visible.map((visual) => (
          <path
            key={visual.clientId}
            d={visual.path}
            fill="none"
            stroke={visual.color}
            strokeWidth="2"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      {layout.visible.map((visual) => (
        <span
          key={visual.clientId}
          aria-hidden="true"
          className="absolute whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none text-presence-label-foreground shadow-xs"
          style={{
            backgroundColor: visual.color,
            transform: `translate3d(${visual.labelAnchor.x}px, ${visual.labelAnchor.y}px, 0)`,
          }}
        >
          {visual.name}
        </span>
      ))}
      {layout.indicators.map((indicator) => (
        <Tooltip key={indicator.clientId}>
          <TooltipTrigger
            render={
              <Button
                type="button"
                tone="subtle"
                shape="pill"
                size="xs"
                data-canvas-ui="true"
                className="pointer-events-auto absolute size-5 -translate-x-1/2 -translate-y-1/2 border-0 p-0"
                style={{
                  left: indicator.position.x,
                  top: indicator.position.y,
                  backgroundColor: indicator.color,
                }}
                aria-label={indicator.name}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => reveal(indicator.center)}
              />
            }
          />
          <TooltipPopup>{indicator.name}</TooltipPopup>
        </Tooltip>
      ))}
    </div>
  );
}
