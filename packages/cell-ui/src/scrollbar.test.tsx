import { expect, it } from "vitest";
import { thumbAxis, thumbCellSpan, thumbGlyph } from "./scrollbar.js";
import { Button, CellUiRuntime, Root, Box, ScrollArea, Text, createTestPilot } from "./index.js";
import { gestureCandidatesForFrame } from "./pointer.js";
import { getEventPath } from "./scene.js";
import { scrollViewportCommands } from "./scroll.js";

it("half-Cell geometry is monotonic, aligned at endpoints, and retains exact coverage", () => {
  for (const track of [1, 2, 5, 11]) {
    for (const content of [track + 1, track * 7, 1000]) {
      let last = 0;
      for (let offset = 0; offset <= content - track; offset++) {
        const thumb = thumbAxis(track, track, content, offset);
        expect(thumb.start).toBeGreaterThanOrEqual(last);
        expect(thumb.start + thumb.length).toBeLessThanOrEqual(track * 2);
        const span = thumbCellSpan(thumb);
        expect(Number.isInteger(span.start) && Number.isInteger(span.length)).toBe(true);
        last = thumb.start;
      }
      const end = thumbAxis(track, track, content, content - track);
      expect(end.start + end.length).toBe(track * 2);
    }
  }
  const thumb = { start: 1, length: 4 };
  expect([0, 1, 2].map((cell) => thumbGlyph(thumb, cell, false))).toEqual(["▄", "█", "▀"]);
  expect([0, 1, 2].map((cell) => thumbGlyph(thumb, cell, true))).toEqual(["▐", "█", "▌"]);
});

it("half-Cell thumb movement repaints exactly like a fresh frame", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 8, height: 7 } });
  const view = (scrollY: number) => <Root><ScrollArea id="scroll" frame="bordered" scrollY={scrollY} style={{ width: 8, height: 7 }}><Box style={{ height: 20 }} /></ScrollArea></Root>;
  for (let offset = 0; offset <= 15; offset++) {
    const frame = runtime.render(view(offset));
    const fresh = new CellUiRuntime({ viewport: { width: 8, height: 7 } });
    const oracle = fresh.render(view(offset));
    for (let y = 0; y < 7; y++) for (let x = 0; x < 8; x++) expect(frame.buffer.get(x, y)).toEqual(oracle.buffer.get(x, y));
    fresh.dispose();
  }
  runtime.dispose();
});

it("precise dragging accumulates small moves, reverses without drift, and cancels on resize", async () => {
  let scrollY = 0;
  let height = 10;
  const pilot = createTestPilot({
    viewport: { width: 8, height: 12 },
    render: () => <Root><ScrollArea id="scroll" scrollY={scrollY} style={{ width: 8, height }}><Box style={{ height: 100 }} /></ScrollArea></Root>,
    onCommand: (command) => { if (command.type === "scroll") scrollY = command.scrollY; },
  });
  await pilot.pointerDown({ x: 7, y: 0 }, 1, { x: 7.5, y: 0.1 });
  for (const y of [0.2, 0.4]) await pilot.pointerMove({ x: 7, y: Math.floor(y) }, 1, { x: 7.5, y });
  expect(scrollY).toBe(0);
  for (const y of [0.6, 0.7, 0.8, 0.9, 1.1]) await pilot.pointerMove({ x: 7, y: Math.floor(y) }, 1, { x: 7.5, y });
  expect(scrollY).toBe(10);
  await pilot.pointerMove({ x: 7, y: 0 }, 1, { x: 7.5, y: 0.1 });
  expect(scrollY).toBe(0);
  height = 8;
  await pilot.resize({ width: 8, height: 12 });
  await pilot.pointerMove({ x: 7, y: 5 }, 1, { x: 7.5, y: 5.1 });
  expect(scrollY).toBe(0);
  pilot.dispose();
});

