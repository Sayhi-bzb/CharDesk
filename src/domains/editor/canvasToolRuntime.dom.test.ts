import { describe, expect, it, vi } from "vitest";
import { type CanvasState } from "@/domains/canvas/public";
import { getCanvasState } from "@/domains/canvas/testing";
import { EditorRuntime } from "./core/runtime";
import {
  CanvasInteractionPortBinding,
  type CanvasEditorInputEvent,
  type CanvasInteractionPort,
} from "./canvasToolRuntime";
import {
  createCanvasEditorExtension,
  createCanvasEditorRuntime,
} from "./runtime";

const createHarness = (initialTool: "select" | "brush" = "select") => {
  const binding = new CanvasInteractionPortBinding();
  const begin = vi.fn();
  const start = vi.fn((event: Extract<CanvasEditorInputEvent, { type: "canvas-drag-start" }>) => {
    if (event.button === 1) return { state: { type: "panning" as const, lastScreen: event.screenPoint } };
    if (initialTool === "brush") return { state: {
      type: "drawing" as const, tool: "brush" as const, start: event.gridPoint!,
      lastGrid: event.gridPoint!, lastPlacedGrid: event.gridPoint,
    } };
    return { state: { type: "selecting" as const, anchor: event.gridPoint!, current: event.gridPoint! } };
  });
  const update = vi.fn((state, event: Extract<CanvasEditorInputEvent, { type: "canvas-drag-update" }>) =>
    state.type === "selecting" && event.currentGrid
      ? { ...state, current: event.currentGrid }
      : state.type === "drawing" && event.currentGrid
        ? { ...state, lastGrid: event.currentGrid }
        : state
  );
  const complete = vi.fn();
  const cancel = vi.fn();
  const port: CanvasInteractionPort = {
    begin,
    start,
    update,
    complete,
    cancel,
  };
  binding.bind(port);

  const runtime = new EditorRuntime<CanvasState, CanvasEditorInputEvent>({
    state: {
      get: getCanvasState,
      subscribe: () => () => undefined,
    },
    history: {
      undo: () => false,
      redo: () => false,
      beginCheckpoint: () => ({ commit: vi.fn(), cancel: vi.fn() }),
      finishCapture: vi.fn(),
    },
    transactions: { run: (fn) => fn() },
  });
  runtime.registerExtension(createCanvasEditorExtension(binding)).start(initialTool);
  return { runtime, port };
};

