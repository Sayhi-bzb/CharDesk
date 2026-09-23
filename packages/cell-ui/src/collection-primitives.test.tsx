import { expect, it } from "vitest";
import { CellUiRuntime, Root, Box, List, ListItem, Menu, MenuItem, Tree, TreeItem, Grid, GridRow, GridCell, Tabs, Tab, Text, FocusManager, commandForInput, createKeyInput, CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME } from "./index.js";
import { CellInteractionController } from "./interaction-controller.js";

it.each(["list", "menu", "tree"])("%s separates selection chrome from transient input appearance", (kind) => {
  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 2 }, theme });
    const view = (disabled = false) => <Root>{kind === "list"
      ? <List><ListItem id="item" selected disabled={disabled} style={{ width: 8 }}><Text>Open</Text></ListItem></List>
      : kind === "menu"
        ? <Menu><MenuItem id="item" disabled={disabled} style={{ width: 8 }}><Text>Open</Text></MenuItem></Menu>
      : <Tree><TreeItem id="item" selected level={1} hasChildren expanded disabled={disabled} style={{ width: 8 }}><Text>Open</Text></TreeItem></Tree>}</Root>;
    const idle = runtime.render(view());
    const text = idle.buffer.toText();
    if (kind === "tree") expect(text).toContain("▾ ✓ Op");
    if (kind === "list") expect(text).toContain("✓ Open");
    for (let x = 0; x < 8; x++) expect(idle.buffer.get(x, 0)?.style.backgroundColor).toBeUndefined();
    for (const state of [{ hoveredId: "item", focusVisible: false }, { focusedId: "item", focusVisible: true }]) {
      const frame = runtime.render(view(), state);
      expect(frame.buffer.toText()).toBe(text);
      for (let x = 0; x < 8; x++) {
        expect(frame.buffer.get(x, 0)?.style).toMatchObject({ color: theme.background, backgroundColor: theme.foreground });
        expect(frame.buffer.get(x, 0)?.style.bold).not.toBe(true);
      }
      expect(frame.buffer.get(8, 0)?.style.backgroundColor).toBeUndefined();
      const disabled = runtime.render(view(true), state);
      expect(disabled.buffer.get(0, 0)?.style.backgroundColor).toBeUndefined();
    }
    expect(runtime.render(view(), { focusedId: "item", focusVisible: false }).buffer.get(0, 0)?.style.backgroundColor).toBeUndefined();
    runtime.dispose();
  }
});

it("Tabs keep one selected surface across hover and focus while available tabs use normal text", () => {
  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    const runtime = new CellUiRuntime({ viewport: { width: 26, height: 2 }, theme });
    const view = () => <Root><Tabs id="tabs">
      <Tab id="selected" selected><Text>Code</Text></Tab>
      <Tab id="inactive"><Text>Preview</Text></Tab>
      <Tab id="disabled" disabled><Text>Off</Text></Tab>
    </Tabs></Root>;
    const idle = runtime.render(view());
    const selected = idle.scene.entries.get("selected")!.layoutBounds;
    const inactive = idle.scene.entries.get("inactive")!.layoutBounds;
    const disabled = idle.scene.entries.get("disabled")!.layoutBounds;
    expect(selected).toMatchObject({ width: 6, height: 1 });
    expect(inactive.x - selected.x - selected.width).toBe(2);
    expect(idle.buffer.get(selected.x, selected.y)?.style).toMatchObject(theme.selectedStyle);
    expect(idle.buffer.get(inactive.x + 1, inactive.y)?.style.color).toBe(theme.foreground);
    expect(idle.buffer.get(disabled.x + 1, disabled.y)?.style.color).toBe(theme.disabledStyle.color);
    for (const state of [{ hoveredId: "selected" }, { focusedId: "selected", focusVisible: true }]) {
      expect(runtime.render(view(), state).buffer.get(selected.x, selected.y)?.style)
        .toMatchObject(theme.selectedStyle);
    }
    expect(runtime.render(view(), { hoveredId: "inactive" }).buffer.get(inactive.x, inactive.y)?.style)
      .toMatchObject(theme.hoveredItemStyle);
    expect(runtime.render(view(), { focusedId: "inactive", focusVisible: true }).buffer.get(inactive.x + 1, inactive.y)?.style)
      .toMatchObject({ color: theme.foreground, bold: true });
    const disabledHover = runtime.render(view(), { hoveredId: "disabled", focusedId: "disabled", focusVisible: true });
    expect(disabledHover.buffer.get(disabled.x + 1, disabled.y)?.style.color).toBe(theme.disabledStyle.color);
    expect(disabledHover.buffer.toText()).not.toContain("▬");
    runtime.dispose();
  }
});

