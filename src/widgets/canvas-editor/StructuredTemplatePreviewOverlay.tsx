import { DEFAULT_GRID_RENDER_METRICS } from "@/shared/metrics";
import { StructuredTemplatePreviewGrid } from "@/widgets/toolbar/structured-template-preview-grid";
import type { StructuredTemplateDropResult } from "./hooks/useStructuredTemplateDrop";

type StructuredTemplatePreviewOverlayProps = {
  preview: StructuredTemplateDropResult["preview"];
  zoom: number;
};

export const StructuredTemplatePreviewOverlay = ({
  preview,
  zoom,
}: StructuredTemplatePreviewOverlayProps) => {
  if (!preview) return null;
  const { cellRect, grid } = preview;
  return (
    <div
      data-testid="structured-template-preview"
      className="pointer-events-none absolute z-(--layer-canvas-interaction)"
      style={{
        left: `${cellRect.x}px`,
        top: `${cellRect.y}px`,
        width: `${cellRect.width * grid.width}px`,
        height: `${cellRect.height * grid.height}px`,
      }}
    >
      <StructuredTemplatePreviewGrid
        preview={grid}
        cellWidth={cellRect.width}
        cellHeight={cellRect.height}
        fontSize={DEFAULT_GRID_RENDER_METRICS.fontSize * zoom}
        mode="characters"
      />
    </div>
  );
};
