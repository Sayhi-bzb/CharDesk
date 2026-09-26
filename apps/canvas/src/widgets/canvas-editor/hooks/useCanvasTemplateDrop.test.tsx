import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CANVAS_TEMPLATE_MIME } from "@/domains/canvas-templates/public";
import { CHARDESK_DARK_CONTENT_THEME } from "@chardesk/rendering/theme";
import type { CanvasEditorModel } from "./canvasModels";
import { useCanvasTemplateDrop } from "./useCanvasTemplateDrop";

vi.mock("@chardesk/ui", async (importOriginal) => ({
  ...await importOriginal<typeof import("@chardesk/ui")>(),
  useUiTheme: () => ({ resolvedTheme: "dark" as const }),
}));

describe("useCanvasTemplateDrop", () => {
  it("commits the same template artifact and selects the inserted result", () => {
    const insertRows = vi.fn();
    const host = document.createElement("div");
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 300,
      bottom: 300,
      left: 0,
      width: 300,
      height: 300,
      toJSON: () => ({}),
    });
    const model = {
      offset: { x: 0, y: 0 },
      zoom: 1,
      insertRows,
    } as unknown as CanvasEditorModel;
    const { result } = renderHook(() =>
      useCanvasTemplateDrop({
        canvasMode: "freeform",
        containerRef: { current: host },
        model,
      })
    );
    const preventDefault = vi.fn();
    const dataTransfer = {
      types: [CANVAS_TEMPLATE_MIME],
      getData: vi.fn(() => "button"),
    };

    act(() => {
      result.current.surfaceProps.onDrop({
        clientX: 18,
        clientY: 40,
        dataTransfer,
        preventDefault,
      } as never);
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(insertRows).toHaveBeenCalledOnce();
    expect(insertRows.mock.calls[0][0][0].spans[0]).toMatchObject({
      color: CHARDESK_DARK_CONTENT_THEME.foreground,
      bgColor: CHARDESK_DARK_CONTENT_THEME.surface,
    });
    expect(insertRows.mock.calls[0][1]).toEqual({ x: 2, y: 2 });
    expect(insertRows.mock.calls[0][2]).toEqual({ selectResult: true });
  });
});
