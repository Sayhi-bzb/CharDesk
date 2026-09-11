import { describe, expect, it } from "vitest";
import { resolveWheelInput } from "./interaction.js";
import {
  Box,
  CellUiRuntime,
  FocusManager,
  List,
  ListItem,
  Overlay,
  Root,
  ScrollArea,
  Text,
  commandForInput,
  createKeyInput,
  getScrollRange,
} from "./index.js";

const renderFixture = (scrollY = 0) => {
  const runtime = new CellUiRuntime({ viewport: { width: 20, height: 7 } });
  const frame = runtime.render(
    <Root id="root">
      <List id="actions" label="Actions" style={{ height: 3 }}>
        <ListItem id="new"><Text>New file</Text></ListItem>
        <ListItem id="open" focused selected><Text>Open file</Text></ListItem>
        <ListItem id="save" disabled><Text>Save</Text></ListItem>
      </List>
      <ScrollArea id="files" variant="bordered" scrollY={scrollY} style={{ height: 4 }}>
        <List id="file-list" label="Files">
          {['one', 'two', 'three', 'four'].map((id) => (
            <ListItem id={id} key={id}><Text>{id}</Text></ListItem>
          ))}
        </List>
      </ScrollArea>
    </Root>
  );
  return { runtime, frame };
};

it("consumes wheel at ScrollArea boundaries independently of movement", () => {
  const { runtime, frame } = renderFixture(0);
  const input = { type: "wheel" as const, point: { x: 2, y: 4 }, deltaX: 0, deltaY: -100 };
  expect(resolveWheelInput(frame, input)).toEqual({ consumed: true, command: null });
  expect(resolveWheelInput(frame, { ...input, deltaY: 100 })).toMatchObject({
    consumed: true, command: { type: "scroll", targetId: "files", scrollY: 1 },
  });
  expect(resolveWheelInput(frame, { ...input, point: { x: 2, y: 0 } }))
    .toEqual({ consumed: false, command: null });
  runtime.dispose();
});

it("keeps nested wheel ownership at the innermost scrollable viewport", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 20, height: 5 } });
  const view = (innerHeight: number) => <Root>
    <ScrollArea id="outer" style={{ height: 5 }}>
      <ScrollArea id="inner" style={{ height: 2 }}>
        <Box id="inner-content" style={{ height: innerHeight }}><Text>inner</Text></Box>
      </ScrollArea>
      <Box style={{ height: 10 }}><Text>outer</Text></Box>
    </ScrollArea>
  </Root>;
  const input = { type: "wheel" as const, point: { x: 1, y: 0 }, deltaX: 0, deltaY: -100 };
  const nested = runtime.render(view(6));
  expect(resolveWheelInput(nested, input)).toEqual({ consumed: true, command: null });
  expect(resolveWheelInput(nested, { ...input, deltaY: 100 }).command?.targetId).toBe("inner");
  const fits = runtime.render(view(1));
  expect(resolveWheelInput(fits, { ...input, deltaY: 100 }).command?.targetId).toBe("outer");
  runtime.dispose();
});

