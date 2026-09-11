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
  ScrollArea,
  Text,
  auditSemanticSnapshot,
  commandForInput,
  createKeyInput,
} from "./index.js";
import { dismissCommandForFocusExit, topDismissableScopeId } from "./interaction.js";

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
  it("renders a filled trigger and a raised borderless listbox by default", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 8 } });
    const closed = runtime.render(selectView(false), { focusedId: "theme-trigger" });
    expect(closed.buffer.toText({ trimEnd: true }).split("\n")[0])
      .toBe(" Dark              ▾");
    expect(closed.buffer.get(0, 0)).toMatchObject({
      ownerId: "theme-trigger",
      style: { backgroundColor: "#000000" },
    });

    const open = runtime.render(selectView(true), { focusedId: "dark" });
    expect(open.buffer.toText({ trimEnd: true }).trimEnd()).toBe([
      " Dark              ▴",
      " Light",
      " Dark              ✓",
      " System",
    ].join("\n"));
    expect(open.scene.entries.get("theme-content")?.layoutBounds)
      .toEqual({ x: 0, y: 1, width: 20, height: 3 });
    expect(open.tree.nodes.get("theme-content")?.blockVariant).toBe("raised");
    expect(open.buffer.get(18, 1)?.style.backgroundColor).toBe("#E6E6E6");
    expect(open.buffer.get(18, 2)?.ownerId).toBe("dark");
    expect(open.buffer.get(18, 3)?.style.backgroundColor).toBe("#E6E6E6");
    runtime.dispose();
  });

  it("lets SelectContent add border layout and chrome explicitly", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 8 } });
    const frame = runtime.render(
      <Root id="root">
        <Select id="theme" style={{ width: 20 }}>
          <SelectTrigger id="theme-trigger" label="Theme" expanded controlsId="theme-content">
            <Text>Dark</Text>
          </SelectTrigger>
          <SelectContent id="theme-content" label="Theme options" variant="bordered">
            <SelectItem id="light"><Text>Light</Text></SelectItem>
            <SelectItem id="dark" selected><Text>Dark</Text></SelectItem>
            <SelectItem id="system"><Text>System</Text></SelectItem>
          </SelectContent>
        </Select>
      </Root>,
      { focusedId: "dark" },
    );

    expect(frame.layout.entries.get("theme-content")).toMatchObject({
      rect: { x: 0, y: 0, width: 20, height: 5 },
      borderInsets: { top: 1, right: 1, bottom: 1, left: 1 },
    });
    expect(frame.scene.entries.get("theme-content")?.layoutBounds)
      .toEqual({ x: 0, y: 1, width: 20, height: 5 });
    expect(frame.buffer.toText({ trimEnd: true }).trimEnd()).toBe([
      " Dark              ▴",
      "┌──────────────────┐",
      "│ Light            │",
      "│ Dark            ✓│",
      "│ System           │",
      "└──────────────────┘",
    ].join("\n"));
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
    expect(frame.scene.entries.get("theme-content")?.layoutBounds.y).toBe(3);
    runtime.dispose();
  });

  it("constrains to the larger side, keeps the trigger visible, and scrolls internally", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 7 } });
    const view = (scrollY: number) => (
      <Root id="root">
        <Box id="spacer" style={{ height: 2 }} />
        <Select id="theme" style={{ width: 20 }}>
          <SelectTrigger id="theme-trigger" label="Theme" expanded controlsId="theme-content">
            <Text>Maple</Text>
          </SelectTrigger>
          <SelectContent id="theme-content" label="Theme options" scrollY={scrollY}>
            {Array.from({ length: 6 }, (_, index) => (
              <SelectItem id={`font-${index}`} key={index} selected={index === 5}>
                <Text>{`Font ${index}`}</Text>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Root>
    );
    const frame = runtime.render(view(0), { focusedId: "font-0" });
    const trigger = frame.scene.entries.get("theme-trigger")!.layoutBounds;
    const content = frame.scene.entries.get("theme-content")!;

    expect(trigger).toEqual({ x: 0, y: 2, width: 20, height: 1 });
    expect(content.layoutBounds).toEqual({ x: 0, y: 3, width: 20, height: 4 });
    expect(content.layoutBounds.y).toBeGreaterThanOrEqual(trigger.y + trigger.height);
    expect(content.scrollMetrics).toMatchObject({
      horizontalTrack: null,
      maxOffset: { x: 0, y: 2 },
    });
    expect(content.scrollMetrics?.verticalTrack).not.toBeNull();
    expect(frame.buffer.toText({ trimEnd: true }).split("\n")[2]).toContain("Maple");

    const focus = new FocusManager();
    focus.sync(frame.tree, "font-0");
    const end = commandForInput(createKeyInput({ key: "End" }), frame, focus);
    expect(end).toMatchObject({
      type: "focus",
      targetId: "font-5",
      reveal: { targetId: "theme-content", scrollY: 2 },
    });
    expect(commandForInput(
      { type: "wheel", point: { x: 2, y: 4 }, deltaX: 0, deltaY: 1 },
      frame,
      focus
    )).toEqual({ type: "scroll", targetId: "theme-content", scrollX: 0, scrollY: 1 });

    const scrolled = runtime.render(view(2), { focusedId: "font-5" });
    expect(scrolled.buffer.toText({ trimEnd: true })).toContain("Font 5");
    expect(scrolled.buffer.toText({ trimEnd: true })).toContain("✓█");
    expect(scrolled.buffer.toText({ trimEnd: true })).not.toMatch(/[┌┐└┘│─]/u);
    expect(scrolled.buffer.toText({ trimEnd: true }).split("\n")[2]).toContain("Maple");
    runtime.dispose();
  });

  it("excludes portaled SelectContent from ancestor ScrollArea measurement", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 7 } });
    const view = (open: boolean) => (
      <Root id="root">
        <ScrollArea id="properties" style={{ width: 20, height: 7 }}>
          <Select id="theme" style={{ width: 15 }}>
            <SelectTrigger id="theme-trigger" label="Theme" expanded={open} controlsId={open ? "theme-content" : undefined}>
              <Text>Maple</Text>
            </SelectTrigger>
            {open ? (
              <SelectContent id="theme-content" label="Theme options">
                {Array.from({ length: 10 }, (_, index) => (
                  <SelectItem id={`theme-${index}`} key={index}><Text>{`Theme ${index}`}</Text></SelectItem>
                ))}
              </SelectContent>
            ) : null}
          </Select>
        </ScrollArea>
      </Root>
    );
    const closed = runtime.render(view(false));
    const closedMetrics = closed.scene.entries.get("properties")!.scrollMetrics!;
    const open = runtime.render(view(true));
    const openMetrics = open.scene.entries.get("properties")!.scrollMetrics!;

    expect(openMetrics.contentSize).toEqual(closedMetrics.contentSize);
    expect(openMetrics.verticalTrack).toEqual(closedMetrics.verticalTrack);
    expect(open.scene.entries.get("theme-content")!.scrollMetrics?.verticalTrack).not.toBeNull();
    runtime.dispose();
  });

  it("renders a full dropdown on an overlay viewport without resizing the base plane", () => {
    const runtime = new CellUiRuntime({
      viewport: { width: 24, height: 7 },
      overlayViewport: { width: 24, height: 12 },
    });
    const frame = runtime.render(
      <Root id="root">
        <Box style={{ height: 3 }} />
        <Select id="size" style={{ width: 15 }}>
          <SelectTrigger id="size-trigger" label="Size" expanded controlsId="size-content">
            <Text>default</Text>
          </SelectTrigger>
          <SelectContent id="size-content" label="Size options">
            <SelectItem id="default" selected><Text>default</Text></SelectItem>
            <SelectItem id="sm"><Text>sm</Text></SelectItem>
            <SelectItem id="lg"><Text>lg</Text></SelectItem>
          </SelectContent>
        </Select>
      </Root>
    );

    expect(frame.scene.viewport).toEqual({ x: 0, y: 0, width: 24, height: 7 });
    expect(frame.scene.overlayViewport).toEqual({ x: 0, y: 0, width: 24, height: 12 });
    expect(frame.baseBuffer.height).toBe(7);
    expect(frame.overlayBuffer.height).toBe(12);
    expect(frame.buffer.height).toBe(12);
    expect(frame.overlayPlanes).toEqual([{
      rootId: "size-content",
      bounds: { x: 0, y: 4, width: 15, height: 3 },
      layer: 1,
      paintOrder: 5,
    }]);
    expect(frame.scene.entries.get("size-content")?.scrollMetrics?.verticalTrack).toBeNull();
    expect(frame.buffer.toText({ trimEnd: true })).toContain([
      " default      ✓",
      " sm",
      " lg",
    ].join("\n"));
    expect(frame.overlayBuffer.toText({ trimEnd: true })).not.toMatch(/[┌┐└┘│─]/u);
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
    expect(topDismissableScopeId(open.tree)).toBe("theme-content");
    expect(dismissCommandForFocusExit(open))
      .toEqual({ type: "dismiss", targetId: "theme-content" });
    expect(dismissCommandForFocusExit(closed)).toBeNull();
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
