import { expect, it } from "vitest";
import { CellInteractionController, type InteractionClock } from "./interaction-controller.js";
import { CellUiRuntime } from "./runtime.js";
import { Button, Root, Select, SelectContent, SelectItem, SelectTrigger, Text, Toggle, RadioGroup, RadioItem, Menu, MenuItem } from "./react.js";
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

it.each(["complete", "instant", "escape", "blur", "outside", "external-focus", "disabled", "unmount", "config"])("menu defers execution and handles %s without replay", (outcome) => {
  const time = manualClock();
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 3 } });
  let disabled = false;
  let mounted = true;
  const view = () => <Root>{mounted && <Menu id="menu" style={{ width: 8 }}>
    <MenuItem id="action" disabled={disabled}><Text>Open</Text></MenuItem>
    <MenuItem id="other"><Text>Other</Text></MenuItem>
  </Menu>}<Button id="external"><Text>Next</Text></Button></Root>;
  let frame = runtime.render(view());
  const commands: WidgetCommand[] = [];
  const controller = new CellInteractionController(() => {
    frame = runtime.render(view(), controller.snapshot);
    controller.presented(frame.confirmation);
  }, (command) => commands.push(command), time.clock);
  controller.focus.sync(frame.tree, "action");
  frame = runtime.render(view(), controller.snapshot);
  const count = outcome === "instant" ? 0 : 2;
  controller.key(frame, createKeyInput({ key: "Enter", phase: "down" }), count);
  expect(commands.filter((c) => c.type === "activate")).toHaveLength(count === 0 ? 1 : 0);
  controller.key(frame, createKeyInput({ key: "Enter", phase: "up" }), count);
  if (outcome === "complete") {
    expect(controller.interceptPointer(frame, { x: 1, y: 1 })).toBe(true);
    controller.commit({ type: "activate", targetId: "other" }, frame, count);
    controller.key(frame, createKeyInput({ key: "ArrowDown" }), count);
    for (let phase = 0; phase < 4; phase++) {
      expect(frame.confirmation?.phase).toBe(phase);
      expect(commands.filter((c) => c.type === "activate")).toHaveLength(0);
      time.tick();
    }
  } else if (outcome === "escape") controller.key(frame, createKeyInput({ key: "Escape" }), count);
  else if (outcome === "blur") controller.deactivate();
  else if (outcome === "config") controller.settle();
  else if (outcome === "external-focus") {
    controller.commit({ type: "focus", targetId: "external" }, frame, count);
    expect(controller.focus.focusedId).toBe("external");
  }
  else if (outcome === "outside") expect(controller.interceptPointer(frame, { x: 10, y: 2 })).toBe(false);
  else if (outcome === "disabled" || outcome === "unmount") {
    disabled = outcome === "disabled";
    mounted = outcome !== "unmount";
    frame = runtime.render(view(), controller.snapshot);
    controller.sync(frame);
  }
  time.tick();
  controller.flush();
  controller.flush();
  expect(commands.filter((c) => c.type === "activate")).toEqual(
    outcome === "complete" || outcome === "instant" ? [{ type: "activate", targetId: "action" }] : []);
  expect(time.callbacks.size).toBe(0);
  controller.cancel();
  runtime.dispose();
});

const discreteView = (kind: string) => <Root id="root">{kind === "toggle"
  ? <Toggle id="save" pressed><Text>Save</Text></Toggle>
  : kind === "radio"
    ? <RadioGroup value="save"><RadioItem id="save" value="save"><Text>Save</Text></RadioItem></RadioGroup>
    : <Button id="save"><Text>Save</Text></Button>}</Root>;

it.each(["button", "toggle", "radio"])("%s shares key phases, commits once, and owns a cancellable clock without a browser", (kind) => {
  const time = manualClock();
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 } });
  const view = discreteView(kind);
  let frame = runtime.render(view);
  const commands: WidgetCommand[] = [];
  const controller = new CellInteractionController(() => {
    frame = runtime.render(view, controller.snapshot);
    controller.presented(frame.confirmation);
  }, (command) => commands.push(command), time.clock);
  controller.focus.sync(frame.tree, "save");
  frame = runtime.render(view, controller.snapshot);
  controller.key(frame, createKeyInput({ key: "Enter", phase: "down" }), 2);
  expect(controller.feedback.waiting).toBe(true);
  expect(time.callbacks.size).toBe(0);
  expect(controller.snapshot.activationFlashId).toBeNull();
  controller.key(frame, createKeyInput({ key: "Enter", phase: "down", repeat: true }), 2);
  expect(controller.feedback.waiting).toBe(true);
  const reference = { ...frame.buffer.get(0, 0)!.style };
  controller.key(frame, createKeyInput({ key: "Enter", phase: "up" }), 2);
  expect(commands.filter((command) => command.type === "activate")).toHaveLength(1);
  expect(controller.snapshot.activationFlashId).toBe("save");
  time.tick();
  expect(controller.snapshot.activationFlashId).toBeNull();
  expect(controller.snapshot.activationTargetId).toBe("save");
  expect(frame.buffer.get(0, 0)?.style.backgroundColor).toBe(reference.backgroundColor);
  time.tick();
  expect(frame.buffer.get(0, 0)?.style.backgroundColor).toBe(reference.color);
  controller.cancel();
  expect(time.callbacks.size).toBe(0);
  time.tick();
  expect(commands).toHaveLength(1);
  runtime.dispose();
});

