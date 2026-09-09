import { describe, expect, it } from "vitest";
import {
  Button,
  CellUiRuntime,
  Checkbox,
  PressManager,
  Root,
  Select,
  SelectTrigger,
  Text,
  createKeyInput,
} from "./index.js";

const controls = (disabled = false) => (
  <Root id="root" style={{ direction: "column" }}>
    <Button id="save" disabled={disabled}><Text>Save</Text></Button>
    <Select id="theme" label="Theme">
      <SelectTrigger id="theme-trigger"><Text>Dark</Text></SelectTrigger>
    </Select>
    <Checkbox id="autosave" checked={false} />
  </Root>
);

describe("PressManager", () => {
  it("arms, disarms, rearms, and ends one pointer press", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 30, height: 3 } });
    const frame = runtime.render(controls());
    const save = frame.layout.entries.get("save")!.rect;
    const press = new PressManager();

    expect(press.beginPointer(frame, 1, { x: save.x, y: save.y })).toBe(true);
    expect(press.activeId).toBe("save");
    expect(press.movePointer(frame, 1, { x: 29, y: 2 })).toBe(true);
    expect(press.activeId).toBeNull();
    expect(press.movePointer(frame, 1, { x: save.x + 1, y: save.y })).toBe(true);
    expect(press.activeId).toBe("save");
    expect(press.endPointer(1)).toBe(true);
    expect(press.activeId).toBeNull();
    runtime.dispose();
  });

  it("tracks matching keyboard phases and clears invalid targets", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 30, height: 3 } });
    const frame = runtime.render(controls(), { focusedId: "theme-trigger" });
    const press = new PressManager();
    const down = createKeyInput({ key: "Enter", code: "Enter", phase: "down" });

    expect(press.beginKey(frame, down, "theme-trigger")).toBe(true);
    expect(press.activeId).toBe("theme-trigger");
    expect(press.endKey(createKeyInput({ key: " ", code: "Space", phase: "up" }))).toBe(false);
    expect(press.activeId).toBe("theme-trigger");
    expect(press.endKey(createKeyInput({ key: "Enter", code: "Enter", phase: "up" }))).toBe(true);
    expect(press.activeId).toBeNull();

    expect(press.beginKey(frame, down, "theme-trigger")).toBe(true);
    const removed = runtime.render(
      <Root id="root"><Button id="save"><Text>Save</Text></Button></Root>,
      { focusedId: "save" }
    );
    expect(press.sync(removed)).toBe(true);
    expect(press.activeId).toBeNull();
    runtime.dispose();
  });

  it("ignores disabled controls and unsupported collection items", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 30, height: 3 } });
    const frame = runtime.render(controls(true), { focusedId: "save" });
    const save = frame.layout.entries.get("save")!.rect;
    const press = new PressManager();

    expect(press.beginPointer(frame, 1, { x: save.x, y: save.y })).toBe(false);
    expect(press.beginKey(frame, createKeyInput({ key: "Enter" }), "save")).toBe(false);
    expect(press.activeId).toBeNull();
    runtime.dispose();
  });
});

describe("pressActive paint", () => {
  it("inverts effective colors across each supported control rectangle", () => {
    const cases = [
      ["save", <Button id="save"><Text>Save</Text></Button>],
      ["theme-trigger", (
        <Select id="theme" label="Theme">
          <SelectTrigger id="theme-trigger"><Text>Dark</Text></SelectTrigger>
        </Select>
      )],
      ["autosave", <Checkbox id="autosave" checked={false} />],
    ] as const;

    for (const [id, control] of cases) {
      const runtime = new CellUiRuntime({ viewport: { width: 30, height: 1 } });
      const view = <Root id="root">{control}</Root>;
      const resting = runtime.render(view);
      const pressed = runtime.render(view, { pressActiveId: id });
      const rect = pressed.layout.entries.get(id)!.rect;
      expect(pressed.tree.nodes.get(id)?.pressActive).toBe(true);
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        expect(pressed.buffer.get(x, rect.y)?.style, `${id}:${x}`).toMatchObject({
          color: resting.buffer.get(x, rect.y)?.style.backgroundColor ?? "#FFFFFF",
          backgroundColor: resting.buffer.get(x, rect.y)?.style.color ?? "#000000",
        });
      }
      runtime.dispose();
    }
  });

  it("derives inversion from effective colors for every Button variant and theme", () => {
    for (const variant of ["default", "outline", "ghost"] as const) {
      const runtime = new CellUiRuntime({
        viewport: { width: 20, height: 1 },
        theme: {
          background: "#ffffff",
          foreground: "#000000",
          surfaceStyle: { backgroundColor: "#dddddd" },
        },
      });
      const view = (
        <Root id="root" style={{ direction: "row" }}>
          <Button id="save" variant={variant}><Text>Save</Text></Button>
        </Root>
      );
      const resting = runtime.render(view);
      const pressed = runtime.render(view, { pressActiveId: "save" });
      const rect = pressed.layout.entries.get("save")!.rect;
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        expect(pressed.buffer.get(x, rect.y)?.style, `${variant}:${x}`).toMatchObject({
          color: resting.buffer.get(x, rect.y)?.style.backgroundColor ?? "#ffffff",
          backgroundColor: resting.buffer.get(x, rect.y)?.style.color ?? "#000000",
        });
      }
      runtime.dispose();
    }
  });
});