it("horizontal dragging uses the same anchor and applies the final pointer-up position", async () => {
  let scrollX = 0;
  const pilot = createTestPilot({
    viewport: { width: 10, height: 5 },
    render: () => <Root><ScrollArea id="scroll" scrollX={scrollX} style={{ width: 10, height: 5 }}><Box style={{ width: 100, height: 1 }} /></ScrollArea></Root>,
    onCommand: (command) => { if (command.type === "scroll") scrollX = command.scrollX; },
  });
  await pilot.pointerDown({ x: 0, y: 4 }, 1, { x: 0.1, y: 4.5 });
  await pilot.pointerMove({ x: 0, y: 4 }, 1, { x: 0.6, y: 4.5 });
  expect(scrollX).toBe(5);
  await pilot.pointerUp({ x: 1, y: 4 }, 1, { x: 1.1, y: 4.5 });
  expect(scrollX).toBe(10);
  pilot.dispose();
});

it("the uncovered half of an edge Cell pages instead of capturing the thumb", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 8, height: 5 } });
  const frame = runtime.render(<Root><ScrollArea id="scroll" style={{ width: 8, height: 5 }}><Box style={{ height: 16 }} /></ScrollArea></Root>);
  const path = getEventPath(frame.scene, "scroll");
  const point = { x: 7, y: 1 };
  expect(gestureCandidatesForFrame(frame, path, point, { x: 7.5, y: 1.25 }).some((item) => item.kind === "drag")).toBe(true);
  expect(gestureCandidatesForFrame(frame, path, point, { x: 7.5, y: 1.75 }).some((item) => item.kind === "drag")).toBe(false);
  runtime.dispose();
});

it("offers a drag gesture only on axes with actual scroll range", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 5 } });
  const candidates = (width: number, height: number) => {
    const frame = runtime.render(<Root><ScrollArea id="scroll" style={{ width: 12, height: 5 }}>
      <Box style={{ width, height }}><Button id="save"><Text>Save</Text></Button></Box>
    </ScrollArea></Root>);
    return gestureCandidatesForFrame(frame, getEventPath(frame.scene, "save"), { x: 1, y: 0 });
  };
  expect(candidates(10, 1)).toMatchObject([{ targetId: "save", kind: "tap", rearmable: true }]);
  expect(candidates(10, 8).find((candidate) => candidate.kind === "scroll")?.axis).toBe("y");
  expect(candidates(20, 1).find((candidate) => candidate.kind === "scroll")?.axis).toBe("x");
  runtime.dispose();
});

it("lets an overflowing parent own drag when its nested scroll area fits", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 5 } });
  const frame = runtime.render(<Root><ScrollArea id="outer" style={{ width: 12, height: 5 }}>
    <ScrollArea id="inner" style={{ width: 10, height: 2 }}>
      <Button id="save"><Text>Save</Text></Button>
    </ScrollArea>
    <Box style={{ height: 8 }} />
  </ScrollArea></Root>);
  expect(gestureCandidatesForFrame(frame, getEventPath(frame.scene, "save"), { x: 1, y: 0 })
    .find((candidate) => candidate.kind === "scroll")).toMatchObject({ targetId: "outer", axis: "y" });
  runtime.dispose();
});

it("clamps stale offsets when scroll content shrinks", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 5 } });
  const view = (height: number) => <Root><ScrollArea id="scroll" scrollY={5} style={{ width: 12, height: 5 }}>
    <Box style={{ height }}><Text id="content">content</Text></Box>
  </ScrollArea></Root>;
  runtime.render(view(10));
  const shrunk = runtime.render(view(1));
  expect(shrunk.scene.entries.get("content")?.paintVisible).toBe(true);
  expect(shrunk.scene.entries.get("scroll")?.scrollMetrics?.verticalTrack).toBeNull();
  expect(scrollViewportCommands(shrunk)).toEqual([{ type: "scroll", targetId: "scroll", scrollX: 0, scrollY: 0 }]);
  runtime.dispose();
});

it("does not infer horizontal overflow when explicit content fits beside a vertical rail", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 8, height: 5 } });
  const frame = runtime.render(
    <Root>
      <ScrollArea id="scroll" style={{ width: 8, height: 5 }}>
        <Box style={{ width: 7, height: 10 }} />
      </ScrollArea>
    </Root>
  );
  const metrics = frame.scene.entries.get("scroll")!.scrollMetrics!;

  expect(metrics.verticalTrack).not.toBeNull();
  expect(metrics.horizontalTrack).toBeNull();
  expect(metrics.viewport).toEqual({ x: 0, y: 0, width: 7, height: 5 });
  expect(metrics.contentSize).toEqual({ width: 7, height: 10 });
  runtime.dispose();
});
