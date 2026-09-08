// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import {
  BlackboardRuntimeProvider,
  IndexedDbBlackboardRepository,
} from "@/domains/blackboard/public";
import { CanvasRuntimeProvider } from "@/domains/canvas/public";
import { createApplicationEditorHost } from "./compositionRoot";
import { useBlackboardWorkspace } from "./useBlackboardWorkspace";

const manifest = `chardesk: blackboard/v1
title: Agent Board
panels:
  main:
    source: panels/main.panel
layout:
  areas:
    - [main]
`;

const slideManifest = `chardesk: blackboard/v2
mode: slide
title: Agent Deck
panels:
  opening:
    source: panels/opening.panel
  details:
    source: panels/details.panel
    title: Details
layout:
  pages:
    - opening
    - details
`;

describe("Blackboard workspace projection", () => {
  const disposals: Array<() => Promise<void>> = [];
  afterEach(async () => {
    window.history.replaceState(null, "", "/");
    await Promise.all(disposals.splice(0).map((dispose) => dispose()));
  });

  it("projects source revisions and keeps the last valid surface on failure", async () => {
    const repository = new IndexedDbBlackboardRepository({
      databaseName: `workspace-hook-${crypto.randomUUID()}`,
    });
    const created = await repository.createWorkspace({ id: "board" });
    await repository.apply("board", [
      ...created.files.map(({ path }) => ({ op: "delete" as const, path })),
      { op: "write", path: "blackboard.yaml", content: manifest },
      { op: "write", path: "panels/main.panel", content: "A" },
    ], created.workspace.revision);
    const host = createApplicationEditorHost({
      blackboardRepository: repository,
      initialSessions: [{
        id: "canvas-board",
        name: "Board",
        mode: "freeform",
        sourceBinding: { kind: "blackboard", provider: "browser-workspace", id: "board" },
        scene: [],
        components: [],
        grid: [],
      }],
    });
    disposals.push(async () => {
      await host.dispose();
      await repository.close();
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BlackboardRuntimeProvider runtime={host.blackboard}>
        <CanvasRuntimeProvider runtime={host.canvas}>{children}</CanvasRuntimeProvider>
      </BlackboardRuntimeProvider>
    );
    const { result } = renderHook(() => useBlackboardWorkspace(), { wrapper });

    await waitFor(() => expect(result.current.status.state).toBe("current"));
    expect(host.canvas.getState().canvasMode).toBe("freeform");
    expect(host.canvas.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("A");
    expect(host.canvas.getState().canvasSessions[0]).toMatchObject({
      mode: "freeform",
      sourceBinding: { kind: "blackboard", provider: "browser-workspace", id: "board" },
      grid: [],
    });
    const validReader = host.canvas.getState().contentSurface.reader;

    await repository.apply("board", [
      { op: "write", path: "blackboard.yaml", content: "invalid" },
    ]);
    await waitFor(() => expect(result.current.status.state).toBe("warning"));
    expect(host.canvas.getState().contentSurface.reader).toBe(validReader);
  });

  it("releases the Blackboard route after switching to an editable Canvas", async () => {
    const repository = new IndexedDbBlackboardRepository({
      databaseName: `workspace-route-${crypto.randomUUID()}`,
    });
    const created = await repository.createWorkspace({ id: "board-route" });
    await repository.apply("board-route", [
      ...created.files.map(({ path }) => ({ op: "delete" as const, path })),
      { op: "write", path: "blackboard.yaml", content: manifest },
      { op: "write", path: "panels/main.panel", content: "Board" },
    ], created.workspace.revision);
    const host = createApplicationEditorHost({
      blackboardRepository: repository,
      initialSessions: [
        {
          id: "canvas-board-route",
          name: "Board",
          mode: "freeform",
          sourceBinding: { kind: "blackboard", provider: "browser-workspace", id: "board-route" },
          scene: [],
          components: [],
          grid: [],
        },
        {
          id: "canvas-editable",
          name: "Editable",
          mode: "freeform",
          scene: [],
          components: [],
          grid: [],
        },
      ],
    });
    disposals.push(async () => {
      await host.dispose();
      await repository.close();
    });
    window.history.replaceState(
      null,
      "",
      "/blackboard?workspace=board-route&canvas-stress=1",
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BlackboardRuntimeProvider runtime={host.blackboard}>
        <CanvasRuntimeProvider runtime={host.canvas}>{children}</CanvasRuntimeProvider>
      </BlackboardRuntimeProvider>
    );
    const { result } = renderHook(() => useBlackboardWorkspace(), { wrapper });

    await waitFor(() => expect(result.current.status.state).toBe("current"));
    expect(window.location.pathname).toBe("/blackboard");
    await host.canvas.commands.sessions.switch("canvas-editable");

    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(window.location.search).toBe("?canvas-stress=1");
  });

  it("projects ordered Panels as auto-sized Slides and retains the active page", async () => {
    const repository = new IndexedDbBlackboardRepository({
      databaseName: `workspace-slide-${crypto.randomUUID()}`,
    });
    const created = await repository.createWorkspace({ id: "deck" });
    await repository.apply("deck", [
      ...created.files.map(({ path }) => ({ op: "delete" as const, path })),
      { op: "write", path: "blackboard.yaml", content: slideManifest },
      { op: "write", path: "panels/opening.panel", content: "Opening" },
      { op: "write", path: "panels/details.panel", content: "Details v1" },
    ], created.workspace.revision);
    const host = createApplicationEditorHost({
      blackboardRepository: repository,
      initialSessions: [{
        id: "canvas-deck",
        name: "Deck",
        mode: "freeform",
        sourceBinding: { kind: "blackboard", provider: "browser-workspace", id: "deck" },
        scene: [],
        components: [],
        grid: [],
      }],
    });
    disposals.push(async () => {
      await host.dispose();
      await repository.close();
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BlackboardRuntimeProvider runtime={host.blackboard}>
        <CanvasRuntimeProvider runtime={host.canvas}>{children}</CanvasRuntimeProvider>
      </BlackboardRuntimeProvider>
    );
    const { result } = renderHook(() => useBlackboardWorkspace(), { wrapper });

    await waitFor(() => expect(result.current.status.state).toBe("current"));
    const session = host.canvas.getState().canvasSessions[0];
    expect(session).toMatchObject({
      mode: "slide",
      sourceBinding: { provider: "browser-workspace", id: "deck" },
    });
    if (session?.mode !== "slide") throw new Error("Expected a Slide session");
    expect(session.slideDeck.slides.map(({ name }) => name)).toEqual([
      "opening",
      "Details",
    ]);
    expect(session.slideDeck.slides[0].size).not.toEqual({ columns: 100, rows: 27 });

    host.canvas.commands.slides.activate(session.slideDeck.slides[1].id);
    await repository.apply("deck", [
      { op: "write", path: "panels/details.panel", content: "Details v2" },
    ]);

    await waitFor(() => {
      const current = host.canvas.getState().canvasSessions[0];
      expect(current.mode).toBe("slide");
      if (current.mode !== "slide") return;
      const active = current.slideDeck.slides.find(
        ({ id }) => id === current.slideDeck.activeSlideId,
      );
      expect(active?.name).toBe("Details");
    });

    await repository.apply("deck", [
      { op: "write", path: "blackboard.yaml", content: manifest },
      { op: "write", path: "panels/main.panel", content: "Board again" },
    ]);
    await waitFor(() => {
      expect(host.canvas.getState().canvasSessions[0]).toMatchObject({
        mode: "freeform",
        sourceBinding: { provider: "browser-workspace", id: "deck" },
      });
      expect(host.canvas.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("B");
    });
  });
});