it.each(["list", "tree", "grid"])("%s owns both guard Cells and keeps user padding additive", (kind) => {
  const runtime = new CellUiRuntime({ viewport: { width: 20, height: 2 } });
  const itemStyle = { width: 12, paddingLeft: 2, paddingRight: 2 };
  const item = <Text>A</Text>;
  const view = <Root>{kind === "list"
    ? <List><ListItem id="item" selected style={itemStyle}>{item}</ListItem></List>
    : kind === "tree"
      ? <Tree><TreeItem id="item" selected hasChildren expanded style={itemStyle}>{item}</TreeItem></Tree>
      : <Grid><GridRow><GridCell id="item" selected style={itemStyle}>{item}</GridCell></GridRow></Grid>}</Root>;
  const frame = runtime.render(view);
  const entry = frame.scene.entries.get("item")!;
  const left = entry.decorationBounds.x;
  const right = left + entry.decorationBounds.width - 1;
  expect(entry.decorationBounds.width).toBe(12);
  expect(frame.buffer.get(left, 0)).toMatchObject({ text: " ", ownerId: "item" });
  expect(frame.buffer.get(right, 0)).toMatchObject({ text: " ", ownerId: "item" });
  expect(frame.buffer.get(left + (kind === "tree" ? 3 : 1), 0)).toMatchObject({ text: "✓", ownerId: "item" });
  expect(entry.contentBounds.x - left).toBe(kind === "tree" ? 7 : 5);
  expect(right - (entry.contentBounds.x + entry.contentBounds.width - 1)).toBe(3);
  runtime.dispose();
});

it.each(["list", "tree", "grid"])("%s keeps its first indicator visible at one Cell", (kind) => {
  const runtime = new CellUiRuntime({ viewport: { width: 4, height: 1 } });
  const view = <Root>{kind === "list"
    ? <List><ListItem id="item" selected style={{ width: 1 }} /></List>
    : kind === "tree"
      ? <Tree><TreeItem id="item" hasChildren expanded style={{ width: 1 }} /></Tree>
      : <Grid><GridRow><GridCell id="item" selected style={{ width: 1 }} /></GridRow></Grid>}</Root>;
  const frame = runtime.render(view);
  expect(frame.scene.entries.get("item")?.decorationBounds.width).toBe(1);
  expect(frame.buffer.get(0, 0)).toMatchObject({ text: kind === "tree" ? "▾" : "✓", ownerId: "item" });
  runtime.dispose();
});

it("grows an unconstrained ListItem to include both guards", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 20, height: 1 } });
  const frame = runtime.render(<Root><Box style={{ direction: "row" }}><ListItem id="item"><Text>A</Text></ListItem></Box></Root>);
  expect(frame.scene.entries.get("item")?.decorationBounds.width).toBe(5);
  expect(frame.buffer.toText({ trimEnd: true })).toBe("   A");
  expect(frame.buffer.get(4, 0)).toMatchObject({ text: " ", ownerId: "item" });
  runtime.dispose();
});

it("only menu hover changes navigation and never executes an action", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 3 } });
  const frame = runtime.render(<Root><Menu><MenuItem id="menu"><Text>Open</Text></MenuItem></Menu>
    <List><ListItem id="list"><Text>File</Text></ListItem></List></Root>);
  const commands: unknown[] = [];
  const controller = new CellInteractionController(() => {}, (c) => commands.push(c));
  controller.setInputSource("pointer");
  controller.setHovered(frame, "list");
  expect(commands).toEqual([]);
  controller.setHovered(frame, "menu");
  expect(commands).toEqual([{ type: "focus", targetId: "menu" }]);
  runtime.dispose();
});

it("restores a collapsed tree descendant to its surviving parent", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 16, height: 3 } });
  const view = (expanded: boolean) => <Root><Tree><TreeItem id="src" hasChildren expanded={expanded}><Text>src</Text></TreeItem>
    {expanded && <TreeItem id="file" level={2} parentItemId="src"><Text>File</Text></TreeItem>}</Tree></Root>;
  const focus = new FocusManager();
  focus.sync(runtime.render(view(true)).tree, "file");
  focus.sync(runtime.render(view(false)).tree);
  expect(focus.focusedId).toBe("src");
  runtime.dispose();
});

it("Tabs Home/End activate available endpoints without changing Grid navigation", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 30, height: 2 } });
  const frame = runtime.render(<Root><Tabs><Tab id="a"><Text>A</Text></Tab><Tab id="b" disabled><Text>B</Text></Tab><Tab id="c"><Text>C</Text></Tab></Tabs></Root>);
  const focus = new FocusManager();
  focus.sync(frame.tree, "a");
  expect(commandForInput(createKeyInput({ key: "End" }), frame, focus)).toEqual({ type: "activate", targetId: "c" });
  focus.sync(frame.tree, "c");
  expect(commandForInput(createKeyInput({ key: "Home" }), frame, focus)).toEqual({ type: "activate", targetId: "a" });
  runtime.dispose();
});
