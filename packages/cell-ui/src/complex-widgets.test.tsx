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
  Box,
  ScrollArea,
  hitTest,
} from "./index.js";

it("reserves Tab chrome from descendant text and backgrounds", () => {
  for (const padding of [0, 1]) {
    for (const height of [1, 2, 5]) {
      const runtime = new CellUiRuntime({ viewport: { width: 12, height: 6 } });
      const view = (label: string, selected: boolean) => <Root>
        <Tab id="tab" selected={selected} focused style={{ width: 12, height, padding }}>
          <Text id="label">{label}</Text>
        </Tab>
      </Root>;
      for (const label of ["Code", "Preview", "very long tab content"]) {
        const frame = runtime.render(view(label, true));
        const entry = frame.scene.entries.get("tab")!;
        const bottom = entry.decorationBounds.y + entry.decorationBounds.height - 1;
        expect(entry.contentBounds.y + entry.contentBounds.height).toBeLessThanOrEqual(bottom);
        if (entry.decorationBounds.height > 1) {
          for (let x = 0; x < 12; x++) {
            expect(frame.buffer.get(x, bottom)).toMatchObject({ text: "▬", ownerId: "tab" });
            expect(hitTest(frame.scene, { x, y: bottom })[0]).toBe("tab");
          }
        }
        const oracle = new CellUiRuntime({ viewport: { width: 12, height: 6 } });
        const fresh = oracle.render(view(label, true));
        for (let y = 0; y < 6; y++) {
          for (let x = 0; x < 12; x++) expect(frame.buffer.get(x, y)).toEqual(fresh.buffer.get(x, y));
        }
        oracle.dispose();
        expect(runtime.render(view(label, false)).buffer.toText()).not.toContain("▬");
      }
      runtime.dispose();
    }
  }
});

it("paints continuous full-Cell thumbs along both scroll axes", () => {
  for (const offset of [0, 4, 20]) {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 8 } });
    const frame = runtime.render(<Root>
      <ScrollArea id="scroll" scrollX={offset} scrollY={offset} style={{ width: 12, height: 8, border: true }}>
        <Box style={{ width: 24, height: 16 }}><Text>content</Text></Box>
      </ScrollArea>
    </Root>);
    const metrics = frame.scene.entries.get("scroll")!.scrollMetrics!;
    for (const thumb of [metrics.horizontalThumb, metrics.verticalThumb]) {
      expect(thumb).not.toBeNull();
      for (let y = thumb!.y; y < thumb!.y + thumb!.height; y++) {
        for (let x = thumb!.x; x < thumb!.x + thumb!.width; x++) {
          expect(frame.buffer.get(x, y), JSON.stringify({ offset, x, y, metrics })).toMatchObject({ text: "█", ownerId: "scroll" });
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
      <Tabs id="tabs" label="Views" orientation="horizontal" style={{ height: 2 }}>
        <Tab id="tab-code" controlsId="panel-code" selected style={{ width: 10 }}>
          <Text>Code</Text>
        </Tab>
        <Tab id="tab-preview" controlsId="panel-preview" style={{ width: 10 }}>
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
    expect(commandForInput({ type: "key", key: "ArrowDown" }, frame, focus))
      .toEqual({ type: "focus", targetId: "menu-save" });

    focus.sync(frame.tree, "tree-src");
    expect(commandForInput({ type: "key", key: "ArrowRight" }, frame, focus))
      .toEqual({ type: "focus", targetId: "tree-index" });
    expect(commandForInput({ type: "key", key: "ArrowLeft" }, frame, focus))
      .toEqual({ type: "set-expanded", targetId: "tree-src", expanded: false });
    focus.sync(frame.tree, "tree-index");
    expect(commandForInput({ type: "key", key: "ArrowLeft" }, frame, focus))
      .toEqual({ type: "focus", targetId: "tree-src" });

    focus.sync(frame.tree, "tab-code");
    expect(commandForInput({ type: "key", key: "ArrowLeft" }, frame, focus))
      .toEqual({ type: "activate", targetId: "tab-preview" });

    focus.sync(frame.tree, "grid-1-1");
    expect(commandForInput({ type: "key", key: "ArrowRight" }, frame, focus))
      .toEqual({ type: "focus", targetId: "grid-1-2" });
    expect(commandForInput({ type: "key", key: "ArrowDown" }, frame, focus))
      .toEqual({ type: "focus", targetId: "grid-2-1" });
    runtime.dispose();
  });

  it("owns focus, tree disclosure, selection, and tab underline Cells", () => {
    const { runtime, frame } = renderComplexWidgets("tree-src");
    const tree = frame.scene.entries.get("tree-src")!.layoutBounds;
    const tab = frame.scene.entries.get("tab-code")!.layoutBounds;
    expect(frame.buffer.get(tree.x, tree.y)?.text).toBe("▾");
    expect(frame.buffer.get(tree.x + 2, tree.y)?.text).toBe("s");
    expect(frame.buffer.get(tree.x, tree.y)?.style.backgroundColor).toBe("#1a1a1a");
    expect(frame.buffer.get(tab.x, tab.y)?.style.backgroundColor).toBe("#1a1a1a");
    expect(frame.buffer.get(tab.x, tab.y + 1)?.text).toBe("▬");
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
    expect(commandForInput({ type: "key", key: "Enter" }, frame, focus)).toEqual({
      type: "set-expanded",
      targetId: "tree-src",
      expanded: false,
    });
    runtime.dispose();
  });
});
