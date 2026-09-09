import { describe, expect, it, vi } from "vitest";
import {
  Box,
  CellTextEditor,
  CellUiRuntime,
  List,
  ListItem,
  Overlay,
  Root,
  ScrollArea,
  Text,
  TextArea,
  YogaLayoutEngine,
  getEventPath,
  hitTest,
  hitTestCell,
} from "./index.js";
import type { LayoutEngine } from "./layout.js";

const fileList = (order = ["index", "app", "layout", "theme"]) => (
  <Root id="root">
    <Box id="workspace">
      <List id="actions" style={{ height: 3 }}>
        <ListItem id="new"><Text id="new-label">New file</Text></ListItem>
        <ListItem id="open" focused selected><Text id="open-label">Open file</Text></ListItem>
        <ListItem id="save"><Text id="save-label">Save</Text></ListItem>
      </List>
      <ScrollArea id="files" style={{ border: true, height: 6 }}>
        <List id="file-list">
          {order.map((name, index) => (
            <ListItem id={`file-${name}`} key={name}>
              <Text id={`file-${name}-label`}>{`${String(index + 1).padStart(2, "0")}  src/${name}.ts`}</Text>
            </ListItem>
          ))}
        </List>
      </ScrollArea>
    </Box>
  </Root>
);

describe("CellUiRuntime", () => {
  it("does not make ordinary frames pay a composite-buffer copy", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 8, height: 2 } });
    const frame = runtime.render(<Root><Text>base</Text></Root>);

    expect(frame.overlayPlanes).toHaveLength(0);
    expect(frame.buffer).toBe(frame.baseBuffer);
    expect(frame.overlayBuffer.toText()).toBe("        \n        ");
    runtime.dispose();
  });

  it("requires the overlay viewport to contain the base viewport", () => {
    expect(() => new CellUiRuntime({
      viewport: { width: 8, height: 2 },
      overlayViewport: { width: 7, height: 2 },
    })).toThrow("overlay viewport must contain the base viewport");
    const runtime = new CellUiRuntime({ viewport: { width: 8, height: 2 } });
    expect(() => runtime.resize(
      { width: 8, height: 2 },
      { width: 8, height: 1 },
    )).toThrow("overlay viewport must contain the base viewport");
    runtime.dispose();
  });

  it("separates active logical focus from visible focus emphasis", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 30, height: 9 } });
    const keyboard = runtime.render(fileList(), { focusedId: "new" });
    expect(keyboard.tree.nodes.get("new")).toMatchObject({
      focused: true,
      focusActive: true,
      focusVisible: true,
    });

    const pointer = runtime.render(fileList(), {
      focusedId: "new",
      activeFocusId: "new",
      focusVisible: false,
      hoveredId: "new",
    });
    expect(pointer.tree.nodes.get("new")).toMatchObject({
      focused: true,
      focusActive: true,
      focusVisible: false,
    });
    expect(pointer.buffer.get(29, 0)?.style).toMatchObject({ backgroundColor: "#000000" });
    expect(pointer.buffer.get(29, 0)?.style.bold).not.toBe(true);

    const movedAway = runtime.render(fileList(), {
      focusedId: "new",
      activeFocusId: "new",
      focusVisible: false,
    });
    expect(movedAway.buffer.get(29, 0)?.style.backgroundColor).toBeUndefined();
    expect(movedAway.semantics.focusedId).toBe("new");
    runtime.dispose();
  });

  it("hover only repaints, retains semantic identity and clears when omitted", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 30, height: 9 } });
    const before = runtime.render(fileList(), { focusVisible: false });
    const hovered = runtime.render(fileList(), { hoveredId: "new", focusVisible: false });
    expect(hovered.layout).toBe(before.layout);
    expect(hovered.semantics.nodes).toBe(before.semantics.nodes);
    expect(hovered.invalidation.work.semantics).toBe("reused");
    expect(hovered.buffer.get(29, 0)?.style.backgroundColor).toBe("#000000");
    expect(hovered.buffer.get(0, 0)?.style.bold).not.toBe(true);
    const cleared = runtime.render(fileList());
    expect(cleared.buffer.get(29, 0)?.style.backgroundColor).toBeUndefined();
    runtime.dispose();
  });
  it("composes nested surface backgrounds without inheriting foreground or leaving Overlay residue", () => {
    const viewport = { width: 20, height: 8 };
    const runtime = new CellUiRuntime({ viewport });
    const view = (open: boolean, x: number, backgroundColor: string) => <Root>
      <Box id="base" style={{ width: 20, height: 8 }} textStyle={{ backgroundColor: "#112233", bold: true }}>
        <Text>Underneath</Text>
        {open && <Overlay id="overlay" position={{ x, y: 1 }} style={{ width: 14, height: 5, border: true }} textStyle={{ backgroundColor }}>
          <Text id="title" textStyle={{ color: "#abcdef" }}>Commands中</Text>
          <Box id="nested" style={{ height: 1 }} textStyle={{ backgroundColor: "#778899" }}><Text id="nested-text">Nested</Text></Box>
          <Text id="hint">Esc closes</Text>
        </Overlay>}
      </Box>
    </Root>;
    for (const [open, x, color] of [[true, 2, "#445566"], [true, 3, "#556677"], [false, 3, "#556677"]] as const) {
      const frame = runtime.render(view(open, x, color));
      if (open) {
        expect(frame.buffer.get(x + 1, 2)?.style).toEqual({ color: "#abcdef", backgroundColor: color });
        expect(frame.buffer.get(x + 1, 3)?.style.backgroundColor).toBe("#778899");
        expect(frame.buffer.get(x + 1, 4)?.style).toEqual({ backgroundColor: color });
      }
      const oracle = new CellUiRuntime({ viewport });
      const fresh = oracle.render(view(open, x, color));
      for (let y = 0; y < viewport.height; y++) {
        for (let column = 0; column < viewport.width; column++) expect(frame.buffer.get(column, y)).toEqual(fresh.buffer.get(column, y));
      }
      oracle.dispose();
    }
    runtime.dispose();
  });
  it("updates theme without rebuilding layout and matches a fresh paint", () => {
    const viewport = { width: 30, height: 9 };
    const runtime = new CellUiRuntime({ viewport });
    const initial = runtime.render(fileList());
    const theme = { selectedStyle: { color: "#123456" } };
    runtime.setTheme(theme);
    const changed = runtime.render(fileList());
    const oracle = new CellUiRuntime({ viewport, theme });
    const fresh = oracle.render(fileList());
    expect(changed.revision).toBeGreaterThan(initial.revision);
    expect(changed.layout).toBe(initial.layout);
    expect(changed.scene).toBe(initial.scene);
    expect(changed.invalidation.dirtyRegions).toEqual([{ x: 0, y: 0, ...viewport }]);
    for (let y = 0; y < viewport.height; y++) {
      for (let x = 0; x < viewport.width; x++) {
        expect(changed.buffer.get(x, y)).toEqual(fresh.buffer.get(x, y));
      }
    }
    runtime.setTheme({ ...theme, selectedStyle: { ...theme.selectedStyle } });
    expect(runtime.render(fileList()).invalidation.phases).toEqual([]);
    runtime.setTheme();
    const reset = runtime.render(fileList());
    expect(reset.buffer.toText()).toBe(initial.buffer.toText());
    for (let y = 0; y < viewport.height; y++) {
      for (let x = 0; x < viewport.width; x++) {
        expect(reset.buffer.get(x, y)).toEqual(initial.buffer.get(x, y));
      }
    }
    runtime.dispose();
    oracle.dispose();
  });

  it("coalesces invalidation and skips Yoga for paint-only and geometry-only commits", () => {
    const yoga = new YogaLayoutEngine();
    const compute = vi.fn(yoga.compute.bind(yoga));
    const layoutEngine: LayoutEngine = {
      compute,
      dispose: () => yoga.dispose(),
    };
    const runtime = new CellUiRuntime({
      viewport: { width: 12, height: 4 },
      layoutEngine,
    });
    const view = (selected: "a" | "b", scrollY = 0) => (
      <Root id="root">
        <ScrollArea id="scroll" scrollY={scrollY} style={{ height: 2 }}>
          <List id="list">
            <ListItem id="a" selected={selected === "a"}><Text>alpha</Text></ListItem>
            <ListItem id="b" selected={selected === "b"}><Text>beta</Text></ListItem>
            <ListItem id="c"><Text>charlie</Text></ListItem>
          </List>
        </ScrollArea>
      </Root>
    );

    const initial = runtime.render(view("a"));
    const paintOnly = runtime.render(view("b"));
    const geometryOnly = runtime.render(view("b", 1));
    const unchanged = runtime.render(view("b", 1));
    const oracle = new CellUiRuntime({ viewport: { width: 12, height: 4 } });
    const oracleFrame = oracle.render(view("b", 1));

    expect(compute).toHaveBeenCalledTimes(1);
    expect(initial.invalidation.phases).toEqual([
      "tree", "layout", "geometry", "paint", "semantics", "present",
    ]);
    expect(paintOnly.layout).toBe(initial.layout);
    expect(paintOnly.scene).toBe(initial.scene);
    expect(paintOnly.invalidation).toMatchObject({
      phases: ["paint", "semantics", "present"],
      work: { layout: "reused", geometry: "reused", paint: "computed" },
    });
    expect(paintOnly.invalidation.dirtyRegions).toHaveLength(2);
    expect(geometryOnly.layout).toBe(initial.layout);
    expect(geometryOnly.scene).not.toBe(initial.scene);
    expect(geometryOnly.invalidation.work).toMatchObject({
      layout: "reused",
      geometry: "computed",
      paint: "computed",
    });
    expect(unchanged.buffer).toBe(geometryOnly.buffer);
    expect(unchanged.invalidation).toEqual({
      phases: [],
      dirtyRegions: [],
      work: {
        layout: "reused",
        geometry: "reused",
        paint: "reused",
        semantics: "reused",
        present: "skipped",
      },
    });
    for (let y = 0; y < unchanged.buffer.height; y += 1) {
      for (let x = 0; x < unchanged.buffer.width; x += 1) {
        expect(unchanged.buffer.get(x, y)).toEqual(oracleFrame.buffer.get(x, y));
      }
    }
    oracle.dispose();
    runtime.dispose();
  });

  it("renders React descriptors to a deterministic headless CellBuffer", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 30, height: 9 } });
    const frame = runtime.render(fileList());

    expect(frame.buffer.toText({ trimEnd: true })).toBe([
      "  New file",
      "✓ Open file",
      "  Save",
      "┌────────────────────────────┐",
      "│  01  src/index.ts          │",
      "│  02  src/app.ts            │",
      "│  03  src/layout.ts         │",
      "│  04  src/theme.ts          │",
      "└────────────────────────────┘",
    ].join("\n"));
    expect([...frame.layout.entries.values()].every(({ rect }) =>
      [rect.x, rect.y, rect.width, rect.height].every(Number.isInteger)
    )).toBe(true);
    expect(frame.scene.paintList).toEqual([
      "root",
      "workspace",
      "actions",
      "new",
      "new-label",
      "open",
      "open-label",
      "save",
      "save-label",
      "files",
      "file-list",
      "file-index",
      "file-index-label",
      "file-app",
      "file-app-label",
      "file-layout",
      "file-layout-label",
      "file-theme",
      "file-theme-label",
    ]);
    runtime.dispose();
  });

  it("keeps keyed WidgetIds stable across update, reorder, and unmount", () => {
    const onFrame = vi.fn();
    const runtime = new CellUiRuntime({ viewport: { width: 30, height: 9 }, onFrame });
    const first = runtime.render(fileList());
    const reordered = runtime.render(fileList(["theme", "index", "app", "layout"]));
    const unmounted = runtime.render(null);

    expect(first.tree.nodes.has("file-theme")).toBe(true);
    expect(first.mutations.every(({ type }) => type === "mount")).toBe(true);
    expect(reordered.tree.nodes.has("file-theme")).toBe(true);
    expect(reordered.mutations).toContainEqual(expect.objectContaining({
      type: "move",
      id: "file-theme",
      fromIndex: 3,
      toIndex: 0,
    }));
    expect(reordered.mutations).toContainEqual({ type: "update", id: "file-theme-label" });
    expect(unmounted.mutations.filter(({ type }) => type === "unmount")).toHaveLength(first.tree.nodes.size);
    expect(unmounted.buffer.toLines({ trimEnd: true }).every((line) => line === "")).toBe(true);
    expect(onFrame).toHaveBeenCalledTimes(3);
    expect(onFrame.mock.calls.map(([frame]) => frame.revision)).toEqual([1, 2, 3]);
    runtime.dispose();
  });

  it("derives parent-scoped stable ids from React keys", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 2 } });
    const render = (items: readonly string[]) => runtime.render(
      <Root id="root">
        <List id="list">
          {items.map((item) => <ListItem key={item}><Text>{item}</Text></ListItem>)}
        </List>
      </Root>
    );

    const first = render(["alpha", "beta"]);
    const second = render(["beta", "alpha"]);
    expect(first.tree.nodes.has("list/list-item:alpha")).toBe(true);
    expect(second.tree.nodes.has("list/list-item:alpha")).toBe(true);
    expect(second.mutations).toContainEqual(expect.objectContaining({
      type: "move",
      id: "list/list-item:alpha",
      fromIndex: 0,
      toIndex: 1,
    }));
    runtime.dispose();
  });

  it("clips and scrolls children without changing their layout snapshot", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 4 } });
    const frame = runtime.render(
      <Root id="root">
        <ScrollArea id="scroll" scrollY={1} style={{ border: true, height: 4 }}>
          <List id="list">
            <ListItem id="a"><Text id="a-label">alpha</Text></ListItem>
            <ListItem id="b"><Text id="b-label">beta</Text></ListItem>
            <ListItem id="c"><Text id="c-label">charlie</Text></ListItem>
          </List>
        </ScrollArea>
      </Root>
    );

    expect(frame.layout.entries.get("a-label")?.rect.y).toBe(0);
    expect(frame.scene.entries.get("a-label")?.layoutBounds.y).toBe(0);
    expect(frame.scene.entries.get("a-label")?.paintVisible).toBe(false);
    expect(frame.buffer.toText({ trimEnd: true })).toBe([
      "┌──────────┐",
      "│  beta    │",
      "│  charlie█│",
      "└──────────┘",
    ].join("\n"));
    expect(hitTest(frame.scene, { x: 3, y: 1 })[0]).toBe("b-label");
    runtime.dispose();
  });

  it("reserves owned Cell chrome for two-axis scrollbars", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 8, height: 4 } });
    const frame = runtime.render(
      <Root id="root">
        <ScrollArea id="scroll" scrollX={2} scrollY={1} style={{ border: true, width: 8, height: 4 }}>
          <Box id="content" style={{ width: 12, height: 3 }}><Text>wide content</Text></Box>
        </ScrollArea>
      </Root>
    );
    const metrics = frame.scene.entries.get("scroll")?.scrollMetrics;
    expect(metrics?.horizontalTrack).not.toBeNull();
    expect(metrics?.verticalTrack).not.toBeNull();
    expect(metrics?.corner).toEqual({ x: 6, y: 2, width: 1, height: 1 });
    expect(frame.buffer.get(6, 1)?.ownerId).toBe("scroll");
    expect(hitTestCell(frame.scene, { x: 6, y: 1 })).toMatchObject({
      ownerId: "scroll",
      part: "scrollbar-y",
    });
    expect(hitTestCell(frame.scene, { x: 2, y: 2 })).toMatchObject({
      ownerId: "scroll",
      part: "scrollbar-x",
    });
    runtime.dispose();
  });

  it("applies one overridable theme to renderer-owned state Cells", () => {
    const runtime = new CellUiRuntime({
      viewport: { width: 8, height: 1 },
      theme: {
        foreground: "#111111", background: "#abcdef", collectionSelectedIndicator: "*",
      },
    });
    const frame = runtime.render(
      <Root id="root"><ListItem id="item" focused selected><Text>Open</Text></ListItem></Root>
    );
    expect(frame.buffer.get(0, 0)?.text).toBe("*");
    expect(frame.buffer.get(2, 0)?.style).toMatchObject({
      color: "#abcdef",
      backgroundColor: "#111111",
    });
    runtime.dispose();
  });

  it.each([
    { focused: false, selected: false, disabled: false },
    { focused: false, selected: true, disabled: false },
    { focused: true, selected: false, disabled: false },
    { focused: true, selected: true, disabled: false },
    { focused: false, selected: true, disabled: true },
  ])("paints unified collection state $focused/$selected/$disabled across blank Cells", (state) => {
    const runtime = new CellUiRuntime({ viewport: { width: 8, height: 1 } });
    const frame = runtime.render(
      <Root><ListItem id="item" selected={state.selected} disabled={state.disabled}><Text>Open</Text></ListItem></Root>,
      { focusedId: state.focused ? "item" : null }
    );
    const expected = {
      ...(state.focused && !state.disabled ? { color: "#FFFFFF", backgroundColor: "#000000" } : {}),
      ...(state.disabled ? { color: "#777777" } : {}),
    };
    expect(frame.buffer.get(0, 0)?.style).toEqual(expected);
    if (state.focused || state.selected) expect(frame.buffer.get(7, 0)?.style).toEqual(expected);
    expect(frame.buffer.toText({ trimEnd: true })).toBe(state.selected ? "✓ Open" : "  Open");
    runtime.dispose();
  });

  it("allows hosts to explicitly suppress focus styling without clearing logical focus", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 8, height: 1 } });
    const frame = runtime.render(
      <Root id="root"><ListItem id="item"><Text>Open</Text></ListItem></Root>,
      { focusedId: "item", focusVisible: false }
    );
    expect(frame.tree.nodes.get("item")).toMatchObject({
      focused: true,
      focusVisible: false,
    });
    expect(frame.semantics.focusedId).toBe("item");
    expect(frame.buffer.get(2, 0)?.text).toBe("O");
    expect(frame.buffer.get(0, 0)?.style).toEqual({});
    runtime.dispose();
  });

  it("stores wide graphemes as one owner cell plus a continuation cell", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 8, height: 1 } });
    const frame = runtime.render(
      <Root id="root"><Text id="label">A中🙂B</Text></Root>
    );

    expect(frame.buffer.toText({ trimEnd: true })).toBe("A中🙂B");
    expect(frame.buffer.get(2, 0)).toMatchObject({ continuation: true, ownerId: "label" });
    expect(frame.buffer.get(4, 0)).toMatchObject({ continuation: true, ownerId: "label" });
    runtime.dispose();
  });

  it("projects border and padding into authoritative content geometry", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 5 } });
    const frame = runtime.render(
      <Root id="root">
        <Text
          id="padded"
          style={{ border: true, padding: 1, paddingLeft: 2, height: 5 }}
        >AB</Text>
      </Root>
    );
    expect(frame.layout.entries.get("padded")).toMatchObject({
      borderInsets: { top: 1, right: 1, bottom: 1, left: 1 },
      paddingInsets: { top: 1, right: 1, bottom: 1, left: 2 },
      contentRect: { x: 3, y: 2, width: 7, height: 1 },
    });
    expect(frame.scene.entries.get("padded")).toMatchObject({
      layoutBounds: { x: 0, y: 0, width: 12, height: 5 },
      contentBounds: { x: 3, y: 2, width: 7, height: 1 },
      outerClip: { x: 0, y: 0, width: 12, height: 5 },
      contentClip: { x: 3, y: 2, width: 7, height: 1 },
    });
    expect(frame.buffer.get(3, 2)).toMatchObject({ text: "A", ownerId: "padded" });
    expect(frame.buffer.get(1, 1)).toMatchObject({ text: " ", ownerId: null });
    runtime.dispose();
  });

  it.each([
    { selected: true, focused: false, disabled: false },
    { selected: false, focused: true, disabled: false },
    { selected: true, focused: true, disabled: false },
    { selected: true, focused: false, disabled: true },
  ])("keeps border chrome above $selected/$focused/$disabled state surfaces", (state) => {
    const runtime = new CellUiRuntime({ viewport: { width: 10, height: 3 } });
    const view = () => (
      <Root id="root">
        <List id="list">
          <ListItem id="item" {...state} style={{ border: true, width: 10, height: 3 }}>
            <Text>Value</Text>
          </ListItem>
        </List>
      </Root>
    );
    const frame = runtime.render(view(), {
      focusedId: state.focused ? "item" : undefined,
      focusVisible: state.focused,
    });

    expect(frame.buffer.toText({ trimEnd: true }).split("\n")[0]).toBe("┌────────┐");
    expect(frame.buffer.get(0, 1)).toMatchObject({ text: "│", ownerId: "item" });
    expect(frame.buffer.get(9, 1)).toMatchObject({ text: "│", ownerId: "item" });
    expect(frame.buffer.toText({ trimEnd: true }).split("\n")[2]).toBe("└────────┘");
    runtime.dispose();
  });

  it("preserves border chrome after a paint-only state transition", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 10, height: 3 } });
    const view = (selected: boolean) => (
      <Root id="root">
        <List id="list">
          <ListItem id="item" selected={selected} style={{ border: true, width: 10, height: 3 }}>
            <Text>Value</Text>
          </ListItem>
        </List>
      </Root>
    );
    runtime.render(view(false));
    const selected = runtime.render(view(true));

    expect(selected.invalidation.work.paint).toBe("computed");
    expect(selected.buffer.toText({ trimEnd: true })).toBe("┌────────┐\n│✓ Value │\n└────────┘");
    runtime.dispose();
  });

  it("clips oversized descendants before ancestor padding and border Cells", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 8, height: 3 } });
    const frame = runtime.render(
      <Root id="root">
        <Box id="panel" style={{ border: true, height: 3 }}>
          <Text id="overflow" style={{ width: 12 }}>ABCDEFGHIJK</Text>
        </Box>
      </Root>
    );
    expect(frame.buffer.toText({ trimEnd: true })).toBe([
      "┌──────┐",
      "│ABCDEF│",
      "└──────┘",
    ].join("\n"));
    expect(frame.buffer.get(7, 1)).toMatchObject({ text: "│", ownerId: "panel" });
    expect(hitTest(frame.scene, { x: 7, y: 1 })[0]).toBe("panel");
    runtime.dispose();
  });

  it("keeps all TextArea border Cells intact during horizontal and vertical scroll", () => {
    const editor = new CellTextEditor({
      value: "00-alpha\n11-bravo\n22-charlie\n33-delta\n44-echo",
      multiline: true,
      viewport: { columns: 8, rows: 3 },
    });
    editor.dispatch({ type: "set-scroll", x: 2, y: 2 });
    const runtime = new CellUiRuntime({ viewport: { width: 10, height: 5 } });
    const frame = runtime.render(
      <Root id="root">
        <TextArea
          id="editor"
          label="Document"
          state={editor.snapshot()}
          style={{ border: true, height: 5 }}
        />
      </Root>
    );
    expect(frame.buffer.toText({ trimEnd: true })).toBe([
      "┌────────┐",
      "│-charli▄│",
      "│-delta ▀│",
      "│ ▐███▌  │",
      "└────────┘",
    ].join("\n"));
    for (let x = 0; x < 10; x += 1) {
      expect(frame.buffer.get(x, 0)?.ownerId).toBe("editor");
      expect(frame.buffer.get(x, 4)?.ownerId).toBe("editor");
    }
    for (let y = 0; y < 5; y += 1) {
      expect(frame.buffer.get(0, y)?.ownerId).toBe("editor");
      expect(frame.buffer.get(9, y)?.ownerId).toBe("editor");
    }
    runtime.dispose();
  });

  it("drops a wide glyph that cannot fit wholly inside contentClip", () => {
    const editor = new CellTextEditor({ value: "中" });
    const runtime = new CellUiRuntime({ viewport: { width: 3, height: 3 } });
    const frame = runtime.render(
      <Root id="root">
        <TextArea
          id="editor"
          label="Document"
          state={editor.snapshot()}
          style={{ border: true, height: 3 }}
        />
      </Root>
    );
    expect(frame.buffer.toText({ trimEnd: true })).toBe("┌─┐\n│ │\n└─┘");
    expect(frame.buffer.get(2, 1)).toMatchObject({ text: "│", ownerId: "editor" });
    runtime.dispose();
  });

  it("portals an Overlay to a root layer while preserving its event parent", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 6 } });
    const frame = runtime.render(
      <Root id="root">
        <Box id="clipped-panel" style={{ border: true, width: 8, height: 3 }}>
          <Text id="underlay" style={{ width: 20 }}>underlay content</Text>
          <Overlay
            id="palette"
            label="Command palette"
            position={{ x: 4, y: 1 }}
            style={{ border: true, width: 12, height: 4 }}
            textStyle={{ backgroundColor: "#20252b" }}
          >
            <List id="commands" label="Commands">
              <ListItem id="command-one"><Text>First</Text></ListItem>
              <ListItem id="command-two" focused><Text>Second</Text></ListItem>
            </List>
          </Overlay>
        </Box>
        <Text id="later-underlay">abcdefghijklmnopqrst</Text>
      </Root>
    );

    expect(frame.scene.entries.get("clipped-panel")?.contentClip)
      .toEqual({ x: 1, y: 1, width: 6, height: 1 });
    expect(frame.scene.entries.get("palette")).toMatchObject({
      sceneParentId: "root",
      eventParentId: "clipped-panel",
      layoutBounds: { x: 4, y: 1, width: 12, height: 4 },
      outerClip: { x: 4, y: 1, width: 12, height: 4 },
      layer: 1,
    });
    expect(frame.scene.paintList.indexOf("palette"))
      .toBeGreaterThan(frame.scene.paintList.indexOf("later-underlay"));
    expect(getEventPath(frame.scene, "command-two"))
      .toEqual(["command-two", "commands", "palette", "clipped-panel", "root"]);
    expect(hitTest(frame.scene, { x: 7, y: 3 })[0]).toBe("command-two/text[0]");
    expect(frame.overlayPlanes).toEqual([{
      rootId: "palette",
      bounds: { x: 4, y: 1, width: 12, height: 4 },
      layer: 1,
      paintOrder: frame.scene.entries.get("palette")!.paintOrder,
    }]);
    expect(frame.baseBuffer.get(4, 4)?.ownerId).not.toBe("palette");
    expect(frame.overlayBuffer.get(4, 4)).toMatchObject({ text: "└", ownerId: "palette" });
    expect(frame.buffer.get(4, 4)).toMatchObject({ text: "└", ownerId: "palette" });
    expect(frame.buffer.get(15, 3)).toMatchObject({ text: "│", ownerId: "palette" });
    runtime.dispose();
  });
});
