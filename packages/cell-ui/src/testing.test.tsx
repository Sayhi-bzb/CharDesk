import { describe, expect, it } from "vitest";
import {
  List,
  ListItem,
  Root,
  ScrollArea,
  Text,
  createTestPilot,
  CellTextEditor,
  TextInput,
  type WidgetCommand,
} from "./index.js";

describe("TestPilot", () => {
  it("synchronizes editor viewport from layout on mount and resize", async () => {
    const editor = new CellTextEditor({ value: "a".repeat(32) });
    editor.dispatch({ type: "move", direction: "line-end" });
    const pilot = createTestPilot({
      viewport: { width: 40, height: 3 },
      render: () => <Root><TextInput id="name" state={editor.snapshot()} style={{ border: true, height: 3 }} /></Root>,
      onCommand: (command) => { if (command.type === "text") editor.dispatch(command.command); },
    });
    expect(editor.snapshot().viewport).toEqual({ columns: 38, rows: 1 });
    expect(editor.snapshot().scrollX).toBe(0);
    await pilot.resize({ width: 15, height: 3 });
    expect(editor.snapshot().viewport).toEqual({ columns: 13, rows: 1 });
    expect(editor.snapshot().scrollX).toBe(20);
    await pilot.resize({ width: 40, height: 3 });
    expect(editor.snapshot().scrollX).toBe(0);
    pilot.dispose();
  });
  it("drives keyboard, Cell pointer, scroll, resize, and semantic actions headlessly", async () => {
    let focusedId = "open";
    let selectedId = "open";
    let scrollY = 0;
    const commands: WidgetCommand[] = [];
    const render = () => (
      <Root id="root">
        <List id="actions" label="Actions" style={{ height: 2 }}>
          {[
            { id: "new", label: "New file" },
            { id: "open", label: "Open file" },
          ].map((item) => (
            <ListItem
              id={item.id}
              key={item.id}
              focused={focusedId === item.id}
              selected={selectedId === item.id}
            ><Text>{item.label}</Text></ListItem>
          ))}
        </List>
        <ScrollArea id="files" scrollY={scrollY} style={{ border: true, height: 3 }}>
          <List id="file-list" label="Files">
            {["one", "two", "three", "four"].map((name) => (
              <ListItem id={`file-${name}`} key={name}><Text>{name}</Text></ListItem>
            ))}
          </List>
        </ScrollArea>
      </Root>
    );
    const pilot = createTestPilot({
      viewport: { width: 16, height: 5 },
      render,
      onCommand: (command) => {
        commands.push(command);
        if (command.type === "focus" || command.type === "activate") {
          focusedId = command.targetId;
        }
        if (command.type === "activate") selectedId = command.targetId;
        if (command.type === "scroll") scrollY = command.scrollY;
      },
    });

    expect(pilot.focus()).toBe("open");
    expect(pilot.getByRole("listbox", { name: "Actions" }).activeDescendantId)
      .toBe("open");
    expect(pilot.hit({ x: 2, y: 0 })).toContain("new");

    await pilot.press("ArrowUp", "Enter");
    expect(pilot.focus()).toBe("new");
    expect(selectedId).toBe("new");
    expect(commands.at(-1)).toEqual({ type: "activate", targetId: "new" });

    await pilot.semanticAction("open", "activate");
    expect(selectedId).toBe("open");
    await pilot.scroll("files", { x: 0, y: 2 });
    expect(scrollY).toBe(2);
    expect(pilot.scene("file-one").paintVisible).toBe(false);

    await pilot.scroll("files", { x: 0, y: -2 });
    await pilot.pointerDown({ x: 4, y: 3 }, 9);
    await pilot.pointerMove({ x: 4, y: 1 }, 9);
    await pilot.pointerUp({ x: 4, y: 1 }, 9);
    expect(scrollY).toBe(2);
    expect(commands.at(-1)).toMatchObject({ type: "scroll", targetId: "files" });

    await pilot.resize({ width: 20, height: 6 });
    expect(pilot.scene().viewport).toEqual({ x: 0, y: 0, width: 20, height: 6 });
    expect(pilot.frame.invalidation.phases).toContain("layout");
    expect(pilot.text({ x: 0, y: 0, width: 8, height: 2 })).toContain("Open");
    expect(pilot.semantics().nodes.get("open")).toMatchObject({
      role: "option",
      label: "Open file",
      focused: false,
      selected: true,
      actions: ["focus", "activate"],
    });
    expect(pilot.focus()).toMatch(/^file-/);
    pilot.dispose();
    await expect(pilot.press("Enter")).rejects.toThrow("disposed");
  });

  it("fails ambiguous semantic queries instead of choosing an arbitrary node", () => {
    const pilot = createTestPilot({
      viewport: { width: 10, height: 2 },
      render: () => (
        <Root id="root">
          <List id="first"><ListItem id="a"><Text>A</Text></ListItem></List>
          <List id="second"><ListItem id="b"><Text>B</Text></ListItem></List>
        </Root>
      ),
    });
    expect(() => pilot.getByRole("listbox")).toThrow("found 2");
    expect(() => pilot.getByRole("dialog")).toThrow("found 0");
    pilot.dispose();
  });
});
