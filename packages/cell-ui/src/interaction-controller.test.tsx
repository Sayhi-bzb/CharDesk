import { expect, it } from "vitest";
import { CellInteractionController, type InteractionClock } from "./interaction-controller.js";
import { CellUiRuntime } from "./runtime.js";
import { Button, Root, Select, SelectContent, SelectItem, SelectTrigger, Text } from "./react.js";
import type { WidgetCommand } from "./interaction.js";
import { createKeyInput } from "@chardesk/keyboard";

const manualClock = () => {
  const callbacks = new Set<() => void>();
  const clock: InteractionClock = {
    schedule(callback, delay) {
      expect(delay).toBe(80);
      callbacks.add(callback);
      return () => { callbacks.delete(callback); };
    },
  };
  return { clock, callbacks, tick() {
    const pending = [...callbacks];
    callbacks.clear();
    pending.forEach((callback) => callback());
  } };
};

it("shares key phases, commits once, and owns a cancellable clock without a browser", () => {
  const time = manualClock();
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 } });
  const view = <Root id="root"><Button id="save"><Text>Save</Text></Button></Root>;
  let frame = runtime.render(view);
  const commands: WidgetCommand[] = [];
  const controller = new CellInteractionController(() => {
    frame = runtime.render(view, controller.snapshot);
  }, (command) => commands.push(command), time.clock);
  controller.focus.sync(frame.tree, "save");
  controller.key(frame, createKeyInput({ key: "Enter", phase: "down" }), 2);
  controller.key(frame, createKeyInput({ key: "Enter", phase: "up" }), 2);
  expect(commands.filter((command) => command.type === "activate")).toHaveLength(1);
  expect(controller.snapshot.activationFlashId).toBe("save");
  time.tick();
  expect(controller.snapshot.activationFlashId).toBeNull();
  expect(controller.snapshot.activationTargetId).toBe("save");
  expect(frame.buffer.get(0, 0)?.style.backgroundColor).toBe("#000000");
  time.tick();
  expect(frame.buffer.get(0, 0)?.style.backgroundColor).toBe("#FFFFFF");
  controller.cancel();
  expect(time.callbacks.size).toBe(0);
  time.tick();
  expect(commands).toHaveLength(1);
  runtime.dispose();
});

it("Select commits before confirmation, locks selection, and completes once in both modes", () => {
  for (const count of [0, 2] as const) {
    const time = manualClock();
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 5 } });
    let selected = "apple";
    let open = true;
    const commands: WidgetCommand[] = [];
    const view = () => <Root id="root"><Select id="fruit" label="Fruit">
      <SelectTrigger id="trigger" expanded={open}><Text>{selected}</Text></SelectTrigger>
      {open && <SelectContent id="options">
        <SelectItem id="apple" selected={selected === "apple"}><Text>Apple</Text></SelectItem>
        <SelectItem id="banana" selected={selected === "banana"}><Text>Banana</Text></SelectItem>
      </SelectContent>}
    </Select></Root>;
    let frame = runtime.render(view());
    const controller = new CellInteractionController(() => {
      frame = runtime.render(view(), controller.snapshot);
    }, (command) => {
      commands.push(command);
      if (command.type === "activate") selected = command.targetId;
      if (command.type === "dismiss") open = false;
    }, time.clock);
    controller.commit({ type: "activate", targetId: "banana" }, frame, count);
    expect(selected).toBe("banana");
    expect(open).toBe(count > 0);
    if (count > 0) {
      controller.commit({ type: "activate", targetId: "apple" }, frame, count);
      expect(selected).toBe("banana");
      time.tick(); time.tick(); time.tick();
    }
    expect(open).toBe(false);
    controller.flush();
    expect(commands.map((command) => command.type)).toEqual(["activate", "dismiss"]);
    expect(time.callbacks.size).toBe(0);
    runtime.dispose();
  }
});
