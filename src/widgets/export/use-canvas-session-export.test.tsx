import { act, renderHook } from "@testing-library/react";
import { CanvasFontProvider } from "@/shared/fonts/react";
import { createCanvasFontRuntime } from "@/shared/fonts/runtime";
import { CanvasAppearanceProvider } from "@/shared/canvas-appearance/react";
import { createCanvasAppearanceRuntime } from "@/shared/canvas-appearance/runtime";
import { createCanvasVisualThemeFixture } from "@/shared/canvas-appearance/test-theme";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testingCanvasRuntime } from "@/domains/canvas/testing";
import { useCanvasSessionExport } from "./use-canvas-session-export";

const { deliverExportDownload, prepareExport } = vi.hoisted(() => ({
  deliverExportDownload: vi.fn(),
  prepareExport: vi.fn(),
}));

vi.mock("@/domains/export/public", () => ({
  deliverExportDownload,
  prepareExport,
}));

describe("useCanvasSessionExport", () => {
  const materialized = {
    id: "canvas-a",
    name: "Alpha",
    mode: "freeform" as const,
    surface: {},
    slideDeck: null,
  };

  beforeEach(() => {
    deliverExportDownload.mockReset();
    prepareExport.mockReset();
    vi.spyOn(testingCanvasRuntime, "materializeSession").mockResolvedValue(
      materialized as never
    );
  });

  it("returns a successful result without owning presentation feedback", async () => {
    prepareExport.mockReturnValue({ ok: true, value: { kind: "text" } });
    deliverExportDownload.mockResolvedValue({ ok: true, value: true });
    const { result } = renderHook(() => useCanvasSessionExport());

    await expect(result.current.save("canvas-a", "chardesk")).resolves.toEqual({ ok: true });
    expect(testingCanvasRuntime.materializeSession).toHaveBeenCalledWith("canvas-a");
    expect(prepareExport).toHaveBeenCalledWith(
      expect.objectContaining({ documentName: "Alpha", canvasMode: "freeform" }),
      "chardesk"
    );
  });

  it("captures the effective font before asynchronous session materialization", async () => {
    const fonts = createCanvasFontRuntime({ load: async () => {} });
    const { result } = renderHook(() => useCanvasSessionExport(), {
      wrapper: ({ children }) => <CanvasFontProvider runtime={fonts}>{children}</CanvasFontProvider>,
    });
    await act(() => fonts.select("fusion-mono"));
    const profile = fonts.getSnapshot().profile;
    let complete!: () => void;
    vi.mocked(testingCanvasRuntime.materializeSession).mockReturnValueOnce(new Promise((resolve) => {
      complete = () => resolve(materialized as never);
    }));
    prepareExport.mockReturnValue({ ok: true, value: { kind: "blob" } });
    deliverExportDownload.mockResolvedValue({ ok: true, value: true });
    const pending = result.current.save("canvas-a", "png");
    await act(() => fonts.select("xiaolai-mono"));
    complete();
    await pending;
    expect(prepareExport).toHaveBeenCalledWith(expect.objectContaining({ fontProfile: profile }), "png");
    fonts.dispose();
  });

  it("captures the Canvas palette before asynchronous session materialization", async () => {
    const appearance = createCanvasAppearanceRuntime();
    const dark = { color: "#eee", background: "#111", grid: "#222" };
    appearance.sync("dark", createCanvasVisualThemeFixture({
      canvas: {
        artifact: {
          foreground: dark.color,
          background: dark.background,
          grid: dark.grid,
        },
      },
    }));
    const { result } = renderHook(() => useCanvasSessionExport(), {
      wrapper: ({ children }) => (
        <CanvasAppearanceProvider runtime={appearance}>
          {children}
        </CanvasAppearanceProvider>
      ),
    });
    let complete!: () => void;
    vi.mocked(testingCanvasRuntime.materializeSession).mockReturnValueOnce(
      new Promise((resolve) => {
        complete = () => resolve(materialized as never);
      })
    );
    prepareExport.mockReturnValue({ ok: true, value: { kind: "blob" } });
    deliverExportDownload.mockResolvedValue({ ok: true, value: true });

    const pending = result.current.save("canvas-a", "png");
    appearance.sync("light", createCanvasVisualThemeFixture());
    complete();
    await pending;

    expect(prepareExport).toHaveBeenCalledWith(
      expect.objectContaining({ artifactPalette: dark }),
      "png"
    );
    appearance.dispose();
  });

  it("preserves the oversized-image error category for the menu", async () => {
    prepareExport.mockReturnValue({
      ok: false,
      error: { code: "image-too-large" },
    });
    const { result } = renderHook(() => useCanvasSessionExport());

    await expect(result.current.save("canvas-a", "png")).resolves.toEqual({
      ok: false,
      errorCode: "image-too-large",
    });
    expect(deliverExportDownload).not.toHaveBeenCalled();
  });

  it("maps other pipeline failures to the generic save category", async () => {
    prepareExport.mockReturnValue({ ok: true, value: { kind: "text" } });
    deliverExportDownload.mockResolvedValue({
      ok: false,
      error: { code: "download-failed" },
    });
    const { result } = renderHook(() => useCanvasSessionExport());

    await expect(result.current.save("canvas-a", "chardesk")).resolves.toEqual({
      ok: false,
      errorCode: "save-failed",
    });
  });

  it("fails without attempting delivery when the session cannot be materialized", async () => {
    vi.mocked(testingCanvasRuntime.materializeSession).mockResolvedValue(null);
    const { result } = renderHook(() => useCanvasSessionExport());

    await expect(result.current.save("missing", "chardesk")).resolves.toEqual({
      ok: false,
      errorCode: "save-failed",
    });
    expect(prepareExport).not.toHaveBeenCalled();
    expect(deliverExportDownload).not.toHaveBeenCalled();
  });
});