it.each(["button", "toggle", "radio"].flatMap((kind) => [0, 1, 2, 3].map((count) => ({ kind, count }))))("$kind requires presentation of all $count complete cycles", ({ kind, count }) => {
  const time = manualClock();
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 } });
  const view = discreteView(kind);
  let frame = runtime.render(view, { focusedId: "save" });
  const reference = { ...frame.buffer.get(0, 0)!.style };
  const controller = new CellInteractionController(() => {
    frame = runtime.render(view, controller.snapshot);
  }, () => undefined, time.clock);
  controller.commit({ type: "activate", targetId: "save" }, frame, count);
  for (let phase = 0; phase < count * 2; phase++) {
    expect(time.callbacks.size).toBe(0);
    time.tick(); // unpublished/unacknowledged phases cannot be skipped
    const presentation = frame.confirmation!;
    expect(presentation.phase).toBe(phase);
    expect(frame.buffer.get(0, 0)?.style.backgroundColor).toBe(phase % 2 === 0 ? reference.color : reference.backgroundColor);
    controller.presented(presentation);
    controller.presented(presentation);
    expect(time.callbacks.size).toBe(1);
    time.tick();
  }
  expect(controller.feedback.running).toBe(false);
  expect(frame.confirmation).toBeUndefined();
  expect(time.callbacks.size).toBe(0);
  runtime.dispose();
});

it("ignores old presentation acknowledgements and callbacks after replacement", () => {
  const time = manualClock();
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 1 } });
  const view = <Root id="root"><Button id="save"><Text>Save</Text></Button></Root>;
  let frame = runtime.render(view);
  const controller = new CellInteractionController(() => {
    frame = runtime.render(view, controller.snapshot);
  }, () => undefined, time.clock);
  controller.commit({ type: "activate", targetId: "save" }, frame, 2);
  const old = frame.confirmation!;
  controller.presented(old);
  const lateCallback = [...time.callbacks][0]!;
  controller.commit({ type: "activate", targetId: "save" }, frame, 2);
  const current = frame.confirmation!;
  expect(current.sessionId).not.toBe(old.sessionId);
  controller.presented(old);
  lateCallback();
  expect(time.callbacks.size).toBe(0);
  expect(controller.snapshot.confirmation?.phase).toBe(0);
  controller.presented(current);
  expect(time.callbacks.size).toBe(1);
  lateCallback();
  controller.cancel();
  expect(time.callbacks.size).toBe(0);
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
      controller.presented(frame.confirmation);
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
      expect(open).toBe(true);
      time.tick();
    }
    expect(open).toBe(false);
    controller.flush();
    expect(commands.map((command) => command.type)).toEqual(["activate", "dismiss"]);
    expect(time.callbacks.size).toBe(0);
    runtime.dispose();
  }
});

it("does not deliver dismissal into an unmounted scope", () => {
  const time = manualClock();
  const runtime = new CellUiRuntime({ viewport: { width: 20, height: 5 } });
  const commands: WidgetCommand[] = [];
  const frame = runtime.render(<Root id="root"><Select id="fruit" label="Fruit">
    <SelectTrigger id="trigger" expanded><Text>Fruit</Text></SelectTrigger>
    <SelectContent id="options"><SelectItem id="apple"><Text>Apple</Text></SelectItem></SelectContent>
  </Select></Root>);
  const controller = new CellInteractionController(() => undefined, (command) => commands.push(command), time.clock);
  controller.commit({ type: "activate", targetId: "apple" }, frame, 2);
  controller.sync(runtime.render(null));
  controller.flush();
  time.tick();
  expect(commands.map((command) => command.type)).toEqual(["activate"]);
  expect(time.callbacks.size).toBe(0);
  runtime.dispose();
});
