import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TestCanvasContentSurface } from "@/domains/canvas/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/domains/canvas/testing";
import { setUiLanguage } from "@/shared/i18n";
import { CanvasBreadcrumb } from "@/widgets/session-tabs/CanvasBreadcrumb";

const { saveExport } = vi.hoisted(() => ({ saveExport: vi.fn() }));

vi.mock("@/widgets/export/use-canvas-session-export", () => ({
  useCanvasSessionExport: () => ({ save: saveExport }),
}));

describe("Canvas selector export feedback", () => {
  const initialState = useEditorStore.getState();

  const openPngExport = async () => {
    const state = useEditorStore.getState();
    const target =
      state.canvasSessions.find((session) => session.id !== state.activeCanvasId) ??
      state.canvasSessions[0];
    fireEvent.click(screen.getByRole("button", { name: "Select canvas" }));
    fireEvent.pointerDown(screen.getByRole("button", { name: `Manage ${target.name}` }), {
      button: 0,
      ctrlKey: false,
    });
    const exportItem = await screen.findByRole("menuitem", { name: "Export" });
    fireEvent.pointerMove(exportItem, { pointerType: "mouse" });
    return {
      pngItem: await screen.findByRole("menuitem", { name: "PNG" }),
      targetId: target.id,
      activeCanvasId: state.activeCanvasId,
    };
  };

  beforeEach(() => {
    act(() => setUiLanguage("en"));
    saveExport.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ stargazers_count: 0 }),
    }));
    useEditorStore.setState({
      canvasMode: "freeform",
      contentSurface: new TestCanvasContentSurface([["0,0", { char: "A", color: "#fff" }]]),
    });
  });

  afterEach(() => {
    cleanup();
    useEditorStore.setState(initialState, true);
    vi.unstubAllGlobals();
  });

  it("shows export success on the selected format item", async () => {
    saveExport.mockResolvedValue({ ok: true });
    render(<CanvasBreadcrumb />);
    const { pngItem, targetId, activeCanvasId } = await openPngExport();

    fireEvent.click(pngItem);

    await waitFor(() => {
      expect(pngItem).toHaveAttribute("data-feedback", "success");
      expect(pngItem).toHaveClass("text-success");
    });
    expect(pngItem.querySelector(".lucide-check")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("PNG saved");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(saveExport).toHaveBeenCalledWith(targetId, "png");
    expect(useEditorStore.getState().activeCanvasId).toBe(activeCanvasId);
  });

  it("keeps a detailed oversized-image error inside the export submenu", async () => {
    saveExport.mockResolvedValue({ ok: false, errorCode: "image-too-large" });
    render(<CanvasBreadcrumb />);
    const { pngItem } = await openPngExport();

    fireEvent.click(pngItem);

    await waitFor(() => {
      expect(pngItem).toHaveAttribute("data-feedback", "error");
      expect(pngItem).toHaveClass("text-error");
    });
    expect(pngItem.querySelector(".lucide-x")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The image is too large to export safely."
    );
  });
});
