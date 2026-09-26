import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createCanvasAppearanceRuntime } from "./runtime";
import { CanvasAppearanceBridge, CanvasAppearanceProvider } from "./react";
import { createCanvasVisualThemeFixture } from "./test-theme";

const hostTheme = vi.hoisted(() => ({ resolved: "dark" as "light" | "dark" }));

vi.mock("@chardesk/ui", () => ({
  useUiTheme: () => ({ resolvedTheme: hostTheme.resolved }),
  readUiRuntimeTheme: () =>
    createCanvasVisualThemeFixture({
      host: { previewText: "rgb(240, 240, 240)" },
      canvas: {
        selectionSurface: "rgba(240, 240, 240, 0.12)",
        selectionBorder: "rgb(240, 240, 240)",
        textCursorSurface: "rgb(240, 240, 240)",
        textCursorForeground: "rgb(20, 20, 20)",
      artifact: {
        foreground: "rgb(240, 240, 240)",
        background: "rgb(20, 20, 20)",
        grid: "rgb(40, 40, 40)",
      },
      },
    }),
}));

describe("CanvasAppearanceBridge", () => {
  it("publishes one complete theme after the resolved class reaches the DOM", async () => {
    document.documentElement.style.setProperty(
      "--canvas-artifact-background",
      "rgb(20, 20, 20)"
    );
    document.documentElement.classList.remove("dark");
    const runtime = createCanvasAppearanceRuntime();

    render(
      <CanvasAppearanceProvider runtime={runtime}>
        <CanvasAppearanceBridge />
      </CanvasAppearanceProvider>
    );

    expect(runtime.getSnapshot().revision).toBe(0);
    act(() => document.documentElement.classList.add("dark"));

    await waitFor(() => {
      expect(runtime.getSnapshot()).toMatchObject({
        resolvedTheme: "dark",
        visualTheme: {
          host: { previewText: "rgb(240, 240, 240)" },
          canvas: {
            selectionBorder: "rgb(240, 240, 240)",
            textCursorSurface: "rgb(240, 240, 240)",
            textCursorForeground: "rgb(20, 20, 20)",
          },
        },
        palette: {
          color: "rgb(240, 240, 240)",
          background: "rgb(20, 20, 20)",
          grid: "rgb(40, 40, 40)",
        },
        revision: 1,
      });
    });
    document.documentElement.style.removeProperty(
      "--canvas-artifact-background"
    );
    document.documentElement.classList.remove("dark");
  });
});
