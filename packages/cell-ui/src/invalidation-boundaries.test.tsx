import { describe, expect, it } from "vitest";
import { Box, Button, CellUiRuntime, Root, ScrollArea, Text } from "./index.js";
import { Overlay } from "./react.js";

const viewport = { width: 80, height: 24 };

const sameCells = (actual: ReturnType<CellUiRuntime["render"]>, expected: ReturnType<CellUiRuntime["render"]>) => {
  for (let y = 0; y < viewport.height; y += 1) for (let x = 0; x < viewport.width; x += 1) {
    expect(actual.buffer.get(x, y)).toEqual(expected.buffer.get(x, y));
  }
  expect({ ...actual.semantics, revision: 0 }).toEqual({ ...expected.semantics, revision: 0 });
};

describe("layout-result invalidation", () => {
  it("repaints a changed fixed-size label without damaging the full viewport", () => {
    const runtime = new CellUiRuntime({ viewport });
    const stable = Array.from({ length: 100 }, (_, index) =>
      <Text id={`right-${index}`} key={index} style={{ height: 1 }}>Right {index}</Text>);
    const view = (label: string) => <Root id="root"><Box style={{ direction: "row" }}>
      <Box style={{ width: 40 }}><Button id="changed" style={{ width: 20 }}><Text>{label}</Text></Button></Box>
      <Box style={{ width: 40 }}><Button id="stable-semantic"><Text>Stable</Text></Button>{stable}</Box>
    </Box></Root>;
    const first = runtime.render(view("A"));
    const changed = runtime.render(view("B"));
    const oracle = new CellUiRuntime({ viewport });
    sameCells(changed, oracle.render(view("B")));
    expect(changed.invalidation.work.layout).toBe("computed");
    expect(changed.scene).toBe(first.scene);
    expect(changed.invalidation.dirtyRegions.reduce((area, region) => area + region.width * region.height, 0))
      .toBeLessThan(viewport.width * viewport.height / 4);
    expect(changed.semantics.nodes.get("changed")?.label).toBe("B");
    expect(changed.semantics.nodes.get("stable-semantic")).toBe(first.semantics.nodes.get("stable-semantic"));
    runtime.dispose();
    oracle.dispose();
  });

  it("damages both old and new positions when wrapping moves a sibling", () => {
    const runtime = new CellUiRuntime({ viewport });
    const view = (label: string) => <Root id="root"><Box style={{ width: 12 }}>
      <Text id="changing">{label}</Text><Text id="following">Following</Text>
    </Box></Root>;
    const first = runtime.render(view("Short"));
    const changed = runtime.render(view("A much longer line that wraps"));
    const oracle = new CellUiRuntime({ viewport });
    sameCells(changed, oracle.render(view("A much longer line that wraps")));
    const oldY = first.scene.entries.get("following")!.paintBounds.y;
    const newY = changed.scene.entries.get("following")!.paintBounds.y;
    expect(newY).toBeGreaterThan(oldY);
    expect(changed.invalidation.dirtyRegions.some((region) => region.y <= oldY && region.y + region.height > oldY))
      .toBe(true);
    expect(changed.invalidation.dirtyRegions.some((region) => region.y <= newY && region.y + region.height > newY))
      .toBe(true);
    runtime.dispose();
    oracle.dispose();
  });

  it("matches a fresh runtime across text, topology, scroll, clipping, and overlay changes", () => {
    const runtime = new CellUiRuntime({ viewport });
    const cases = [
      { order: ["a", "b"], text: "Short", width: 18, scroll: 0, overlay: false },
      { order: ["a", "b"], text: "A longer label that wraps", width: 18, scroll: 0, overlay: false },
      { order: ["b", "a"], text: "A longer label that wraps", width: 18, scroll: 0, overlay: false },
      { order: ["b", "a"], text: "Back", width: 12, scroll: 1, overlay: true },
      { order: ["a", "b"], text: "Back", width: 18, scroll: 0, overlay: false },
    ] as const;
    for (const state of cases) {
      const view = <Root id="root"><Box id="body" style={{ width: 40, height: 8 }}>
        <ScrollArea id="scroll" scrollY={state.scroll} style={{ width: state.width, height: 4 }}>
          {state.order.map((id) => <Button id={id} key={id} style={{ width: state.width }}>
            <Text>{id === "a" ? state.text : "Second"}</Text>
          </Button>)}
        </ScrollArea>
        <Text id="under">Under overlay</Text>
        {state.overlay && <Overlay id="overlay" position={{ x: 1, y: 1 }}
          style={{ width: 15, height: 3 }} frame="bordered"><Text>Floating</Text></Overlay>}
      </Box></Root>;
      const frame = runtime.render(view);
      const oracle = new CellUiRuntime({ viewport });
      const expected = oracle.render(view);
      sameCells(frame, expected);
      expect(frame.layout).toEqual(expected.layout);
      expect(frame.scene).toEqual(expected.scene);
      oracle.dispose();
    }
    runtime.dispose();
  });
});
