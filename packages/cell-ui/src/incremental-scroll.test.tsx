import { describe, expect, it } from "vitest";
import { Box, Button, CellUiRuntime, Root, ScrollArea, Text, composeScene,
  createSemanticSnapshot, hitTest, paintScene } from "./index.js";
import { Overlay } from "./react.js";

const viewport = { width: 52, height: 8 };
const view = (scrollX: number, scrollY: number, withOverlay = false) => (
  <Root id="root">
    <Box id="columns" style={{ direction: "row", width: 52, height: 8 }}>
      <Box id="static" style={{ width: 20, height: 8 }}>
        <Text id="heading">Controls</Text>
        <Button id="action"><Text>Run</Text></Button>
      </Box>
      <ScrollArea id="moving" scrollX={scrollX} scrollY={scrollY}
        style={{ width: 24, height: 6 }}>
        <Box id="content" style={{ width: 38 }}>
          {Array.from({ length: 12 }, (_, index) => (
            <Text id={`row-${index}`} key={index} style={{ width: 38 }}>
              {`Row ${index}: ${"content ".repeat(4)}`}
            </Text>
          ))}
        </Box>
      </ScrollArea>
      {withOverlay ? <Overlay id="overlay" position={{ x: 0, y: 0 }}><Text>Overlay</Text></Overlay> : null}
    </Box>
  </Root>
);

const expectFullEquivalent = (frame: ReturnType<CellUiRuntime["render"]>) => {
  const fullScene = composeScene(frame.tree, frame.layout, frame.scene.overlayViewport);
  const fullBase = paintScene(frame.tree, fullScene, frame.textLayouts, undefined,
    { layer: "base", viewport: fullScene.viewport });
  const fullOverlay = paintScene(frame.tree, fullScene, frame.textLayouts, undefined,
    { layer: "overlay", viewport: fullScene.overlayViewport });
  expect(frame.scene).toEqual(fullScene);
  expect(frame.semantics).toEqual(createSemanticSnapshot(frame.tree, fullScene,
    frame.revision, frame.semantics.focusedId));
  for (let y = 0; y < frame.scene.viewport.height; y += 1) {
    for (let x = 0; x < frame.scene.viewport.width; x += 1) {
      expect(hitTest(frame.scene, { x, y })).toEqual(hitTest(fullScene, { x, y }));
      expect(frame.baseBuffer.get(x, y)).toEqual(fullBase.get(x, y));
      expect(frame.overlayBuffer.get(x, y)).toEqual(fullOverlay.get(x, y));
    }
  }
};

describe("incremental scroll scene", () => {
  it("reuses an unrelated region while matching full scene and semantics at every offset", () => {
    const runtime = new CellUiRuntime({ viewport });
    let previous = runtime.render(view(0, 0));
    for (const [x, y] of [[0, 1], [2, 2], [8, 7], [0, 0], [50, 50]]) {
      const frame = runtime.render(view(x, y));
      expectFullEquivalent(frame);
      expect(frame.scene.entries.get("heading")).toBe(previous.scene.entries.get("heading"));
      expect(frame.semantics.nodes.get("action")).toBe(previous.semantics.nodes.get("action"));
      expect(frame.invalidation.work.layout).toBe("reused");
      previous = frame;
    }
    runtime.dispose();
  });

  it("matches full computation when nested scroll offsets change together", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 24, height: 7 } });
    const nested = (outerY: number, innerY: number) => (
      <Root id="root">
        <ScrollArea id="outer" scrollY={outerY} style={{ width: 24, height: 7 }}>
          <Text id="before">Before</Text>
          <ScrollArea id="inner" scrollY={innerY} style={{ width: 24, height: 3 }}>
            {Array.from({ length: 8 }, (_, index) =>
              <Text id={`nested-${index}`} key={index}>{`Nested ${index}`}</Text>)}
          </ScrollArea>
          <Text id="after">After</Text>
        </ScrollArea>
      </Root>
    );
    runtime.render(nested(0, 0));
    for (const [outer, inner] of [[1, 1], [2, 4], [0, 2]]) {
      const frame = runtime.render(nested(outer, inner));
      expect(frame.scene).toEqual(composeScene(frame.tree, frame.layout, frame.scene.overlayViewport));
      expect(frame.semantics).toEqual(createSemanticSnapshot(frame.tree, frame.scene,
        frame.revision, frame.semantics.focusedId));
    }
    runtime.dispose();
  });

  it("uses full computation when scrolling affects nearly the whole tree", () => {
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 4 } });
    const large = (scrollY: number) => <Root id="root">
      <ScrollArea id="scroll" scrollY={scrollY} style={{ width: 20, height: 4 }}>
        {Array.from({ length: 40 }, (_, index) => <Text id={`line-${index}`} key={index}>
          {`Line ${index}`}
        </Text>)}
      </ScrollArea>
    </Root>;
    const first = runtime.render(large(0));
    const next = runtime.render(large(1));
    expect(next.scene.entries.get("root")).not.toBe(first.scene.entries.get("root"));
    expect(next.scene).toEqual(composeScene(next.tree, next.layout, next.scene.overlayViewport));
    runtime.dispose();
  });

  it("falls back when portal placement or focus may cross subtree boundaries", () => {
    const runtime = new CellUiRuntime({ viewport });
    runtime.render(view(0, 0, true));
    const portal = runtime.render(view(0, 1, true));
    expectFullEquivalent(portal);
    const focus = runtime.render(view(0, 2, true), { focusedId: "action" });
    expectFullEquivalent(focus);
    runtime.resize({ width: 54, height: 8 });
    expectFullEquivalent(runtime.render(view(0, 2, true), { focusedId: "action" }));
    runtime.dispose();
  });
});
