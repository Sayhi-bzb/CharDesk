import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { testingCanvasRuntime } from "@/domains/canvas/testing";
import { DEFAULT_CANVAS_CELL_METRICS } from "@/shared/fonts/canvas-profile";
import { CanvasAnchorOverlay } from "./CanvasAnchorOverlay";
import {
  CanvasViewProvider,
  CanvasWorkspaceProvider,
  useCanvasViewOptional,
  type CanvasViewId,
} from "./engine/CanvasWorkspace";

const anchor = {
  id: "anchor",
  point: { x: 2, y: 3 },
  label: "Title",
    order: 0,
    parentId: null,
  detached: false,
} as const;

function AnchorView({ viewId }: { viewId: CanvasViewId }) {
  const view = useCanvasViewOptional();
  return (
    <div data-testid={`anchor-view-${viewId}`}>
      <button type="button" onClick={() => view?.runtime.camera.queuePan(40, 20)}>
        {`pan-${viewId}`}
      </button>
      <button type="button" onClick={() => view?.runtime.camera.setTransientViewport({
        offset: { x: -12, y: 6 }, zoom: 2,
      })}>
        {`zoom-${viewId}`}
      </button>
      <button type="button" onClick={() => view?.flashAnchor(anchor.id)}>
        {`flash-${viewId}`}
      </button>
      <CanvasAnchorOverlay anchors={[anchor]} />
    </div>
  );
}

describe("CanvasAnchorOverlay", () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    localStorage.clear();
    testingCanvasRuntime.viewport.resetFallback({ offset: { x: 0, y: 0 }, zoom: 1 });
  });

  it("tracks the live camera during transient pan and zoom without moving another view", async () => {
    vi.useFakeTimers();
    render(
      <CanvasWorkspaceProvider>
        <CanvasViewProvider viewId="primary"><AnchorView viewId="primary" /></CanvasViewProvider>
        <CanvasViewProvider viewId="secondary"><AnchorView viewId="secondary" /></CanvasViewProvider>
      </CanvasWorkspaceProvider>
    );

    const primary = within(screen.getByTestId("anchor-view-primary"))
      .getByTestId("canvas-anchor-marker");
    const secondary = within(screen.getByTestId("anchor-view-secondary"))
      .getByTestId("canvas-anchor-marker");
    const baseLeft = anchor.point.x * DEFAULT_CANVAS_CELL_METRICS.cellWidth - 12;
    const baseTop = (anchor.point.y + 0.5) * DEFAULT_CANVAS_CELL_METRICS.cellHeight - 6;
    expect(primary).toHaveStyle({ left: `${baseLeft}px`, top: `${baseTop}px` });
    expect(secondary).toHaveStyle({ left: `${baseLeft}px`, top: `${baseTop}px` });

    fireEvent.click(screen.getByRole("button", { name: "pan-primary" }));
    await act(() => vi.advanceTimersByTimeAsync(20));
    expect(primary).toHaveStyle({ left: `${baseLeft + 40}px`, top: `${baseTop + 20}px` });
    expect(secondary).toHaveStyle({ left: `${baseLeft}px`, top: `${baseTop}px` });

    fireEvent.click(screen.getByRole("button", { name: "zoom-primary" }));
    expect(primary).toHaveStyle({
      left: `${-12 + anchor.point.x * DEFAULT_CANVAS_CELL_METRICS.cellWidth * 2 - 12}px`,
      top: `${6 + (anchor.point.y + 0.5) * DEFAULT_CANVAS_CELL_METRICS.cellHeight * 2 - 6}px`,
    });
    expect(secondary).toHaveStyle({ left: `${baseLeft}px`, top: `${baseTop}px` });
  });

  it("marks only the selected view's anchor for two seconds and restarts on repeat", async () => {
    vi.useFakeTimers();
    render(
      <CanvasWorkspaceProvider>
        <CanvasViewProvider viewId="primary"><AnchorView viewId="primary" /></CanvasViewProvider>
        <CanvasViewProvider viewId="secondary"><AnchorView viewId="secondary" /></CanvasViewProvider>
      </CanvasWorkspaceProvider>
    );
    const primary = within(screen.getByTestId("anchor-view-primary"));
    const secondary = within(screen.getByTestId("anchor-view-secondary"));
    fireEvent.click(primary.getByRole("button", { name: "flash-primary" }));
    expect(primary.getByTestId("canvas-anchor-marker")).toHaveAttribute("data-highlighted", "true");
    expect(primary.getByTestId("canvas-anchor-marker")).toHaveTextContent("●");
    expect(primary.getByTestId("canvas-anchor-marker")).toHaveClass("text-canvas-anchor-highlight");
    expect(secondary.getByTestId("canvas-anchor-marker")).not.toHaveAttribute("data-highlighted");
    expect(secondary.getByTestId("canvas-anchor-marker")).toHaveClass("text-foreground");
    await act(() => vi.advanceTimersByTimeAsync(1_900));
    fireEvent.click(primary.getByRole("button", { name: "flash-primary" }));
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(primary.getByTestId("canvas-anchor-marker")).toHaveAttribute("data-highlighted", "true");
    await act(() => vi.advanceTimersByTimeAsync(1_800));
    expect(primary.getByTestId("canvas-anchor-marker")).not.toHaveAttribute("data-highlighted");
    expect(primary.getByTestId("canvas-anchor-marker")).toHaveClass("text-foreground");
  });
});
