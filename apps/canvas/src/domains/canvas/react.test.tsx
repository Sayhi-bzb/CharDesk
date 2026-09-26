// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Profiler } from "react";
import {
  CanvasRuntimeProvider,
  useCanvasPersistenceSelector,
  type CanvasPersistenceStatus,
} from "./public";
import { testingCanvasRuntime } from "./testing";

const readyStatus: CanvasPersistenceStatus = {
  phase: "ready",
  restore: { phase: "ready", reason: null, error: null, temporaryDirty: false },
  save: "saved",
  coordination: "coordinator",
  error: null,
};

describe("useCanvasPersistenceSelector", () => {
  it("does not rerender when an unrelated persistence field changes", () => {
    let status = readyStatus;
    const onRender = vi.fn();
    const listeners = new Set<() => void>();
    const runtime = {
      ...testingCanvasRuntime,
      getPersistenceSnapshot: () => status,
      subscribePersistence: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const Probe = () => {
      const coordination = useCanvasPersistenceSelector(
        (snapshot) => snapshot.coordination
      );
      return <span>{coordination}</span>;
    };

    render(
      <CanvasRuntimeProvider runtime={runtime}>
        <Profiler id="persistence-probe" onRender={onRender}>
          <Probe />
        </Profiler>
      </CanvasRuntimeProvider>
    );
    expect(onRender).toHaveBeenCalledTimes(1);

    act(() => {
      status = { ...status, save: "saving" };
      listeners.forEach((listener) => listener());
    });
    expect(onRender).toHaveBeenCalledTimes(1);

    act(() => {
      status = { ...status, coordination: "peer" };
      listeners.forEach((listener) => listener());
    });
    expect(screen.getByText("peer")).toBeInTheDocument();
    expect(onRender).toHaveBeenCalledTimes(2);
  });
});
