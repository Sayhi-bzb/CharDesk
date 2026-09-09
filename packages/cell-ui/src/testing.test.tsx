import { describe, expect, it, vi } from "vitest";
import {
  Button,
  List,
  ListItem,
  Root,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Text,
  createTestPilot,
  CellTextEditor,
  TextInput,
  type WidgetCommand,
} from "./index.js";

describe("TestPilot", () => {
  it("keeps Select open for item feedback and closes from the shared completion", async () => {
    vi.useFakeTimers();
    let open = false;
    let selectedId = "dark";
    const commands: WidgetCommand[] = [];
    const renderSelect = () => (
      <Root id="root">
        <Select id="theme" style={{ width: 12 }}>
          <SelectTrigger id="theme-trigger" expanded={open} controlsId={open ? "theme-content" : undefined}>
            <Text>{selectedId === "light" ? "Light" : "Dark"}</Text>
          </SelectTrigger>
          {open ? (
            <SelectContent id="theme-content">
              <SelectItem id="light" selected={selectedId === "light"}><Text>Light</Text></SelectItem>
              <SelectItem id="dark" selected={selectedId === "dark"}><Text>Dark</Text></SelectItem>
            </SelectContent>
          ) : null}
        </Select>
      </Root>
    );
    const pilot = createTestPilot({
      viewport: { width: 14, height: 5 },
      render: renderSelect,
      onCommand: (command) => {
        commands.push(command);
        if (command.type === "set-expanded" && command.targetId === "theme-trigger") {
          open = command.expanded;
        } else if (command.type === "activate" && command.targetId === "light") {
          selectedId = "light";
        } else if (command.type === "dismiss" && command.targetId === "theme-content") {
          open = false;
        }
      },
    });

    await pilot.click({ x: 1, y: 0 });
    expect(open).toBe(true);
    expect(pilot.frame.tree.nodes.get("theme-trigger")?.activationFlash).toBe(false);
    await pilot.pointerDown({ x: 2, y: 2 });
    expect(pilot.frame.tree.nodes.get("light")?.pressActive).toBe(true);
    await pilot.pointerUp({ x: 2, y: 2 });
    expect(selectedId).toBe("light");
    expect(open).toBe(true);
    expect(pilot.frame.tree.nodes.get("light")?.activationFlash).toBe(true);

    vi.advanceTimersByTime(80);
    expect(pilot.frame.tree.nodes.get("light")?.activationFlash).toBe(false);
    await pilot.pressKey("ArrowDown");
    expect(pilot.focus()).toBe("light");
    expect(selectedId).toBe("light");
    vi.advanceTimersByTime(160);
    expect(open).toBe(false);
    expect(pilot.frame.tree.nodes.has("theme-content")).toBe(false);
    expect(commands.at(-1)).toEqual({ type: "dismiss", targetId: "theme-content" });
    pilot.dispose();
    vi.useRealTimers();
  });

  it("uses the root theme activation blink count", async () => {
    vi.useFakeTimers();
    const view = () => (
      <Root id="root"><Button id="save" focused><Text>Save</Text></Button></Root>
    );
    const disabled = createTestPilot({
      viewport: { width: 12, height: 1 },
      render: view,
      feedback: { activationBlinkCount: 0 },
    });
    await disabled.pointerDown({ x: 1, y: 0 });
    await disabled.pointerUp({ x: 1, y: 0 });
    expect(disabled.frame.tree.nodes.get("save")?.activationFlash).toBe(false);
    disabled.dispose();

    const single = createTestPilot({
      viewport: { width: 12, height: 1 },
      render: view,
      feedback: { activationBlinkCount: 1 },
    });
    await single.pointerDown({ x: 1, y: 0 });
    await single.pointerUp({ x: 1, y: 0 });
    expect(single.frame.tree.nodes.get("save")?.activationFlash).toBe(true);
    vi.advanceTimersByTime(80);
    expect(single.frame.tree.nodes.get("save")?.activationFlash).toBe(false);
    vi.advanceTimersByTime(160);
    expect(single.frame.tree.nodes.get("save")?.activationFlash).toBe(false);
    single.dispose();
    vi.useRealTimers();
  });

  it("exposes the complete transient press lifecycle without product state", async () => {
    vi.useFakeTimers();
    let focusedId = "save";
    let activations = 0;
    const pilot = createTestPilot({
      viewport: { width: 12, height: 1 },
      render: () => (
        <Root id="root" style={{ direction: "row" }}>
          <Button id="save" focused={focusedId === "save"}><Text>Save</Text></Button>
        </Root>
      ),
      onCommand: (command) => {
        if (command.type === "focus") focusedId = command.targetId;
        if (command.type === "activate") activations += 1;
      },
    });

    await pilot.pointerDown({ x: 1, y: 0 });
    expect(pilot.frame.tree.nodes.get("save")?.pressActive).toBe(true);
    expect(pilot.inspect({ x: 1, y: 0 }).cell?.style).toMatchObject({
      color: "#000000",
      backgroundColor: "#FFFFFF",
    });
    await pilot.pointerMove({ x: 10, y: 0 });
    expect(pilot.frame.tree.nodes.get("save")?.pressActive).toBe(false);
    await pilot.pointerMove({ x: 1, y: 0 });
    expect(pilot.frame.tree.nodes.get("save")?.pressActive).toBe(true);
    await pilot.pointerUp({ x: 1, y: 0 });
    expect(pilot.frame.tree.nodes.get("save")?.pressActive).toBe(false);
    expect(pilot.frame.tree.nodes.get("save")?.activationFlash).toBe(true);
    expect(activations).toBe(1);
    vi.advanceTimersByTime(79);
    expect(pilot.frame.tree.nodes.get("save")?.activationFlash).toBe(true);
    vi.advanceTimersByTime(1);
    expect(pilot.frame.tree.nodes.get("save")?.activationFlash).toBe(false);
    vi.advanceTimersByTime(80);
    expect(pilot.frame.tree.nodes.get("save")?.activationFlash).toBe(true);
    vi.advanceTimersByTime(80);
    expect(pilot.frame.tree.nodes.get("save")?.activationFlash).toBe(false);

    await pilot.keyDown(" ", { code: "Space" });
    expect(pilot.frame.tree.nodes.get("save")?.pressActive).toBe(true);
    expect(activations).toBe(2);
    await pilot.keyUp(" ", { code: "Space" });
    expect(pilot.frame.tree.nodes.get("save")?.pressActive).toBe(false);
    expect(pilot.frame.tree.nodes.get("save")?.activationFlash).toBe(true);
    expect(activations).toBe(2);
    vi.advanceTimersByTime(80);
    expect(pilot.frame.tree.nodes.get("save")?.activationFlash).toBe(false);
    vi.advanceTimersByTime(80);
    expect(pilot.frame.tree.nodes.get("save")?.activationFlash).toBe(true);
    vi.advanceTimersByTime(80);
    expect(pilot.frame.tree.nodes.get("save")?.activationFlash).toBe(false);
    pilot.dispose();
    vi.useRealTimers();
  });

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

  it("replays key phases and repeat without duplicate activation", async () => {
    const commands: WidgetCommand[] = [];
    const pilot = createTestPilot({
      viewport: { width: 12, height: 1 },
      render: () => (
        <Root><List><ListItem id="open" focused><Text>Open</Text></ListItem></List></Root>
      ),
      onCommand: (command) => commands.push(command),
    });

    await pilot.pressKey("Enter", { code: "Enter" });
    expect(commands).toEqual([{ type: "activate", targetId: "open" }]);
    await pilot.keyDown("Enter", { repeat: true });
    await pilot.keyUp("Enter");
    expect(commands).toHaveLength(1);
    pilot.dispose();
  });
});
