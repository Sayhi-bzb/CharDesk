import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getCanvasTemplateProjection } from "@/domains/canvas-templates/public";

vi.mock("@/shared/components/CellFrameCanvas", () => ({
  CellFrameCanvas: ({ zoom }: { zoom?: number }) => (
    <canvas data-testid="cell-frame-canvas" data-zoom={zoom} />
  ),
}));

import { CanvasTemplatePreviewOverlay } from "./CanvasTemplatePreviewOverlay";

describe("CanvasTemplatePreviewOverlay", () => {
  it("places the shared artifact presenter on the target grid rectangle", () => {
    const projection = getCanvasTemplateProjection("button");

    render(
      <CanvasTemplatePreviewOverlay
        preview={{
          cellRect: { x: 18, y: 40, width: 13.5, height: 30 },
          projection,
        }}
        zoom={1.5}
      />
    );

    expect(screen.getByTestId("canvas-template-preview")).toHaveStyle({
      left: "18px",
      top: "40px",
      width: "108px",
      height: "30px",
    });
    expect(screen.getByTestId("cell-frame-canvas")).toHaveAttribute(
      "data-zoom",
      "1.5"
    );
  });
});
