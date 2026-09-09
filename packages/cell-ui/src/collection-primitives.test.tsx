import { expect, it } from "vitest";
import { CellUiRuntime, Root, List, ListItem, Menu, MenuItem, Tree, TreeItem, Tabs, Tab, Text, FocusManager, commandForInput, createKeyInput, CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME } from "./index.js";
import { CellInteractionController } from "./interaction-controller.js";

it.each(["list", "menu", "tree", "tabs"])("%s separates selection chrome from transient input appearance", (kind) => {
  for (const theme of [CLASSIC_MAC_LIGHT_THEME, CLASSIC_MAC_DARK_THEME]) {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 2 }, theme });
    const view = (disabled = false) => <Root>{kind === "list"
      ? <List><ListItem id="item" selected disabled={disabled} style={{ width: 8 }}><Text>Open</Text></ListItem></List>
      : kind === "menu"
        ? <Menu><MenuItem id="item" disabled={disabled} style={{ width: 8 }}><Text>Open</Text></MenuItem></Menu>
        : kind === "tree"
          ? <Tree><TreeItem id="item" selected level={1} hasChildren expanded disabled={disabled} style={{ width: 8 }}><Text>Open</Text></TreeItem></Tree>
          : <Tabs><Tab id="item" selected disabled={disabled} style={{ width: 8 }}><Text>Open</Text></Tab></Tabs>}</Root>;
    const idle = runtime.render(view());
    const text = idle.buffer.toText();
    if (kind === "tree") expect(text).toContain("▾ ✓ Open");
    if (kind === "list") expect(text).toContain("✓ Open");
    if (kind === "tabs") expect(text).toContain("▬▬▬▬▬▬▬▬");
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
