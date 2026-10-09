import { expect, it } from "vitest";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent, Text, Box, Button, DragSource, Root } from "./react.js";
import { CellUiRuntime, EventManager, GestureManager, hitTestCell } from "./index.js";
import { validGestureCandidate } from "./pointer.js";

const view = (left = 1, hidden = false, disabled = false) => <Root><Box style={{ width: 12, height: 4 }}>
  <Accordion><AccordionItem id="visibility" expanded={!hidden}><AccordionTrigger><Text>Group</Text></AccordionTrigger><AccordionContent style={{ width: 12, height: 3 }}><DragSource id="source" disabled={disabled} payload={{ type: "item" }} style={{ position: "absolute", left, top: 0, width: 4, height: 1 }}><Button id="tap" label="item" /></DragSource></AccordionContent></AccordionItem></Accordion>
</Box></Root>;

it("active generic drag survives clipping while pending gestures and new hit tests do not", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 4 } });
  try {
    const gestures = new GestureManager(); const candidate = { targetId: "source", kind: "drag" as const, axis: "x" as const };
    gestures.begin(1, { x: 2, y: 1 }, [{ targetId: "tap", kind: "tap" }, candidate]);
    gestures.move(1, { x: 4, y: 1 });
    const clipped = runtime.render(view(-20));
    expect(clipped.scene.entries.get("source")?.paintVisible).toBe(false);
    expect(validGestureCandidate(clipped, candidate)).toBe(false);
    expect(validGestureCandidate(clipped, candidate, true)).toBe(true);
    expect(gestures.sync((item, active) => validGestureCandidate(clipped, item, active))).toEqual([]);
    expect(hitTestCell(clipped.scene, { x: 2, y: 1 })?.ownerId).not.toBe("source");
    expect(gestures.end(1, { x: 7, y: 1 })[0]?.phase).toBe("end");
    expect(validGestureCandidate(runtime.render(view(-20, true)), candidate, true)).toBe(false);
    expect(validGestureCandidate(runtime.render(view(-20, false, true)), candidate, true)).toBe(false);
    expect(validGestureCandidate(runtime.render(<Root />), candidate, true)).toBe(false);
  } finally { runtime.dispose(); }
});

it("capture transfers to the drag owner; clipping retains it and disabling terminates it", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 4 } });
  try {
    const events = new EventManager(); const frame = runtime.render(view());
    events.dispatch(frame, { type: "pointer-down", pointerId: 1, point: { x: 2, y: 1 } }, new Map([["tap", { bubble: (event) => event.capturePointer() }]]));
    expect(events.capturedTarget(1)).toBe("tap");
    expect(events.captureDrag(frame, 1, "source", { x: 4, y: 1 })).toBe(true);
    expect(events.capturedTarget(1)).toBe("source");
    expect(events.sync(runtime.render(view(-20)))).toEqual([]);
    expect(events.sync(runtime.render(view(-20, false, true)))).toEqual([1]);
    expect(events.capturedTarget(1)).toBe(null);
  } finally { runtime.dispose(); }
});

it("winner sync ignores already-cancelled recognizers and reports active lifecycle", () => {
  const gestures = new GestureManager(); const drag = { targetId: "source", kind: "drag" as const };
  gestures.begin(1, { x: 0, y: 1 }, [{ targetId: "tap", kind: "tap" }, drag]);
  const phases: boolean[] = [];
  gestures.sync((_candidate, active) => { phases.push(active); return true; });
  expect(phases).toEqual([false, false]);
  gestures.move(1, { x: 2, y: 1 });
  expect(gestures.sync((candidate, active) => candidate === drag && active)).toEqual([]);
  expect(gestures.sync(() => false)).toEqual([1]);
  expect(gestures.end(1, { x: 2, y: 1 })).toEqual([]);
});
