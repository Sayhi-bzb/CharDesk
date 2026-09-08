import { describe, expect, it } from "vitest";
import {
  Box,
  CellUiRuntime,
  FocusManager,
  Root,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Text,
  auditSemanticSnapshot,
  commandForInput,
  createKeyInput,
} from "./index.js";

const selectView = (open: boolean, focusedId = open ? "dark" : "theme-trigger") => (
  <Root id="root">
    <Select id="theme" label="Theme" style={{ width: 20 }}>
      <SelectTrigger
        id="theme-trigger"
        label="Theme"
        expanded={open}
        controlsId={open ? "theme-content" : undefined}
        focused={focusedId === "theme-trigger"}
      ><Text>Dark</Text></SelectTrigger>
      {open ? (
        <SelectContent id="theme-content" label="Theme options">
          <SelectItem id="light" focused={focusedId === "light"}><Text>Light</Text></SelectItem>
          <SelectItem id="dark" focused={focusedId === "dark"} selected><Text>Dark</Text></SelectItem>
          <SelectItem id="system" focused={focusedId === "system"}><Text>System</Text></SelectItem>
        </SelectContent>
      ) : null}
    </Select>
  </Root>
);

describe("Select", () => {
  it("renders a filled trigger and a Cell-anchored listbox with owned chrome", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 8 } });
    const closed = runtime.render(selectView(false), { focusedId: "theme-trigger" });
    expect(closed.buffer.toText({ trimEnd: true }).split("\n")[0])
      .toBe(" Dark              ▾");
    expect(closed.buffer.get(0, 0)).toMatchObject({
      ownerId: "theme-trigger",
      style: { backgroundColor: "#1a1a1a", bold: true },
    });

    const open = runtime.render(selectView(true), { focusedId: "dark" });
    expect(open.buffer.toText({ trimEnd: true }).trimEnd()).toBe([
      " Dark              ▴",
      "┌──────────────────┐",
      "│ Light            │",
      "│ Dark            ✓│",
      "│ System           │",
      "└──────────────────┘",
    ].join("\n"));
    expect(open.scene.entries.get("theme-content")?.layoutBounds)
      .toEqual({ x: 0, y: 1, width: 20, height: 5 });
    expect(open.buffer.get(18, 3)?.ownerId).toBe("dark");
    runtime.dispose();
  });

  it("flips above the trigger when the lower viewport cannot fit the content", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 8 } });
    const frame = runtime.render(
      <Root id="root">
        <Box id="spacer" style={{ height: 6 }} />
        <Select id="theme" style={{ width: 20 }}>
          <SelectTrigger id="theme-trigger" label="Theme" expanded controlsId="theme-content">
            <Text>Dark</Text>
          </SelectTrigger>
          <SelectContent id="theme-content" label="Theme options">
            <SelectItem id="light"><Text>Light</Text></SelectItem>
            <SelectItem id="dark" selected><Text>Dark</Text></SelectItem>
            <SelectItem id="system"><Text>System</Text></SelectItem>
          </SelectContent>
        </Select>
      </Root>,
      { focusedId: "dark" }
    );
    expect(frame.scene.entries.get("theme-trigger")?.layoutBounds.y).toBe(6);
    expect(frame.scene.entries.get("theme-content")?.layoutBounds.y).toBe(1);
    runtime.dispose();
  });

  it("uses one command path for disclosure, navigation, commit, dismiss, and semantics", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 8 } });
    const focus = new FocusManager();
    const closed = runtime.render(selectView(false), { focusedId: "theme-trigger" });
    focus.sync(closed.tree, "theme-trigger");
    expect(commandForInput(createKeyInput({ key: "Enter" }), closed, focus))
      .toEqual({ type: "set-expanded", targetId: "theme-trigger", expanded: true });
    expect(commandForInput(createKeyInput({ key: " " }), closed, focus))
      .toEqual({ type: "set-expanded", targetId: "theme-trigger", expanded: true });
    expect(commandForInput(createKeyInput({ key: "ArrowDown" }), closed, focus))
      .toEqual({ type: "set-expanded", targetId: "theme-trigger", expanded: true });

    const open = runtime.render(selectView(true), { focusedId: "dark" });
    focus.sync(open.tree, "dark");
    expect(commandForInput(createKeyInput({ key: "ArrowDown" }), open, focus))
      .toEqual({ type: "focus", targetId: "system" });
    expect(commandForInput(createKeyInput({ key: "Home" }), open, focus))
      .toEqual({ type: "focus", targetId: "light" });
    focus.apply({ type: "focus", targetId: "system" });
    expect(commandForInput(createKeyInput({ key: "Enter" }), open, focus))
      .toEqual({ type: "activate", targetId: "system" });
    expect(commandForInput(createKeyInput({ key: "Escape" }), open, focus))
      .toEqual({ type: "dismiss", targetId: "theme-content" });
    expect(commandForInput(
      { type: "pointer", phase: "down", point: { x: 23, y: 7 }, button: 0 },
      open,
      focus
    )).toEqual({ type: "dismiss", targetId: "theme-content" });
    expect(commandForInput(
      { type: "semantic", targetId: "system", action: "activate" },
      open,
      focus
    )).toEqual({ type: "activate", targetId: "system" });
    const system = open.scene.entries.get("system")!.layoutBounds;
    expect(commandForInput(
      { type: "pointer", phase: "up", point: { x: system.x, y: system.y }, button: 0 },
      open,
      focus
    )).toEqual({ type: "activate", targetId: "system" });

    expect(open.semantics.nodes.get("theme-trigger")).toMatchObject({
      role: "button",
      expanded: true,
      hasPopup: "listbox",
      controlsId: "theme-content",
      actions: ["focus", "collapse"],
    });
    expect(open.semantics.nodes.get("theme-content")).toMatchObject({ role: "listbox" });
    expect(open.semantics.nodes.get("dark")).toMatchObject({ role: "option", selected: true });
    expect(auditSemanticSnapshot(open.semantics)).toEqual([]);
    focus.sync(closed.tree);
    expect(focus.focusedId).toBe("theme-trigger");
    runtime.dispose();
  });

  it("skips disabled options in collection navigation and semantic actions", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 8 } });
    const frame = runtime.render(
      <Root id="root">
        <Select id="theme" style={{ width: 20 }}>
          <SelectTrigger id="theme-trigger" label="Theme" expanded controlsId="theme-content">
            <Text>Light</Text>
          </SelectTrigger>
          <SelectContent id="theme-content" label="Theme options">
            <SelectItem id="light" focused selected><Text>Light</Text></SelectItem>
            <SelectItem id="unavailable" disabled><Text>Unavailable</Text></SelectItem>
            <SelectItem id="system"><Text>System</Text></SelectItem>
          </SelectContent>
        </Select>
      </Root>,
      { focusedId: "light" }
    );
    const focus = new FocusManager();
    focus.sync(frame.tree, "light");

    expect(commandForInput(createKeyInput({ key: "ArrowDown" }), frame, focus))
      .toEqual({ type: "focus", targetId: "system" });
    expect(frame.semantics.nodes.get("unavailable")).toMatchObject({
      role: "option",
      disabled: true,
      actions: [],
    });
    expect(commandForInput(
      { type: "semantic", targetId: "unavailable", action: "activate" },
      frame,
      focus
    )).toBeNull();
    expect(auditSemanticSnapshot(frame.semantics)).toEqual([]);
    runtime.dispose();
  });
});
