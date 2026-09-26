import { describe, expect, it, vi } from "vitest";
import { EditorRuntime } from "./runtime";
import { EditorStateNode } from "./stateNode";
import type { EditorExtension } from "./extension";

type TestState = { value: number };
type TestEvent = { type: "ping" };

const createRuntime = () => {
  const state: TestState = { value: 1 };
  const listeners = new Set<(next: TestState, previous: TestState) => void>();
  const undo = vi.fn(() => true);
  const redo = vi.fn(() => true);
  const runtime = new EditorRuntime<TestState, TestEvent>({
    state: {
      get: () => state,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    history: {
      undo,
      redo,
      beginCheckpoint: () => ({ commit: vi.fn(), cancel: vi.fn() }),
      finishCapture: vi.fn(),
    },
    transactions: { run: (fn) => fn() },
  });
  return { runtime, undo, redo };
};

class TestTool extends EditorStateNode<TestState, TestEvent> {
  events = 0;
  enters = 0;
  exits = 0;

  protected override onEnter() {
    this.enters += 1;
  }

  protected override onExit() {
    this.exits += 1;
  }

  protected override onEvent() {
    this.events += 1;
    return true;
  }
}

describe("EditorRuntime", () => {
  it("registers commands and reports precondition failures", () => {
    const { runtime } = createRuntime();
    runtime.registerExtension({
      id: "commands",
      commands: [
        {
          id: "increment",
          canExecute: (amount: unknown) => typeof amount === "number" && amount > 0,
          execute: (amount, context) => ({
            handled: true,
            status: "succeeded",
            data: context.state.value + (amount as number),
          }),
        },
      ],
    });

    expect(runtime.commands.execute("missing", undefined).status).toBe("unhandled");
    expect(runtime.commands.execute("increment", 0).status).toBe("rejected");
    expect(runtime.commands.execute("increment", 2)).toMatchObject({
      status: "succeeded",
      data: 3,
    });
  });

  it("rejects duplicate extension and command ids", () => {
    const { runtime } = createRuntime();
    const extension: EditorExtension<TestState, TestEvent> = {
      id: "one",
      commands: [
        {
          id: "same",
          execute: () => ({ handled: true, status: "succeeded" }),
        },
      ],
    };
    runtime.registerExtension(extension);
    expect(() => runtime.registerExtension(extension)).toThrow(/extension one/);
    expect(() =>
      runtime.registerExtension({ id: "two", commands: extension.commands })
    ).toThrow(/command same/);
  });

  it("records one owner and scope for each state surface", () => {
    const { runtime } = createRuntime();
    runtime.registerExtension({
      id: "state",
      stateScopes: [{ key: "canvas.content", scope: "document" }],
    });
    expect(runtime.scopes.get("canvas.content")).toEqual({
      key: "canvas.content",
      scope: "document",
      owner: "state",
    });
    expect(() =>
      runtime.registerExtension({
        id: "duplicate-state",
        stateScopes: [{ key: "canvas.content", scope: "session" }],
      })
    ).toThrow(/already owned by state/);
  });

  it("owns declarative keybindings through the extension lifecycle", () => {
    const { runtime } = createRuntime();
    runtime.registerExtension({
      id: "keybindings",
      keybindings: [{
        id: "command:increment",
        shortcuts: ["Shift+Mod+I"],
        target: { type: "command", id: "increment" },
      }],
    });
    expect(runtime.keymap.getBindings("command:increment")).toEqual([["Mod+Shift+I"]]);
    runtime.dispose();
    expect(runtime.keymap.getBindings("command:increment")).toBeUndefined();
  });

  it("routes events through active tools and disposes their lifecycle", () => {
    const { runtime } = createRuntime();
    let first!: TestTool;
    let second!: TestTool;
    runtime.registerExtension({
      id: "tools",
      tools: [
        {
          id: "first",
          create: (editor, parent) => (first = new TestTool(editor, "first", parent)),
        },
        {
          id: "second",
          create: (editor, parent) => (second = new TestTool(editor, "second", parent)),
        },
      ],
    });
    runtime.start("first");

    expect(runtime.getCurrentStatePath()).toBe("root.first");
    expect(runtime.dispatch({ type: "ping" })).toBe(true);
    expect(first.events).toBe(1);
    runtime.setCurrentTool("second");
    expect(first.exits).toBe(1);
    expect(second.enters).toBe(1);

    runtime.dispose();
    expect(second.exits).toBe(1);
  });

  it("runs manager and setup disposal in reverse order", () => {
    const { runtime } = createRuntime();
    const calls: string[] = [];
    runtime.registerExtension({
      id: "lifecycle",
      managers: [
        {
          id: "manager",
          create: () => {
            calls.push("manager:start");
            return { dispose: () => calls.push("manager:dispose") };
          },
        },
      ],
      setup: () => {
        calls.push("setup:start");
        return () => calls.push("setup:dispose");
      },
    });

    runtime.start();
    runtime.dispose();
    expect(calls).toEqual([
      "manager:start",
      "setup:start",
      "setup:dispose",
      "manager:dispose",
    ]);
  });
});