describe("CanvasToolStateNode", () => {
  it("finalizes the current selection draft before a command reads it", () => {
    const runtime = createCanvasEditorRuntime({
      state: { get: getCanvasState, subscribe: () => () => undefined },
      history: {
        undo: () => false,
        redo: () => false,
        beginCheckpoint: () => ({ commit: vi.fn(), cancel: vi.fn() }),
        finishCapture: vi.fn(),
      },
      transactions: { run: <Result,>(fn: () => Result) => fn() },
    });
    const complete = vi.fn();
    runtime.interactionPort.bind({
      begin: vi.fn(),
      start: vi.fn((event) => ({
        state: {
          type: "selecting" as const,
          anchor: event.gridPoint!,
          current: event.gridPoint!,
        },
      })),
      update: vi.fn((state, event) =>
        state.type === "selecting" && event.currentGrid
          ? { ...state, current: event.currentGrid }
          : state
      ),
      complete,
      cancel: vi.fn(),
    });
    runtime.registerExtension(createCanvasEditorExtension(runtime.interactionPort)).start("select");
    runtime.dispatch({
      type: "canvas-drag-start",
      canvasMode: "freeform",
      button: 0,
      isCtrlOrMetaPressed: false,
      shiftKey: false,
      detail: 1,
      screenPoint: { x: 10, y: 20 },
      gridPoint: { x: 1, y: 2 },
      brushChar: "#",
    });
    runtime.dispatch({
      type: "canvas-drag-update",
      delta: { x: 3, y: 0 },
      currentGrid: { x: 4, y: 2 },
    });

    expect(runtime.finalizePendingSelection()).toBe(true);
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "selecting",
        anchor: { x: 1, y: 2 },
        current: { x: 4, y: 2 },
      }),
      { x: 4, y: 2 }
    );
    expect(runtime.getInteractionState().type).toBe("idle");
    expect(runtime.finalizePendingSelection()).toBe(false);
  });

  it("routes a shared runtime to the explicitly active interaction owner", () => {
    const binding = new CanvasInteractionPortBinding();
    const primary = {
      begin: vi.fn(),
      start: vi.fn(() => null),
      update: vi.fn((state) => state),
      complete: vi.fn(),
      cancel: vi.fn(),
    } satisfies CanvasInteractionPort;
    const secondary = {
      ...primary,
      begin: vi.fn(),
    } satisfies CanvasInteractionPort;
    const primaryRef = { current: primary };
    const secondaryRef = { current: secondary };

    const unregisterPrimary = binding.registerRef("primary", primaryRef);
    const unregisterSecondary = binding.registerRef("secondary", secondaryRef);

    expect(binding.get()).toBe(primary);
    expect(binding.activate("secondary")).toBe(true);
    expect(binding.get()).toBe(secondary);
    expect(binding.activate("missing")).toBe(false);
    expect(binding.get()).toBe(secondary);

    unregisterPrimary();
    expect(binding.get()).toBe(secondary);
    unregisterSecondary();
    expect(binding.get()).toBeNull();
  });

  it("cancels the previous owner before activating another pane", () => {
    const runtime = createCanvasEditorRuntime({
      state: { get: getCanvasState, subscribe: () => () => undefined },
      history: {
        undo: () => false,
        redo: () => false,
        beginCheckpoint: () => ({ commit: vi.fn(), cancel: vi.fn() }),
        finishCapture: vi.fn(),
      },
      transactions: { run: <Result,>(fn: () => Result) => fn() },
    });
    const primaryPort = {
      begin: vi.fn(),
      start: vi.fn(() => ({
        state: {
          type: "selecting" as const,
          anchor: { x: 1, y: 1 },
          current: { x: 1, y: 1 },
        },
      })),
      update: vi.fn((state) => state),
      complete: vi.fn(),
      cancel: vi.fn(),
    } satisfies CanvasInteractionPort;
    const secondaryPort = {
      ...primaryPort,
      start: vi.fn(() => null),
      cancel: vi.fn(),
    } satisfies CanvasInteractionPort;
    runtime.interactionPort.registerRef("primary", { current: primaryPort });
    runtime.interactionPort.registerRef("secondary", { current: secondaryPort });
    runtime.registerExtension(createCanvasEditorExtension(runtime.interactionPort)).start("select");
    runtime.dispatch({
      type: "canvas-drag-start",
      canvasMode: "freeform",
      button: 0,
      isCtrlOrMetaPressed: false,
      shiftKey: false,
      detail: 1,
      screenPoint: { x: 10, y: 20 },
      gridPoint: { x: 1, y: 1 },
      brushChar: "#",
    });

    expect(runtime.getInteractionState().type).toBe("selecting");
    expect(runtime.activateInteractionOwner("secondary")).toBe(true);
    expect(primaryPort.cancel).toHaveBeenCalledOnce();
    expect(secondaryPort.cancel).not.toHaveBeenCalled();
    expect(runtime.getInteractionState().type).toBe("idle");
    expect(runtime.interactionPort.isActive("secondary")).toBe(true);
  });

  it("creates isolated runtime interaction ports", () => {
    const ports = {
      state: { get: getCanvasState, subscribe: () => () => undefined },
      history: {
        undo: () => false,
        redo: () => false,
        beginCheckpoint: () => ({ commit: vi.fn(), cancel: vi.fn() }),
        finishCapture: vi.fn(),
      },
      transactions: { run: <Result,>(fn: () => Result) => fn() },
    };
    const first = createCanvasEditorRuntime(ports);
    const second = createCanvasEditorRuntime(ports);
    const firstPort: CanvasInteractionPort = {
      begin: vi.fn(),
      start: vi.fn(() => ({
        state: { type: "selecting" as const, anchor: { x: 1, y: 1 }, current: { x: 1, y: 1 } },
      })),
      update: vi.fn((state) => state),
      complete: vi.fn(),
      cancel: vi.fn(),
    };
    const secondPort: CanvasInteractionPort = {
      ...firstPort,
      start: vi.fn(() => ({
        state: { type: "panning" as const, lastScreen: { x: 10, y: 20 } },
      })),
    };
    first.interactionPort.bind(firstPort);
    second.interactionPort.bind(secondPort);
    first.registerExtension(createCanvasEditorExtension(first.interactionPort)).start("select");
    second.registerExtension(createCanvasEditorExtension(second.interactionPort)).start("select");

    const event: CanvasEditorInputEvent = {
      type: "canvas-drag-start",
      canvasMode: "freeform",
      button: 0,
      isCtrlOrMetaPressed: false,
      shiftKey: false,
      detail: 1,
      screenPoint: { x: 10, y: 20 },
      gridPoint: { x: 1, y: 1 },
      brushChar: "#",
    };
    first.dispatch(event);
    second.dispatch(event);

    expect(first.interactionPort).not.toBe(second.interactionPort);
    expect(first.getInteractionState().type).toBe("selecting");
    expect(second.getInteractionState().type).toBe("panning");
  });

  it("cancels an active interaction before navigating document history", () => {
    let baseCanUndo = false;
    const undo = vi.fn(() => true);
    const redo = vi.fn(() => true);
    const runtime = createCanvasEditorRuntime({
      state: {
        get: () => ({ ...getCanvasState(), canUndo: false, canRedo: false }),
        subscribe: () => () => undefined,
      },
      history: {
        canUndo: () => baseCanUndo,
        canRedo: () => false,
        undo,
        redo,
        beginCheckpoint: () => ({ commit: vi.fn(), cancel: vi.fn() }),
        finishCapture: vi.fn(),
      },
      transactions: { run: (fn) => fn() },
    });
    const cancel = vi.fn();
    runtime.interactionPort.bind({
      begin: vi.fn(),
      start: vi.fn(() => ({
        state: {
          type: "shapePreview" as const,
          tool: "line" as const,
          start: { x: 1, y: 1 },
          current: { x: 1, y: 1 },
          axis: "horizontal" as const,
        },
      })),
      update: vi.fn((state) => state),
      complete: vi.fn(),
      cancel,
    });
    runtime.registerExtension(createCanvasEditorExtension(runtime.interactionPort)).start("line");
    runtime.dispatch({
      type: "canvas-drag-start",
      canvasMode: "freeform",
      button: 0,
      isCtrlOrMetaPressed: false,
      shiftKey: false,
      detail: 1,
      screenPoint: { x: 10, y: 20 },
      gridPoint: { x: 1, y: 1 },
      brushChar: "#",
    });

    expect(runtime.history.canUndo?.()).toBe(true);
    expect(runtime.history.undo()).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(undo).not.toHaveBeenCalled();
    expect(runtime.getInteractionState().type).toBe("idle");

    baseCanUndo = true;
    expect(runtime.history.canUndo?.()).toBe(true);
    expect(runtime.history.undo()).toBe(true);
    expect(undo).toHaveBeenCalledOnce();

    runtime.dispatch({
      type: "canvas-drag-start",
      canvasMode: "freeform",
      button: 0,
      isCtrlOrMetaPressed: false,
      shiftKey: false,
      detail: 1,
      screenPoint: { x: 10, y: 20 },
      gridPoint: { x: 1, y: 1 },
      brushChar: "#",
    });
    expect(runtime.history.canRedo?.()).toBe(true);
    expect(runtime.history.redo()).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(redo).not.toHaveBeenCalled();
  });

  it("owns the select drag lifecycle and state path", () => {
    const { runtime, port } = createHarness();
    expect(
      runtime.dispatch({
        type: "canvas-drag-start",
        canvasMode: "freeform",
        button: 0,
        isCtrlOrMetaPressed: false,
        shiftKey: false,
        detail: 1,
        screenPoint: { x: 10, y: 20 },
        gridPoint: { x: 1, y: 2 },
        brushChar: "#",
      })
    ).toBe(true);
    expect(runtime.getCurrentStatePath()).toBe("root.select.selecting");
    expect(port.start).toHaveBeenCalledTimes(1);

    runtime.dispatch({
      type: "canvas-drag-update",
      delta: { x: 1, y: 1 },
      currentGrid: { x: 4, y: 5 },
    });
    expect(port.update).toHaveBeenCalledTimes(1);

    runtime.dispatch({
      type: "canvas-drag-end",
      button: 0,
      endGrid: { x: 4, y: 5 },
    });
    expect(port.complete).toHaveBeenCalledTimes(1);
    expect(runtime.getCurrentStatePath()).toBe("root.select.idle");
  });

  it("temporarily pans without changing the selected tool", () => {
    const { runtime, port } = createHarness("brush");
    runtime.dispatch({
      type: "canvas-drag-start",
      canvasMode: "freeform",
      button: 1,
      isCtrlOrMetaPressed: false,
      shiftKey: false,
      detail: 1,
      screenPoint: { x: 10, y: 20 },
      gridPoint: { x: 1, y: 2 },
      brushChar: "#",
    });
    expect(runtime.getCurrentToolId()).toBe("brush");
    expect(runtime.getCurrentStatePath()).toBe("root.brush.panning");

    runtime.dispatch({
      type: "canvas-drag-update",
      delta: { x: 3, y: -2 },
      currentGrid: null,
    });
    expect(port.update).toHaveBeenCalledTimes(1);
    runtime.dispatch({ type: "canvas-drag-end", button: 1, endGrid: null });
    expect(runtime.getCurrentStatePath()).toBe("root.brush.idle");
  });

  it("owns drawing progress and cancels exactly once on tool exit", () => {
    const { runtime, port } = createHarness("brush");
    runtime.dispatch({
      type: "canvas-drag-start",
      canvasMode: "freeform",
      button: 0,
      isCtrlOrMetaPressed: false,
      shiftKey: false,
      detail: 1,
      screenPoint: { x: 0, y: 0 },
      gridPoint: { x: 2, y: 3 },
      brushChar: "界",
    });
    expect(port.start).toHaveBeenCalledTimes(1);
    runtime.dispatch({
      type: "canvas-drag-update",
      delta: { x: 1, y: 0 },
      currentGrid: { x: 3, y: 3 },
    });
    expect(port.update).toHaveBeenCalledTimes(1);

    runtime.setCurrentTool("select");
    expect(port.cancel).toHaveBeenCalledTimes(1);
    expect(runtime.getCurrentStatePath()).toBe("root.select.idle");
    runtime.setCurrentTool("brush");
    expect(runtime.getCurrentStatePath()).toBe("root.brush.idle");
  });

});
