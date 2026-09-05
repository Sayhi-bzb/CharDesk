import { describe, expect, it } from "vitest";
import {
  CellUiRuntime,
  Grid,
  GridCell,
  GridRow,
  List,
  ListItem,
  Menu,
  MenuItem,
  Overlay,
  Root,
  Tab,
  TabPanel,
  Tabs,
  Text,
  TextArea,
  Tree,
  TreeItem,
  auditSemanticSnapshot,
  createSemanticSnapshot,
} from "./index.js";
import { CellTextEditor } from "./text.js";

describe("SemanticSnapshot audit", () => {
  it("indexes focused ancestry with a constant number of tree traversals", () => {
    class CountingMap<K, V> extends Map<K, V> {
      valuesCalls = 0;

      override values(): MapIterator<V> {
        this.valuesCalls += 1;
        return super.values();
      }
    }

    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 4 } });
    const frame = runtime.render(
      <Root id="root">
        <List id="first" label="First"><ListItem id="a" focused><Text>A</Text></ListItem></List>
        <List id="second" label="Second"><ListItem id="b"><Text>B</Text></ListItem></List>
      </Root>
    );
    const nodes = new CountingMap(frame.tree.nodes);
    const snapshot = createSemanticSnapshot(
      { ...frame.tree, nodes },
      frame.scene,
      frame.revision + 1,
      "a"
    );

    expect(nodes.valuesCalls).toBe(3);
    expect(snapshot.nodes.get("first")?.activeDescendantId).toBe("a");
    expect(snapshot.nodes.get("second")?.activeDescendantId).toBeUndefined();
    runtime.dispose();
  });

  it("accepts complete complex-widget role, state, relation, order, focus, and action data", () => {
    const editor = new CellTextEditor({ value: "hello", multiline: true });
    const runtime = new CellUiRuntime({ viewport: { width: 40, height: 18 } });
    const frame = runtime.render(
      <Root id="root">
        <Menu id="menu" label="File menu"><MenuItem id="open"><Text>Open</Text></MenuItem></Menu>
        <Tree id="tree" label="Files">
          <TreeItem id="src" level={1} hasChildren expanded><Text>src</Text></TreeItem>
          <TreeItem id="index" level={2} parentItemId="src" focused selected><Text>index.ts</Text></TreeItem>
        </Tree>
        <Tabs id="tabs" label="Views">
          <Tab id="code" selected controlsId="panel"><Text>Code</Text></Tab>
        </Tabs>
        <TabPanel id="panel" label="Code panel" labelledById="code"><Text>content</Text></TabPanel>
        <Grid id="grid" label="Properties" rowCount={1} columnCount={1}>
          <GridRow id="row" rowIndex={1}>
            <GridCell id="cell" rowIndex={1} columnIndex={1}><Text>Name</Text></GridCell>
          </GridRow>
        </Grid>
        <TextArea id="editor" label="Document" state={editor.snapshot()} />
        <List id="actions" label="Actions">
          <ListItem id="save" positionInSet={10} setSize={100_000}><Text>Save</Text></ListItem>
        </List>
      </Root>
    );
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
    expect(frame.semantics.nodes.get("index")).toMatchObject({
      role: "treeitem",
      level: 2,
      focused: true,
      selected: true,
      actions: ["focus", "activate"],
    });
    expect(frame.semantics.nodes.get("save")).toMatchObject({
      positionInSet: 10,
      setSize: 100_000,
    });
    runtime.dispose();
  });

  it("keeps modal reading order independent from portal paint order", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 8 } });
    const frame = runtime.render(
      <Root id="root">
        <Overlay id="dialog" label="Commands" modal position={{ x: 5, y: 2 }}>
          <List id="commands" label="Commands"><ListItem id="run" focused><Text>Run</Text></ListItem></List>
        </Overlay>
        <List id="underlay" label="Underlay"><ListItem id="hidden"><Text>Hidden</Text></ListItem></List>
      </Root>
    );
    expect([...frame.semantics.nodes.keys()]).toEqual(["dialog", "commands", "run"]);
    expect(frame.scene.paintList.indexOf("dialog"))
      .toBeGreaterThan(frame.scene.paintList.indexOf("underlay"));
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
    runtime.dispose();
  });

  it("rejects incomplete or impossible set positions", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 4 } });
    const frame = runtime.render(
      <Root id="root">
        <List id="files" label="Files">
          <ListItem id="file" positionInSet={5} setSize={4}><Text>file.ts</Text></ListItem>
        </List>
      </Root>
    );
    expect(auditSemanticSnapshot(frame.semantics)).toContainEqual(expect.objectContaining({
      nodeId: "file",
      code: "invalid-position",
    }));
    runtime.dispose();
  });

  it("rejects state attached to an incompatible role", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 4 } });
    const frame = runtime.render(
      <Root id="root">
        <Tabs id="tabs" label="Views"><Tab id="code" selected><Text>Code</Text></Tab></Tabs>
      </Root>
    );
    const tab = frame.semantics.nodes.get("code")!;
    const nodes = new Map(frame.semantics.nodes);
    nodes.set("code", { ...tab, expanded: true, rowIndex: 0 });
    expect(auditSemanticSnapshot({ ...frame.semantics, nodes }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ nodeId: "code", code: "invalid-state" }),
      ]));
    runtime.dispose();
  });
});
