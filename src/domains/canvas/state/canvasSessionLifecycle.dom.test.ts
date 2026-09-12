import { afterEach, describe, expect, it } from "vitest";
import { createSelectionCommandFactory } from "@/domains/actions/public";
import type { CanvasImportSnapshot } from "@/domains/sessions/public";
import { createCanvasRuntime, type CanvasRuntime } from "../runtime";

const deferred = <Value,>() => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((next) => { resolve = next; });
  return { promise, resolve };
};

const snapshot = (char: string): CanvasImportSnapshot => ({
  mode: "freeform",
  grid: [["0,0", { char, color: "#111111" }]],
});

const selectionCommands = createSelectionCommandFactory({
  renderClipboardText: async () => ({
    kind: "spans",
    renderer: "raw",
    pipeline: [],
    rows: [],
    width: 0,
    height: 0,
    diagnostics: [],
  }),
});

describe("Canvas session lifecycle", () => {
  const runtimes: CanvasRuntime[] = [];

  afterEach(() => {
    runtimes.splice(0).forEach((runtime) => runtime.dispose());
  });

  const createRuntime = (
    parses: ReadonlyMap<string, Promise<CanvasImportSnapshot>>
  ) => {
    const runtime = createCanvasRuntime({
      persistence: false,
      selectionCommands,
      parseSessionSource: (raw) => parses.get(String(raw)) ?? Promise.resolve(snapshot("?")),
      initialSessions: [
        { id: "canvas-a", name: "A", mode: "freeform", grid: [] },
        { id: "canvas-b", name: "B", mode: "freeform", grid: [] },
      ],
    });
    runtimes.push(runtime);
    return runtime;
  };

  it("exposes a read-only Store surface", () => {
    const runtime = createRuntime(new Map());

    expect(runtime.store).toMatchObject({
      getState: expect.any(Function),
      getInitialState: expect.any(Function),
      subscribe: expect.any(Function),
    });
    expect("setState" in runtime.store).toBe(false);
  });

  it("imports a stale result without replacing the user's later navigation", async () => {
    const parse = deferred<CanvasImportSnapshot>();
    const runtime = createRuntime(new Map([["slow", parse.promise]]));
    const importing = runtime.commands.sessions.import("slow");

    expect(await runtime.commands.sessions.switch("canvas-b")).toBe(true);
    parse.resolve(snapshot("I"));
    const imported = await importing;

    expect(runtime.getState().activeCanvasId).toBe("canvas-b");
    expect(runtime.documents.getActiveDocumentId()).toBe("canvas-b");
    expect(runtime.getState().canvasSessions).toContainEqual(imported);
    expect(runtime.documents.getContentReader(imported.id)?.get({ x: 0, y: 0 })?.char)
      .toBe("I");
  });

  it("creates concurrent imports but activates only the latest intent", async () => {
    const firstParse = deferred<CanvasImportSnapshot>();
    const secondParse = deferred<CanvasImportSnapshot>();
    const runtime = createRuntime(new Map([
      ["first", firstParse.promise],
      ["second", secondParse.promise],
    ]));
    const firstImport = runtime.commands.sessions.import("first", { name: "First" });
    const secondImport = runtime.commands.sessions.import("second", { name: "Second" });

    firstParse.resolve(snapshot("1"));
    const first = await firstImport;
    secondParse.resolve(snapshot("2"));
    const second = await secondImport;

    expect(runtime.getState().canvasSessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first.id, name: "First" }),
      expect.objectContaining({ id: second.id, name: "Second" }),
    ]));
    expect(runtime.getState().activeCanvasId).toBe(second.id);
  });

  it("reserves one surviving Canvas across concurrent deletions", async () => {
    const runtime = createRuntime(new Map());

    const first = runtime.commands.sessions.remove("canvas-a");
    const second = runtime.commands.sessions.remove("canvas-b");

    expect(await Promise.all([first, second])).toEqual([true, false]);
    expect(runtime.getState().canvasSessions).toHaveLength(1);
  });
});
