// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import {
  CanvasRuntimeProvider,
  type CanvasPersistenceStatus,
} from "@/domains/canvas/public";
import { setUiLanguage } from "@/shared/i18n";
import { EditorChromeProvider } from "@/widgets/editor-chrome/public";
import { createApplicationEditorHost } from "./compositionRoot";
import { CanvasStartupBoundary } from "./CanvasStartupBoundary";

const readyStatus: CanvasPersistenceStatus = {
  phase: "ready",
  restore: { phase: "ready", reason: null, error: null, temporaryDirty: false },
  save: "saved",
  coordination: "coordinator",
  error: null,
};

function createPersistenceHarness(initial: CanvasPersistenceStatus) {
  const host = createApplicationEditorHost();
  let status = initial;
  const listeners = new Set<() => void>();
  const retryRestore = vi.fn(async () => true);
  const runtime = Object.assign(Object.create(host.canvas), {
    getPersistenceSnapshot: () => status,
    subscribePersistence: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    retryRestore,
  });
  return {
    host,
    retryRestore,
    runtime,
    setStatus(next: CanvasPersistenceStatus) {
      status = next;
      listeners.forEach((listener) => listener());
    },
  };
}

function renderBoundary(
  runtime: ReturnType<typeof createPersistenceHarness>["runtime"],
  children: ReactNode = <div data-testid="workspace">Workspace</div>
) {
  return render(
    <CanvasRuntimeProvider runtime={runtime}>
      <EditorChromeProvider>
        <CanvasStartupBoundary>{children}</CanvasStartupBoundary>
      </EditorChromeProvider>
    </CanvasRuntimeProvider>
  );
}

describe("CanvasStartupBoundary", () => {
  beforeEach(() => {
    setUiLanguage("en");
  });

  it("keeps the shared startup screen during restore", () => {
    const harness = createPersistenceHarness({
      ...readyStatus,
      phase: "restoring",
      restore: {
        phase: "initializing",
        reason: null,
        error: null,
        temporaryDirty: false,
      },
    });
    renderBoundary(harness.runtime);

    expect(screen.getByRole("main")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(screen.getByRole("main")).toHaveAttribute("data-startup-phase", "restoring");
    expect(screen.queryByTestId("workspace")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Restoring workspace");

    harness.host.canvas.dispose();
  });

  it("mounts the workspace after restore becomes ready", () => {
    const harness = createPersistenceHarness({
      ...readyStatus,
      phase: "restoring",
      restore: {
        phase: "initializing",
        reason: null,
        error: null,
        temporaryDirty: false,
      },
    });
    renderBoundary(harness.runtime);

    act(() => harness.setStatus(readyStatus));
    expect(screen.getByTestId("workspace")).toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();

    harness.host.canvas.dispose();
  });

  it("keeps a temporary workspace usable and offers an in-place retry", () => {
    const harness = createPersistenceHarness({
      ...readyStatus,
      phase: "degraded",
      restore: {
        phase: "temporary",
        reason: "storage-unavailable",
        error: "IndexedDB unavailable",
        temporaryDirty: true,
      },
    });
    renderBoundary(harness.runtime);

    expect(screen.getByTestId("workspace")).toBeInTheDocument();
    expect(screen.getByTestId("temporary-canvas-alert")).toHaveTextContent(
      "Temporary canvas"
    );
    expect(screen.getByTestId("workspace").parentElement).not.toHaveAttribute(
      "inert"
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(harness.retryRestore).toHaveBeenCalledOnce();

    harness.host.canvas.dispose();
  });

  it("explains how to unblock a workspace database upgrade", () => {
    const harness = createPersistenceHarness({
      ...readyStatus,
      phase: "degraded",
      restore: {
        phase: "temporary",
        reason: "upgrade-blocked",
        error: "Canvas catalog upgrade is blocked by another tab",
        temporaryDirty: false,
      },
    });
    renderBoundary(harness.runtime);

    expect(screen.getByTestId("temporary-canvas-alert")).toHaveTextContent(
      "Close other CharDesk tabs"
    );
    expect(screen.getByTestId("temporary-canvas-alert")).toHaveTextContent(
      "Your saved canvases are unchanged"
    );

    harness.host.canvas.dispose();
  });

  it("freezes rather than unmounts the workspace while retrying", () => {
    const harness = createPersistenceHarness({
      ...readyStatus,
      phase: "degraded",
      restore: {
        phase: "retrying",
        reason: null,
        error: "IndexedDB unavailable",
        temporaryDirty: true,
      },
    });
    renderBoundary(harness.runtime);

    expect(screen.getByTestId("workspace")).toBeInTheDocument();
    expect(screen.getByTestId("workspace").parentElement).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Restoring" })).toBeDisabled();

    harness.host.canvas.dispose();
  });

});
