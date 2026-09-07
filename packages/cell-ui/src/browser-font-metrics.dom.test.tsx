import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCharDeskFontProfile } from "@chardesk/fonts";
import { DEFAULT_CELL_UI_METRICS, loadCellFontMetrics, useCellFontMetrics } from "./browser-font-metrics.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(document, "fonts"); });
const profile = (family: string) => createCharDeskFontProfile({ id: family, display: { families: { regular: family } } });
const setup = () => {
  const fonts = Object.assign(new EventTarget(), { load: vi.fn(async () => []) });
  Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
  return { fonts };
};

describe("shared font metrics lifecycle", () => {
  it("publishes the complete default browser grid contract", () => {
    expect(DEFAULT_CELL_UI_METRICS).toMatchObject({
      cellWidth: 9, cellHeight: 20, baseline: 15, fontSize: 15,
    });
  });

  it("shares font readiness without changing the default grid", async () => {
    const { fonts } = setup();
    const face = profile("Shared");
    const first = renderHook(() => useCellFontMetrics(face));
    const second = renderHook(() => useCellFontMetrics(face));
    expect(first.result.current).toMatchObject({
      metrics: { cellWidth: 9, cellHeight: 20, baseline: 15, fontSize: 15 },
      source: "default", ready: false,
    });
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    expect(fonts.load).toHaveBeenCalledOnce();
    expect(first.result.current).toBe(second.result.current);
    const ready = first.result.current;
    act(() => fonts.dispatchEvent(new Event("loadingdone")));
    expect(first.result.current).toBe(ready);
    first.unmount(); second.unmount();
    const remounted = renderHook(() => useCellFontMetrics(face));
    expect(remounted.result.current).toBe(ready);
  });

  it("an old pending face cannot overwrite the currently selected face", async () => {
    const { fonts } = setup();
    let release!: (faces: never[]) => void;
    fonts.load.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const a = profile("Slow");
    const b = profile("Current");
    const view = renderHook(({ face }) => useCellFontMetrics(face), { initialProps: { face: a } });
    await waitFor(() => expect(fonts.load).toHaveBeenCalledOnce());
    view.rerender({ face: b });
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    const current = view.result.current;
    await act(async () => release([]));
    expect(view.result.current).toBe(current);
    expect(current.metrics).toMatchObject({ cellWidth: 9, cellHeight: 20, baseline: 15 });
  });

  it("failed loads retain the stable grid and can be retried", async () => {
    const { fonts } = setup();
    const face = profile("Retry");
    fonts.load.mockRejectedValueOnce(new Error("offline"));
    await expect(loadCellFontMetrics(face)).rejects.toThrow("offline");
    await expect(loadCellFontMetrics(face)).resolves.toMatchObject({ cellWidth: 9, cellHeight: 20, baseline: 15 });
    expect(fonts.load).toHaveBeenCalledTimes(2);
  });

  it("explicit metrics skip measurement and font loading", () => {
    const { fonts } = setup();
    const metrics = { cellWidth: 7, cellHeight: 17, fontSize: 13, fontFamily: "Explicit" };
    const view = renderHook(() => useCellFontMetrics(profile("Unused"), 15, metrics));
    expect(view.result.current).toEqual({ metrics, source: "explicit", ready: true });
    expect(fonts.load).not.toHaveBeenCalled();
  });

  it("scales the default grid synchronously with an explicit font size", async () => {
    setup();
    const view = renderHook(() => useCellFontMetrics(profile("Scaled"), 30));
    expect(view.result.current).toMatchObject({
      metrics: { cellWidth: 18, cellHeight: 40, baseline: 30, fontSize: 30 },
      source: "default",
    });
  });

  it("recovers a failed initial Surface load when fonts subsequently finish loading", async () => {
    const { fonts } = setup();
    const face = profile("Recovered");
    fonts.load.mockRejectedValueOnce(new Error("offline"));
    const view = renderHook(() => useCellFontMetrics(face));
    await act(async () => { await Promise.resolve(); });
    expect(view.result.current.ready).toBe(false);
    act(() => fonts.dispatchEvent(new Event("loadingdone")));
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    expect(fonts.load).toHaveBeenCalledTimes(2);
  });
});
