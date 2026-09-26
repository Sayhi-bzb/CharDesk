import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasFontProvider } from "@/shared/fonts/react";
import { createCanvasFontRuntime } from "@/shared/fonts/runtime";
import { CanvasFontSelect, CanvasFontStatus } from "./canvas-font-setting";

describe("Canvas font setting", () => {
  it("shows loading and retry inline while retaining the previous font", async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const runtime = createCanvasFontRuntime({ load });
    render(<CanvasFontProvider runtime={runtime}><CanvasFontSelect /><CanvasFontStatus /></CanvasFontProvider>);
    await waitFor(() => expect(runtime.getSnapshot().status).toBe("idle"));
    load.mockRejectedValueOnce(new Error("offline"));
    await act(() => runtime.select("fusion-mono"));
    expect(screen.getByRole("combobox", { name: "Canvas font" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Unavailable. Using Maple Mono.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(runtime.getSnapshot().font).toBe("fusion-mono"));
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    runtime.dispose();
  });
});
