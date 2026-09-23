import { describe, expect, it } from "vitest";
import {
  CellUiRuntime,
  FocusManager,
  Grid,
  GridCell,
  GridRow,
  Menu,
  MenuItem,
  Root,
  Tab,
  TabPanel,
  Tabs,
  Text,
  Tree,
  TreeItem,
  commandForInput,
  createKeyInput,
  Box,
  ScrollArea,
  hitTest,
} from "./index.js";

it("renders one-row Tabs with content-width labels and one Cell of selectable guard", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 30, height: 2 } });
  for (const label of ["Code", "Preview", "Settings"]) {
    const frame = runtime.render(<Root><Tabs id="tabs"><Tab id="tab" selected>
      <Text id="label">{label}</Text>
    </Tab></Tabs></Root>);
    const entry = frame.scene.entries.get("tab")!;
    expect(entry.layoutBounds).toMatchObject({ width: label.length + 2, height: 1 });
    expect(entry.contentBounds.x).toBe(entry.layoutBounds.x + 1);
    expect(entry.contentBounds.width).toBe(label.length);
    for (const x of [entry.layoutBounds.x, entry.layoutBounds.x + entry.layoutBounds.width - 1]) {
      expect(frame.buffer.get(x, entry.layoutBounds.y)).toMatchObject({ text: " ", ownerId: "tab" });
      expect(hitTest(frame.scene, { x, y: entry.layoutBounds.y })[0]).toBe("tab");
    }
    expect(frame.buffer.toText()).not.toContain("▬");
  }
  runtime.dispose();
});

it("paints owned block thumbs along both scroll axes", () => {
  for (const offset of [0, 4, 20]) {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 8 } });
    const frame = runtime.render(<Root>
      <ScrollArea id="scroll" frame="bordered" scrollX={offset} scrollY={offset} style={{ width: 12, height: 8 }}>
        <Box style={{ width: 24, height: 16 }}><Text>content</Text></Box>
      </ScrollArea>
    </Root>);
    const metrics = frame.scene.entries.get("scroll")!.scrollMetrics!;
    for (const thumb of [metrics.horizontalThumb, metrics.verticalThumb]) {
      expect(thumb).not.toBeNull();
      for (let y = thumb!.y; y < thumb!.y + thumb!.height; y++) {
        for (let x = thumb!.x; x < thumb!.x + thumb!.width; x++) {
          expect(frame.buffer.get(x, y)?.ownerId).toBe("scroll");
          expect(["█", "▀", "▄", "▌", "▐"]).toContain(frame.buffer.get(x, y)?.text);
          expect(hitTest(frame.scene, { x, y })[0]).toBe("scroll");
        }
      }
    }
    runtime.dispose();
  }
});

const renderComplexWidgets = (focusedId = "menu-open") => {
  const runtime = new CellUiRuntime({ viewport: { width: 48, height: 18 } });
  const frame = runtime.render(
    <Root id="root">
      <Menu id="menu" label="File menu" orientation="vertical">
        <MenuItem id="menu-open"><Text>Open</Text></MenuItem>
        <MenuItem id="menu-disabled" disabled><Text>Disabled</Text></MenuItem>
        <MenuItem id="menu-save"><Text>Save</Text></MenuItem>
      </Menu>
      <Tree id="tree" label="Files" orientation="vertical">
        <TreeItem id="tree-src" level={1} hasChildren expanded>
          <Text>src</Text>
        </TreeItem>
        <TreeItem id="tree-index" level={2} parentItemId="tree-src">
          <Text>index.ts</Text>
        </TreeItem>
      </Tree>
      <Tabs id="tabs" label="Views" orientation="horizontal">
        <Tab id="tab-code" controlsId="panel-code" selected>
          <Text>Code</Text>
        </Tab>
        <Tab id="tab-preview" controlsId="panel-preview">
          <Text>Preview</Text>
        </Tab>
      </Tabs>
      <TabPanel id="panel-code" label="Code view" labelledById="tab-code" style={{ height: 1 }}>
        <Text>Editor</Text>
      </TabPanel>
      <Grid id="grid" label="Properties" rowCount={2} columnCount={2}>
        <GridRow id="grid-row-1" rowIndex={1}>
          <GridCell id="grid-1-1" rowIndex={1} columnIndex={1} selected style={{ width: 12 }}>
            <Text>Name</Text>
          </GridCell>
          <GridCell id="grid-1-2" rowIndex={1} columnIndex={2} style={{ width: 12 }}>
            <Text>Value</Text>
          </GridCell>
        </GridRow>
        <GridRow id="grid-row-2" rowIndex={2}>
          <GridCell id="grid-2-1" rowIndex={2} columnIndex={1} style={{ width: 12 }}>
            <Text>Theme</Text>
          </GridCell>
          <GridCell id="grid-2-2" rowIndex={2} columnIndex={2} style={{ width: 12 }}>
            <Text>Dark</Text>
          </GridCell>
        </GridRow>
      </Grid>
    </Root>,
    { focusedId }
  );
  return { runtime, frame };
};

