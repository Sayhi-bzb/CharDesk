import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCharDeskFontProfile } from "@chardesk/fonts";
import { useCellFontAudit } from "./browser-font-audit.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(document, "fonts"); });
const metrics = { cellWidth: 7.5, cellHeight: 15, baseline: 12.5, fontSize: 15, fontFamily: "Test" };
const setup = () => {
  let ascent = 13.75;
  const context = { font: "", textBaseline: "alphabetic", save: vi.fn(), restore: vi.fn(),
    measureText: vi.fn(() => ({ width: 7.5, fontBoundingBoxAscent: 16, fontBoundingBoxDescent: 4,
      actualBoundingBoxAscent: ascent, actualBoundingBoxDescent: 1.25 })) };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const fonts = Object.assign(new EventTarget(), { load: vi.fn(async () => []) });
  Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
  const profile = createCharDeskFontProfile({ id: "Test", display: { families: { regular: "Test" }, weightPolicy: "regular" } });
  return { context, fonts, profile, changeAscent: () => { ascent = 12; } };
};

describe("Probe-only font audit cache", () => {
  it("does no work while disabled", () => {
    const { context, fonts, profile } = setup();
    renderHook(() => useCellFontAudit(false, profile, metrics));
    expect(fonts.load).not.toHaveBeenCalled();
    expect(context.measureText).not.toHaveBeenCalled();
  });
  it("shares results, ignores rerenders and invalidates on font completion", async () => {
    const { context, fonts, profile, changeAscent } = setup();
    const a = renderHook(() => useCellFontAudit(true, profile, { ...metrics }));
    const b = renderHook(() => useCellFontAudit(true, profile, metrics));
    await waitFor(() => expect(a.result.current.status).toBe("ready"));
    expect(a.result.current).toBe(b.result.current);
    const count = context.measureText.mock.calls.length;
    a.rerender(); b.rerender();
    expect(context.measureText).toHaveBeenCalledTimes(count);
    changeAscent();
    act(() => fonts.dispatchEvent(new Event("loadingdone")));
    await waitFor(() => expect(a.result.current.report!.samples[0]!.top).toBe(0.5));
    expect(context.measureText.mock.calls.length).toBeGreaterThan(count);
  });
  it("separates explicit grids and recovers a failed load", async () => {
    const { fonts, profile } = setup();
    fonts.load.mockRejectedValueOnce(new Error("offline"));
    const a = renderHook(() => useCellFontAudit(true, profile, metrics));
    await waitFor(() => expect(a.result.current).toMatchObject({ status: "unavailable", reason: "font-load-failed" }));
    act(() => fonts.dispatchEvent(new Event("loadingdone")));
    await waitFor(() => expect(a.result.current.status).toBe("ready"));
    const b = renderHook(() => useCellFontAudit(true, profile, { ...metrics, cellHeight: 20 }));
    await waitFor(() => expect(b.result.current.status).toBe("ready"));
    expect(a.result.current.report!.metrics.cellHeight).toBe(15);
    expect(b.result.current.report!.metrics.cellHeight).toBe(20);
  });
  it("does not publish an old pending font into a newly selected Profile", async () => {
    const { fonts, profile } = setup();
    let release!: () => void;
    fonts.load.mockImplementationOnce(() => new Promise<never[]>((resolve) => { release = () => resolve([]); }));
    const view = renderHook(({ face }) => useCellFontAudit(true, face, metrics), { initialProps: { face: profile } });
    await waitFor(() => expect(fonts.load).toHaveBeenCalled());
    expect(view.result.current.status).toBe("loading");
    const next = createCharDeskFontProfile({ id: "Next", display: { families: { regular: "Next" } } });
    view.rerender({ face: next });
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    const snapshot = view.result.current;
    await act(async () => release());
    expect(view.result.current).toBe(snapshot);
    expect(snapshot.report!.samples[0]!.requestedFamily).toBe("Next");
  });
});
