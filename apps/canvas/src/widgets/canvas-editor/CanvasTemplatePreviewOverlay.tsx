import { CellFrameCanvas } from "@/shared/components/CellFrameCanvas";
import type { CanvasTemplateDropResult } from "./hooks/useCanvasTemplateDrop";

type CanvasTemplatePreviewOverlayProps = {
  preview: CanvasTemplateDropResult["preview"];
  zoom: number;
};

export const CanvasTemplatePreviewOverlay = ({
  preview,
  zoom,
}: CanvasTemplatePreviewOverlayProps) => {
  if (!preview) return null;
  const { cellRect, projection } = preview;
  return (
    <div
      data-testid="canvas-template-preview"
      className="pointer-events-none absolute z-(--layer-canvas-interaction)"
      style={{
        left: `${cellRect.x}px`,
        top: `${cellRect.y}px`,
        width: `${cellRect.width * projection.viewport.width}px`,
        height: `${cellRect.height * projection.viewport.height}px`,
      }}
    >
      <CellFrameCanvas
        source={projection.source}
        viewport={projection.viewport}
        zoom={zoom}
      />
    </div>
  );
};