describe("cell interaction", () => {
  it("maps pointer and keyboard input to one stable command and skips disabled items", () => {
    const { runtime, frame } = renderFixture();
    const focus = new FocusManager();
    focus.sync(frame.tree, "open");

    expect(commandForInput(createKeyInput({ key: "ArrowDown" }), frame, focus))
      .toEqual({ type: "focus", targetId: "one" });
    expect(commandForInput(createKeyInput({ key: "Enter" }), frame, focus))
      .toEqual({ type: "activate", targetId: "open" });
    expect(commandForInput({
      type: "pointer", phase: "up", point: { x: 3, y: 1 }, button: 0,
    }, frame, focus))
      .toEqual({ type: "activate", targetId: "open" });
    runtime.dispose();
  });

  it("distinguishes key phase, repeat, modifiers, and composition", () => {
    const { runtime, frame } = renderFixture();
    const focus = new FocusManager();
    focus.sync(frame.tree, "open");

    expect(commandForInput(createKeyInput({
      key: "ArrowDown",
      phase: "up",
    }), frame, focus)).toBeNull();
    expect(commandForInput(createKeyInput({
      key: "ArrowDown",
      repeat: true,
    }), frame, focus)).toEqual({ type: "focus", targetId: "one" });
    expect(commandForInput(createKeyInput({
      key: "Enter",
      repeat: true,
    }), frame, focus)).toBeNull();
    expect(commandForInput(createKeyInput({
      key: "ArrowDown",
      modifiers: { ctrl: true },
    }), frame, focus)).toBeNull();
    expect(commandForInput(createKeyInput({
      key: "Enter",
      composing: true,
    }), frame, focus)).toBeNull();
    runtime.dispose();
  });

  it("clamps scroll commands to the Cell content range", () => {
    const { runtime, frame } = renderFixture();
    const focus = new FocusManager();
    focus.sync(frame.tree, "one");
    expect(getScrollRange(frame, "files")).toEqual({
      x: { min: 0, max: 0 },
      y: { min: 0, max: 2 },
    });
    expect(commandForInput(
      { type: "wheel", point: { x: 2, y: 4 }, deltaX: 0, deltaY: 100 },
      frame,
      focus
    )).toEqual({ type: "scroll", targetId: "files", scrollX: 0, scrollY: 1 });
    runtime.dispose();
  });

  it("marks keyboard page scrolls with their focus movement", () => {
    const { runtime, frame } = renderFixture();
    const focus = new FocusManager();
    focus.sync(frame.tree, "one");
    expect(commandForInput(createKeyInput({ key: "PageDown" }), frame, focus))
      .toEqual({
        type: "scroll",
        targetId: "files",
        scrollX: 0,
        scrollY: 2,
        page: { direction: 1, cellCount: 2 },
      });
    runtime.dispose();
  });

  it("reveals an arrow-focused item with the same command", () => {
    const { runtime, frame } = renderFixture();
    const focus = new FocusManager();
    focus.sync(frame.tree, "two");
    expect(commandForInput(createKeyInput({ key: "ArrowDown" }), frame, focus))
      .toEqual({
        type: "focus",
        targetId: "three",
        reveal: { targetId: "files", scrollX: 0, scrollY: 1 },
      });
    runtime.dispose();
  });

  it("projects list semantics from the same frame without DOM-per-cell", () => {
    const { runtime, frame } = renderFixture();
    expect(frame.semantics.nodes).toHaveLength(9);
    expect(frame.semantics.nodes.get("actions")).toMatchObject({
      role: "listbox",
      label: "Actions",
      activeDescendantId: "open",
    });
    expect(frame.semantics.nodes.get("open")).toMatchObject({
      role: "option",
      label: "Open file",
      focused: true,
      selected: true,
      actions: ["focus", "activate"],
    });
    expect(frame.semantics.nodes.get("save")).toMatchObject({
      disabled: true,
      actions: [],
    });
    runtime.dispose();
  });

  it("scopes modal focus, dismisses outside input, and restores the trigger", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 7 } });
    const render = (open: boolean) => runtime.render(
      <Root id="root">
        <List id="launchers" label="Launchers" style={{ height: 1 }}>
          <ListItem id="launcher" focused><Text>Commands</Text></ListItem>
        </List>
        <Box id="clipped" variant="bordered" style={{ width: 8, height: 3 }}>
          <Text>Workspace</Text>
          {open ? (
            <Overlay
              id="palette"
              label="Command palette"
              position={{ x: 3, y: 1 }}
              variant="bordered"
              style={{ width: 14, height: 4 }}
            >
              <List id="commands" label="Commands">
                <ListItem id="command-a" focused><Text>Alpha</Text></ListItem>
                <ListItem id="command-b"><Text>Beta</Text></ListItem>
              </List>
            </Overlay>
          ) : null}
        </Box>
      </Root>
    );
    const focus = new FocusManager();
    const closed = render(false);
    focus.sync(closed.tree, "launcher");
    expect(focus.focusedId).toBe("launcher");

    const opened = render(true);
    focus.sync(opened.tree);
    expect(focus.focusedId).toBe("command-a");
    expect(commandForInput(createKeyInput({ key: "ArrowDown" }), opened, focus))
      .toEqual({ type: "focus", targetId: "command-b" });
    expect(commandForInput(createKeyInput({ key: "Escape" }), opened, focus))
      .toEqual({ type: "dismiss", targetId: "palette" });
    expect(commandForInput(
      { type: "pointer", phase: "down", point: { x: 19, y: 6 }, button: 0 },
      opened,
      focus
    )).toEqual({ type: "dismiss", targetId: "palette" });
    expect(commandForInput(
      { type: "semantic", targetId: "launcher", action: "activate" },
      opened,
      focus
    )).toBeNull();
    expect(opened.semantics.roots).toEqual(["palette"]);
    expect(opened.semantics.nodes.get("palette")).toMatchObject({
      role: "dialog",
      modal: true,
    });

    focus.sync(closed.tree);
    expect(focus.focusedId).toBe("launcher");
    runtime.dispose();
  });
});
