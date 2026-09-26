import { afterEach, describe, expect, it } from "vitest";
import { getStaticGridCursor, getStaticGridSelection } from "@/domains/selection/public";
import {
  createApplicationEditorHost,
  type ApplicationEditorHost,
} from "./compositionRoot";

const hosts: ApplicationEditorHost[] = [];
const createHost = () => {
  const host = createApplicationEditorHost();
  hosts.push(host);
  return host;
};

afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.dispose()));
});

describe("Canvas command commits", () => {
  it("exposes data only through EditorState", () => {
    const host = createHost();

    expect(
      Object.values(host.canvas.getState()).filter(
        (value) => typeof value === "function"
      )
    ).toEqual([]);
  });

  it("publishes session activation as one snapshot", () => {
    const host = createHost();
    const observed: ReturnType<typeof host.canvas.getState>[] = [];
    const unsubscribe = host.canvas.subscribe((state) => observed.push(state));

    host.canvas.commands.sessions.create("slide");
    unsubscribe();

    expect(observed).toHaveLength(1);
    expect(observed[0]!.canvasMode).toBe("slide");
    expect(observed[0]!.slideDeck).not.toBeNull();
    expect(observed[0]!.activeCanvasId).not.toBe("canvas-1");
  });

  it("publishes Slide page activation as one snapshot", () => {
    const host = createHost();
    host.canvas.commands.sessions.create("slide");
    const observed: ReturnType<typeof host.canvas.getState>[] = [];
    const unsubscribe = host.canvas.subscribe((state) => observed.push(state));

    host.canvas.commands.slides.add();
    unsubscribe();

    expect(observed).toHaveLength(1);
    expect(observed[0]!.slideDeck?.slides).toHaveLength(2);
    expect(observed[0]!.interaction.staticGrid.mode).toBe("navigate");
  });

  it("publishes text content, cursor, and history as one snapshot", () => {
    const host = createHost();
    host.canvas.commands.grid.replace([]);
    host.canvas.commands.staticGrid.enterTextEdit({ x: 0, y: 0 });
    const observed: ReturnType<typeof host.canvas.getState>[] = [];
    const unsubscribe = host.canvas.subscribe((state) => observed.push(state));

    host.canvas.commands.text.write("A");
    unsubscribe();

    expect(observed).toHaveLength(1);
    expect(observed[0]!.contentSurface.reader.materialize().get("0,0")?.char).toBe("A");
    expect(getStaticGridCursor(observed[0]!.interaction.staticGrid)).toEqual({ x: 1, y: 0 });
    expect(observed[0]!.canUndo).toBe(true);
  });

  it("shares pending interaction state between nested commands", () => {
    const host = createHost();
    host.canvas.commands.grid.replace([]);
    host.canvas.commands.staticGrid.enterTextEdit({ x: 0, y: 0 });
    const observed: ReturnType<typeof host.canvas.getState>[] = [];
    const unsubscribe = host.canvas.subscribe((state) => observed.push(state));

    host.canvas.commands.history.transact(() => {
      host.canvas.commands.text.write("A");
      expect(getStaticGridCursor(host.canvas.getState().interaction.staticGrid)).toEqual({
        x: 1,
        y: 0,
      });
      expect(
        host.canvas.getState().contentSurface.reader.materialize().get("0,0")?.char
      ).toBe("A");
      host.canvas.commands.text.write("B");
    });
    unsubscribe();

    expect(observed).toHaveLength(1);
    expect(
      [...observed[0]!.contentSurface.reader.materialize().values()]
        .map((cell) => cell.char)
        .join("")
    ).toBe("AB");
    expect(getStaticGridCursor(observed[0]!.interaction.staticGrid)).toEqual({ x: 2, y: 0 });

    host.canvas.commands.history.undo();
    expect(host.canvas.getState().contentSurface.reader.materialize()).toEqual(new Map());
  });

  it("keeps history-none writes outside undo history", () => {
    const host = createHost();
    host.canvas.commands.grid.replace([]);
    host.canvas.commands.staticGrid.enterTextEdit({ x: 0, y: 0 });

    host.canvas.commands.history.transact(() => {
      host.canvas.commands.text.write("A");
    }, "none");

    expect(host.canvas.getState().canUndo).toBe(false);
    expect(host.canvas.commands.history.undo()).toBe(false);
    expect(host.canvas.getState().contentSurface.reader.materialize().get("0,0")?.char).toBe("A");
  });

  it("publishes deletion and its next active Cell together", () => {
    const host = createHost();
    host.canvas.commands.grid.replace([
      ["0,0", { char: "A", color: "#fff" }],
      ["1,0", { char: "B", color: "#fff" }],
    ]);
    host.canvas.commands.staticGrid.setActiveCell({ x: 1, y: 0 });
    const observed: ReturnType<typeof host.canvas.getState>[] = [];
    const unsubscribe = host.canvas.subscribe((state) => observed.push(state));

    host.canvas.commands.staticGrid.delete("backward");
    unsubscribe();

    expect(observed).toHaveLength(1);
    expect(observed[0]!.contentSurface.reader.materialize().has("0,0")).toBe(false);
    expect(
      getStaticGridSelection(observed[0]!.interaction.staticGrid).activeCell
    ).toEqual({ x: 0, y: 0 });
  });

  it("publishes undo content and availability together", () => {
    const host = createHost();
    host.canvas.commands.grid.replace([]);
    host.canvas.commands.staticGrid.enterTextEdit({ x: 0, y: 0 });
    host.canvas.commands.text.write("A");
    const observed: ReturnType<typeof host.canvas.getState>[] = [];
    const unsubscribe = host.canvas.subscribe((state) => observed.push(state));

    host.canvas.commands.history.undo();
    unsubscribe();

    expect(observed).toHaveLength(1);
    expect(observed[0]!.contentSurface.reader.materialize()).toEqual(new Map());
    expect(observed[0]!.canUndo).toBe(false);
    expect(observed[0]!.canRedo).toBe(true);
  });

  it("publishes replacement content and reset history together", () => {
    const host = createHost();
    host.canvas.commands.grid.replace([]);
    host.canvas.commands.staticGrid.enterTextEdit({ x: 0, y: 0 });
    host.canvas.commands.text.write("A");
    const observed: ReturnType<typeof host.canvas.getState>[] = [];
    const unsubscribe = host.canvas.subscribe((state) => observed.push(state));

    host.canvas.commands.grid.replace([
      ["2,0", { char: "R", color: "#fff" }],
    ]);
    unsubscribe();

    expect(observed).toHaveLength(1);
    expect(observed[0]!.contentSurface.reader.materialize()).toEqual(new Map([
      ["2,0", { char: "R", color: "#fff" }],
    ]));
    expect(observed[0]!.canUndo).toBe(false);
  });

  it("publishes checkpoint rollback as one snapshot", () => {
    const host = createHost();
    host.canvas.commands.grid.replace([]);
    host.canvas.commands.staticGrid.enterTextEdit({ x: 0, y: 0 });
    const checkpoint = host.canvas.commands.history.beginCheckpoint();
    host.canvas.commands.text.write("A");
    const observed: ReturnType<typeof host.canvas.getState>[] = [];
    const unsubscribe = host.canvas.subscribe((state) => observed.push(state));

    checkpoint.cancel();
    unsubscribe();

    expect(observed).toHaveLength(1);
    expect(observed[0]!.contentSurface.reader.materialize()).toEqual(new Map());
    expect(observed[0]!.canUndo).toBe(false);
  });

  it("publishes scratch content and scratch cleanup together", () => {
    const host = createHost();
    host.canvas.commands.grid.replace([]);
    host.canvas.commands.grid.setScratchLayer([
      { x: 2, y: 1, char: "X", color: "#fff" },
    ]);
    const observed: ReturnType<typeof host.canvas.getState>[] = [];
    const unsubscribe = host.canvas.subscribe((state) => observed.push(state));

    host.canvas.commands.grid.commitScratch();
    unsubscribe();

    expect(observed).toHaveLength(1);
    expect(observed[0]!.contentSurface.reader.materialize().get("2,1")?.char).toBe("X");
    expect(observed[0]!.interaction.scratchLayer).toBeNull();
  });

  it("publishes moved content and selection together", () => {
    const host = createHost();
    host.canvas.commands.grid.replace([
      ["0,0", { char: "A", color: "#fff" }],
    ]);
    host.canvas.commands.staticGrid.setSelectionRange({
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
    });
    const observed: ReturnType<typeof host.canvas.getState>[] = [];
    const unsubscribe = host.canvas.subscribe((state) => observed.push(state));

    host.canvas.commands.selection.moveStaticRange({ x: 2, y: 0 });
    unsubscribe();

    expect(observed).toHaveLength(1);
    expect(observed[0]!.contentSurface.reader.materialize().get("2,0")?.char).toBe("A");
    expect(
      getStaticGridSelection(observed[0]!.interaction.staticGrid).primaryRange
    ).toEqual({ start: { x: 2, y: 0 }, end: { x: 2, y: 0 } });
  });

  it("publishes cleared content and reset interaction together", () => {
    const host = createHost();
    host.canvas.commands.grid.replace([
      ["0,0", { char: "A", color: "#fff" }],
    ]);
    host.canvas.commands.staticGrid.setActiveCell({ x: 3, y: 2 });
    const observed: ReturnType<typeof host.canvas.getState>[] = [];
    const unsubscribe = host.canvas.subscribe((state) => observed.push(state));

    host.canvas.commands.grid.clear();
    unsubscribe();

    expect(observed).toHaveLength(1);
    expect(observed[0]!.contentSurface.reader.materialize()).toEqual(new Map());
    expect(
      getStaticGridSelection(observed[0]!.interaction.staticGrid).activeCell
    ).toEqual({ x: 0, y: 0 });
  });
});
