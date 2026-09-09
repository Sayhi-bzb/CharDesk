import { describe, expect, it } from "vitest";
import {
  CellUiRuntime,
  EventManager,
  List,
  ListItem,
  Root,
  Text,
  type CellEventHandlerMap,
} from "./index.js";

const renderFrame = (showItem = true) => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 3 } });
  const frame = runtime.render(
    <Root id="root">
      <List id="list">
        {showItem ? <ListItem id="item"><Text>Open</Text></ListItem> : null}
      </List>
    </Root>
  );
  return { runtime, frame };
};

describe("EventManager", () => {
  it("dispatches capture root-to-target and bubble target-to-root", () => {
    const { runtime, frame } = renderFrame();
    const events = new EventManager();
    const order: string[] = [];
    const handlers: CellEventHandlerMap = new Map([
      ["root", {
        capture: (event) => order.push(`${event.currentTargetId}:${event.phase}`),
        bubble: (event) => order.push(`${event.currentTargetId}:${event.phase}`),
      }],
      ["list", {
        capture: (event) => order.push(`${event.currentTargetId}:${event.phase}`),
        bubble: (event) => order.push(`${event.currentTargetId}:${event.phase}`),
      }],
      ["item", {
        capture: (event) => order.push(`${event.currentTargetId}:${event.phase}`),
        bubble: (event) => order.push(`${event.currentTargetId}:${event.phase}`),
      }],
    ]);

    const result = events.dispatch(frame, {
      type: "pointer-down",
      pointerId: 1,
      point: { x: 3, y: 0 },
    }, handlers);

    expect(result.path).toEqual(["item/text[0]", "item", "list", "root"]);
    expect(order).toEqual([
      "root:capture",
      "list:capture",
      "item:capture",
      "item:bubble",
      "list:bubble",
      "root:bubble",
    ]);
    runtime.dispose();
  });

  it("stops propagation without conflating it with preventDefault", () => {
    const { runtime, frame } = renderFrame();
    const events = new EventManager();
    const order: string[] = [];
    const handlers: CellEventHandlerMap = new Map([
      ["root", { capture: () => { order.push("root"); } }],
      ["list", { capture: (event) => {
        order.push("list");
        event.preventDefault();
        event.stopPropagation();
      } }],
      ["item", { bubble: () => { order.push("item"); } }],
    ]);

    const result = events.dispatch(frame, {
      type: "pointer-down",
      pointerId: 2,
      point: { x: 1, y: 0 },
    }, handlers);

    expect(order).toEqual(["root", "list"]);
    expect(result).toMatchObject({
      defaultPrevented: true,
      propagationStopped: true,
    });
    runtime.dispose();
  });

  it("keeps pointer capture outside hit bounds and cancels it on unmount", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 12, height: 3 } });
    const render = (showItem: boolean) => runtime.render(
      <Root id="root">
        <List id="list">
          {showItem ? <ListItem id="item"><Text>Open</Text></ListItem> : null}
        </List>
      </Root>
    );
    const frame = render(true);
    const events = new EventManager();
    const received: string[] = [];
    const handlers: CellEventHandlerMap = new Map([
      ["item", { bubble: (event) => {
        received.push(event.type);
        if (event.type === "pointer-down") event.capturePointer();
      } }],
    ]);

    events.dispatch(frame, {
      type: "pointer-down",
      pointerId: 7,
      point: { x: 1, y: 0 },
    }, handlers);
    expect(events.capturedTarget(7)).toBe("item");
    const move = events.dispatch(frame, {
      type: "pointer-move",
      pointerId: 7,
      point: { x: 30, y: 30 },
    }, handlers);
    expect(move.targetId).toBe("item");

    expect(events.sync(render(false), handlers)).toEqual([7]);
    expect(events.capturedTarget(7)).toBeNull();
    expect(received).toEqual(["pointer-down", "pointer-move", "pointer-cancel"]);
    runtime.dispose();
  });
});
