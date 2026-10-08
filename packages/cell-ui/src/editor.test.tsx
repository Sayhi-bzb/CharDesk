import { describe, expect, it } from "vitest";
import { Box, CellUiRuntime, DragSource, DropTarget, FocusManager, Pane, ResizeHandle, Root, Split, Splitter, cellAnimationFrameAt, commandForInput, createCellSplitModel, createKeyInput, hitTestCell, resolveCellAnimationFramePolicy } from "./index.js";
import { resolvePointerAppearance } from "./pointer.js";

describe("Cell editor atoms", () => {
  it("keeps drag sources and drop targets as generic scene metadata", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 6 } });
    const frame = runtime.render(<Root><Split style={{ direction: "row", width: 16, height: 3 }}>
      <DragSource id="source" payload={{ type: "item", id: "a" }}><Box style={{ width: 4, height: 2 }} /></DragSource>
      <DropTarget id="target" accepts={["item"]}><Box style={{ width: 8, height: 2 }} /></DropTarget>
    </Split></Root>);
    expect(frame.tree.nodes.get("source")?.drag?.payload).toEqual({ type: "item", id: "a" });
    expect(frame.tree.nodes.get("target")?.drop?.accepts).toEqual(["item"]);
    runtime.dispose();
  });
  it("clamps and resizes adjacent panes in Cell units", () => {
    const model = createCellSplitModel([
      { size: 20, minSize: 10, maxSize: 40 },
      { size: 30, minSize: 10, maxSize: 50 },
    ]);
    expect(model.resize(0, 8)).toEqual([28, 22]);
    expect(model.resize(0, 40)).toEqual([40, 10]);
    expect(model.collapse(0)).toEqual([10, 10]);
  });

  it("uses deterministic animation frames and reduced motion policy", () => {
    expect(resolveCellAnimationFramePolicy({ fps: 30 })).toEqual({ fps: 30, reducedMotion: false });
    expect(cellAnimationFrameAt(1200, 30)).toBe(36);
    expect(cellAnimationFrameAt(-1, 30)).toBe(0);
  });

  it("reverses pointer-axis keyboard values for right-side panes", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 4 } });
    const frame = runtime.render(<Root><Splitter orientation="vertical"><ResizeHandle id="inspector" label="Resize inspector" resize={{ value: 6, min: 2, max: 10, direction: "reverse" }} /></Splitter></Root>);
    const focus = new FocusManager();
    focus.sync(frame.tree, "inspector");
    expect(commandForInput(createKeyInput({ key: "ArrowRight" }), frame, focus)).toEqual({ type: "set-value", targetId: "inspector", value: 5 });
    expect(commandForInput(createKeyInput({ key: "ArrowLeft" }), frame, focus)).toEqual({ type: "set-value", targetId: "inspector", value: 7 });
    runtime.dispose();
  });

  it("uses the full splitter line as the ResizeHandle hover target", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 8 } });
    const frame = runtime.render(<Root><Split style={{ direction: "row", width: 18, height: 6 }}>
      <Pane style={{ width: 6, height: 6 }} />
      <Splitter orientation="vertical" style={{ height: 6 }}>
        <ResizeHandle id="resize" label="Resize" resize={{ value: 6, min: 2, max: 12 }} />
      </Splitter>
      <Pane style={{ flexGrow: 1, height: 6 }} />
    </Split></Root>);
    const splitter = frame.scene.entries.get("resize")!;
    expect(hitTestCell(frame.scene, { x: splitter.hitBounds.x, y: 0 })?.ownerId).toBe("resize");
    expect(resolvePointerAppearance(frame, { x: splitter.hitBounds.x, y: 0 })).toEqual({ hoveredId: "resize", cursor: "pointer" });
    runtime.dispose();
  });

  it("joins splitter endpoints to a bordered surface", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 7 } });
    const frame = runtime.render(<Root><Box frame="bordered" borderShape="rounded" style={{ width: 10, height: 5 }}>
      <Split orientation="horizontal" style={{ width: 8, height: 3 }}>
        <Pane style={{ width: 3, height: 3 }} />
        <Splitter orientation="vertical" />
        <Pane style={{ flexGrow: 1, height: 3 }} />
      </Split>
    </Box></Root>);
    expect(frame.buffer.toText({ trimEnd: true })).toContain("┬");
    expect(frame.buffer.toText({ trimEnd: true })).toContain("┴");
    runtime.dispose();
  });

  it("repaints derived splitter topology without retaining old drag positions", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 16, height: 8 } });
    const view = (size: number) => <Root><Box frame="bordered" borderShape="rounded" style={{ width: 14, height: 6 }}>
      <Split orientation="horizontal" style={{ width: 12, height: 4 }}>
        <Pane style={{ width: size, height: 4 }} />
        <Splitter id="resize" label="Resize" orientation="vertical" resize={{ value: size, min: 2, max: 8 }} />
        <Pane style={{ flexGrow: 1, height: 4 }} />
      </Split>
    </Box></Root>;
    runtime.render(view(4));
    const moved = runtime.render(view(7), { manipulatingIds: new Set(["resize"]) });
    const text = moved.buffer.toText({ trimEnd: true });
    expect((text.match(/┬/gu) ?? []).length).toBe(1);
    expect((text.match(/┴/gu) ?? []).length).toBe(1);
    expect((text.match(/█/gu) ?? []).length).toBe(1);
    const released = runtime.render(view(7), { hoveredId: "resize", focusedId: "resize", focusVisible: true });
    expect(released.buffer.toText()).toContain("█");
    runtime.dispose();
  });

  it("keeps nested split connectors scoped to their split surface", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 42, height: 17 } });
    const frame = runtime.render(<Root><Box frame="bordered" borderShape="rounded" style={{ width: 38, height: 13 }}>
      <Split orientation="horizontal" style={{ width: 36, height: 11 }}>
        <Pane style={{ width: 14, height: 11 }} />
        <Splitter id="vertical" label="Resize" orientation="vertical" resize={{ value: 14, min: 6, max: 28 }} style={{ height: 11 }} />
        <Pane style={{ flexGrow: 1, height: 11 }}>
          <Split orientation="vertical" style={{ width: "100%", height: 11 }}>
            <Pane style={{ width: "100%", height: 3 }} />
            <Splitter id="horizontal" label="Resize" orientation="horizontal" resize={{ value: 3, min: 2, max: 8 }} style={{ width: "100%" }} />
            <Pane style={{ width: "100%", flexGrow: 1 }} />
          </Split>
        </Pane>
      </Split>
    </Box></Root>);
    const text = frame.buffer.toText({ trimEnd: true });
    expect((text.match(/┬/gu) ?? []).length).toBe(1);
    expect((text.match(/┴/gu) ?? []).length).toBe(1);
    expect((text.match(/├/gu) ?? []).length).toBe(1);
    expect((text.match(/┤/gu) ?? []).length).toBe(1);
    expect(text.split("\n")[4]).toBe("│              ├─────────────────────┤");
    runtime.dispose();
  });

  it("matches a fresh scene through nested resize and reverse resize", () => {
    const viewport = { width: 42, height: 17 };
    const runtime = new CellUiRuntime({ viewport });
    const view = (left: number, top: number) => <Root><Box frame="bordered" borderShape="rounded" style={{ width: 38, height: 13 }}>
      <Split orientation="horizontal" style={{ width: 36, height: 11 }}>
        <Pane style={{ width: left, height: 11 }} />
        <Splitter id="vertical-line" orientation="vertical" style={{ height: 11 }}>
          <ResizeHandle id="vertical" label="Resize left pane" resize={{ value: left, min: 6, max: 28 }} />
        </Splitter>
        <Pane style={{ flexGrow: 1, height: 11 }}><Split orientation="vertical" style={{ width: "100%", height: 11 }}>
          <Pane style={{ width: "100%", height: top }} />
          <Splitter id="horizontal-line" orientation="horizontal" style={{ width: "100%" }}>
            <ResizeHandle id="horizontal" label="Resize upper pane" resize={{ value: top, min: 2, max: 8 }} />
          </Splitter>
          <Pane style={{ width: "100%", flexGrow: 1 }} />
        </Split></Pane>
      </Split>
    </Box></Root>;
    for (const [left, top, active] of [[14, 3, null], [15, 3, "vertical"], [19, 3, "vertical"],
      [12, 3, "vertical"], [12, 3, null], [12, 6, "horizontal"], [12, 2, "horizontal"], [12, 2, null]] as const) {
      const state = { manipulatingIds: new Set(active ? [active] : []) };
      const frame = runtime.render(view(left, top), state);
      const fresh = new CellUiRuntime({ viewport });
      expect(frame.buffer.toText()).toBe(fresh.render(view(left, top), state).buffer.toText());
      if (active === "vertical") {
        const handle = frame.scene.entries.get("vertical")!.layoutBounds;
        expect(frame.buffer.get(handle.x, handle.y)?.text).toBe("█");
      }
      if (active === "horizontal") {
        const handle = frame.scene.entries.get("horizontal")!.layoutBounds;
        expect(handle.width).toBe(2);
        expect(frame.buffer.get(handle.x, handle.y)?.text).toBe("━");
        expect(frame.buffer.get(handle.x + 1, handle.y)?.text).toBe("━");
      }
      expect(frame.buffer.toText().match(/┬/gu)?.length).toBe(1);
      expect(frame.buffer.toText().match(/┴/gu)?.length).toBe(1);
      expect(frame.buffer.toText().split("\n")[top + 1]).toContain("├");
      expect(frame.scene.entries.get("vertical")?.layoutBounds).toMatchObject({ width: 1, height: 1 });
      expect(frame.scene.entries.get("horizontal")?.layoutBounds).toMatchObject({ width: 2, height: 1 });
      fresh.dispose();
    }
    runtime.dispose();
  });

  it("composes a four-way splitter intersection as a cross junction", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 8 } });
    const frame = runtime.render(<Root><Box frame="bordered" style={{ width: 10, height: 6 }}>
      <Splitter id="vertical" label="Vertical" orientation="vertical" resize={{ value: 4, min: 1, max: 8 }} style={{ position: "absolute", left: 4, top: 0, height: 6 }} />
      <Splitter id="horizontal" label="Horizontal" orientation="horizontal" resize={{ value: 3, min: 1, max: 8 }} style={{ position: "absolute", left: 0, top: 3, width: 10 }} />
    </Box></Root>);
    expect(frame.buffer.toText({ trimEnd: true })).toContain("┼");
    runtime.dispose();
  });
});