describe("complex Cell widgets", () => {
  it("projects Menu, Tree, Tabs, TabPanel, and Grid semantics from one frame", () => {
    const { runtime, frame } = renderComplexWidgets();
    expect(frame.semantics.nodes.get("menu")).toMatchObject({
      role: "menu",
      orientation: "vertical",
      activeDescendantId: "menu-open",
    });
    expect(frame.semantics.nodes.get("menu-open")).toMatchObject({
      role: "menuitem",
      actions: ["focus", "activate"],
    });
    expect(frame.semantics.nodes.get("tree-src")).toMatchObject({
      role: "treeitem",
      expanded: true,
      level: 1,
      actions: ["focus", "collapse"],
    });
    expect(frame.semantics.nodes.get("tab-code")).toMatchObject({
      role: "tab",
      selected: true,
      controlsId: "panel-code",
    });
    expect(frame.semantics.nodes.get("panel-code")).toMatchObject({
      role: "tabpanel",
      labelledById: "tab-code",
    });
    expect(frame.semantics.nodes.get("grid")).toMatchObject({
      role: "grid",
      rowCount: 2,
      columnCount: 2,
      activeDescendantId: undefined,
    });
    expect(frame.semantics.nodes.get("grid-2-2")).toMatchObject({
      role: "gridcell",
      rowIndex: 2,
      columnIndex: 2,
    });
    runtime.dispose();
  });

  it("uses collection-specific keyboard navigation and skips disabled items", () => {
    const { runtime, frame } = renderComplexWidgets();
    const focus = new FocusManager();

    focus.sync(frame.tree, "menu-open");
    expect(commandForInput(createKeyInput({ key: "ArrowDown" }), frame, focus))
      .toEqual({ type: "focus", targetId: "menu-save" });

    focus.sync(frame.tree, "tree-src");
    expect(commandForInput(createKeyInput({ key: "ArrowRight" }), frame, focus))
      .toEqual({ type: "focus", targetId: "tree-index" });
    expect(commandForInput(createKeyInput({ key: "ArrowLeft" }), frame, focus))
      .toEqual({ type: "set-expanded", targetId: "tree-src", expanded: false });
    focus.sync(frame.tree, "tree-index");
    expect(commandForInput(createKeyInput({ key: "ArrowLeft" }), frame, focus))
      .toEqual({ type: "focus", targetId: "tree-src" });

    focus.sync(frame.tree, "tab-code");
    expect(commandForInput(createKeyInput({ key: "ArrowLeft" }), frame, focus))
      .toEqual({ type: "activate", targetId: "tab-preview" });

    focus.sync(frame.tree, "grid-1-1");
    expect(commandForInput(createKeyInput({ key: "ArrowRight" }), frame, focus))
      .toEqual({ type: "focus", targetId: "grid-1-2" });
    expect(commandForInput(createKeyInput({ key: "ArrowDown" }), frame, focus))
      .toEqual({ type: "focus", targetId: "grid-2-1" });
    runtime.dispose();
  });

  it("owns focus, tree disclosure, and selected Tab guard Cells", () => {
    const { runtime, frame } = renderComplexWidgets("tree-src");
    const tree = frame.scene.entries.get("tree-src")!.layoutBounds;
    const tab = frame.scene.entries.get("tab-code")!.layoutBounds;
    expect(frame.buffer.get(tree.x, tree.y)?.text).toBe(" ");
    expect(frame.buffer.get(tree.x + 1, tree.y)?.text).toBe("▾");
    expect(frame.buffer.get(tree.x + 5, tree.y)?.text).toBe("s");
    expect(frame.buffer.get(tree.x, tree.y)?.style.backgroundColor).toBe("#000000");
    expect(frame.buffer.get(tab.x, tab.y)).toMatchObject({
      text: " ",
      style: { color: "#FFFFFF", backgroundColor: "#000000" },
    });
    runtime.dispose();
  });

  it("routes pointer and semantic actions to complex collection items", () => {
    const { runtime, frame } = renderComplexWidgets();
    const focus = new FocusManager();
    focus.sync(frame.tree, "grid-1-1");
    const bounds = frame.scene.entries.get("grid-2-2")!.layoutBounds;
    expect(commandForInput({
      type: "pointer",
      phase: "up",
      point: { x: bounds.x + 3, y: bounds.y },
      button: 0,
    }, frame, focus)).toEqual({ type: "activate", targetId: "grid-2-2" });
    const treeBounds = frame.scene.entries.get("tree-src")!.layoutBounds;
    expect(commandForInput({
      type: "pointer",
      phase: "down",
      point: { x: treeBounds.x + 5, y: treeBounds.y },
      button: 0,
    }, frame, focus)).toEqual({ type: "focus", targetId: "tree-src" });
    expect(commandForInput({
      type: "pointer",
      phase: "up",
      point: { x: treeBounds.x + 5, y: treeBounds.y },
      button: 0,
    }, frame, focus)).toEqual({
      type: "set-expanded",
      targetId: "tree-src",
      expanded: false,
    });
    expect(commandForInput({
      type: "semantic",
      targetId: "tree-src",
      action: "collapse",
    }, frame, focus)).toEqual({
      type: "set-expanded",
      targetId: "tree-src",
      expanded: false,
    });
    focus.sync(frame.tree, "tree-src");
    expect(commandForInput(createKeyInput({ key: "Enter" }), frame, focus)).toEqual({
      type: "set-expanded",
      targetId: "tree-src",
      expanded: false,
    });
    runtime.dispose();
  });
});
