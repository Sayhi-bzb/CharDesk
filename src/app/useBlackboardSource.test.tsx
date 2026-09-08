// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { CanvasRuntimeProvider } from "@/domains/canvas/public";
import { createApplicationEditorHost, type ApplicationEditorHost } from "./compositionRoot";
import { useBlackboardSource } from "./useBlackboardSource";

const hosts: ApplicationEditorHost[] = [];

const createHost = () => {
  const host = createApplicationEditorHost({
    initialSessions: [{
      id: "blackboard-source",
      name: "Blackboard",
      mode: "freeform",
      sourceBinding: { kind: "blackboard", provider: "local-reader", id: "local-reader" },
      scene: [],
      components: [],
      grid: [],
    }],
  });
  hosts.push(host);
  return host;
};

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await Promise.all(hosts.splice(0).map((host) => host.dispose()));
});

describe("Blackboard source projection", () => {
  it("projects a valid revision and leaves 304 responses inert", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("[31mA[0m", {
        status: 200,
        headers: {
          ETag: '"revision-1"',
          "X-CharDesk-Source-Name": "agent-board.chardesk",
        },
      }))
      .mockResolvedValue(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetchMock);
    const host = createHost();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CanvasRuntimeProvider runtime={host.canvas}>{children}</CanvasRuntimeProvider>
    );
    const { result } = renderHook(
      () => useBlackboardSource({ enabled: true }),
      { wrapper }
    );

    await act(async () => Promise.resolve());
    expect(result.current.status.state).toBe("current");
    expect(result.current.firstFitRevision).toBe(1);
    expect(host.canvas.getState().contentSurface.reader.materialize().get("0,0")).toMatchObject({
      char: "A",
      color: "#800000",
    });
    expect(host.canvas.getState().canvasSessions).toHaveLength(1);
    expect(host.canvas.getState().canvasSessions[0]?.name).toBe("agent-board");

    const reader = host.canvas.getState().contentSurface.reader;
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(host.canvas.getState().contentSurface.reader).toBe(reader);
  });

  it("keeps the last valid projection when the next revision is malformed", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("A", {
        status: 200,
        headers: { ETag: '"valid"' },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response("[999mbroken", {
        status: 200,
        headers: { ETag: '"broken"' },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const host = createHost();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CanvasRuntimeProvider runtime={host.canvas}>{children}</CanvasRuntimeProvider>
    );
    const { result } = renderHook(
      () => useBlackboardSource({ enabled: true }),
      { wrapper }
    );

    await act(async () => Promise.resolve());
    const reader = host.canvas.getState().contentSurface.reader;
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(result.current.status.state).toBe("warning");
    expect(host.canvas.getState().contentSurface.reader).toBe(reader);
    expect(host.canvas.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("A");
  });

  it("applies later valid revisions without resetting the viewport", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("A", {
        status: 200,
        headers: { ETag: '"first"' },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response("B", {
        status: 200,
        headers: { ETag: '"second"' },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const host = createHost();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CanvasRuntimeProvider runtime={host.canvas}>{children}</CanvasRuntimeProvider>
    );
    const { result } = renderHook(
      () => useBlackboardSource({ enabled: true }),
      { wrapper }
    );

    await act(async () => Promise.resolve());
    act(() => host.canvas.commands.viewport.setViewport(() => ({
      offset: { x: 123, y: 456 },
      zoom: 1.75,
    })));
    await act(async () => vi.advanceTimersByTimeAsync(500));

    expect(host.canvas.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("B");
    expect(host.canvas.getState().offset).toEqual({ x: 123, y: 456 });
    expect(host.canvas.getState().zoom).toBe(1.75);
    expect(result.current.firstFitRevision).toBe(1);
  });

  it("projects a local Reader deck and retains its active page", async () => {
    vi.useFakeTimers();
    const deck = (details: string) => [
      "---",
      "chardesk: document/v1",
      "mode: slide",
      "title: Reader Deck",
      "---",
      "## Opening",
      "",
      "```chargraph size=auto",
      "Opening",
      "```",
      "",
      "## Details",
      "",
      "```chargraph size=auto",
      details,
      "```",
    ].join("\n");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(deck("Details v1"), {
        status: 200,
        headers: { ETag: '"first"' },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(deck("Details v2"), {
        status: 200,
        headers: { ETag: '"second"' },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const host = createHost();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <CanvasRuntimeProvider runtime={host.canvas}>{children}</CanvasRuntimeProvider>
    );
    renderHook(() => useBlackboardSource({ enabled: true }), { wrapper });

    await act(async () => Promise.resolve());
    const initial = host.canvas.getState().canvasSessions[0];
    expect(initial).toMatchObject({
      mode: "slide",
      sourceBinding: { provider: "local-reader", id: "local-reader" },
    });
    if (initial?.mode !== "slide") throw new Error("Expected a Slide session");
    host.canvas.commands.slides.activate(initial.slideDeck.slides[1].id);

    await act(async () => vi.advanceTimersByTimeAsync(500));
    const current = host.canvas.getState().canvasSessions[0];
    if (current?.mode !== "slide") throw new Error("Expected a Slide session");
    expect(current.slideDeck.slides.find(
      ({ id }) => id === current.slideDeck.activeSlideId,
    )?.name).toBe("Details");
  });
});
