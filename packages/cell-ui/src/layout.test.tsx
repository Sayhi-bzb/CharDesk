import { describe, expect, it } from "vitest";
import {
  Box,
  Overlay,
  Root,
  Text,
  YogaLayoutEngine,
  createWidgetDescriptor,
  reconcileWidgetTree,
} from "./index.js";
import type { RootProps } from "./react.js";
import type { ReactElement } from "react";

const treeFor = (element: ReactElement<RootProps>) =>
  reconcileWidgetTree(undefined, createWidgetDescriptor(element)).tree;

const entriesOf = (layout: ReturnType<YogaLayoutEngine["compute"]>) =>
  [...layout.entries].map(([id, entry]) => [id, entry] as const);

describe("YogaLayoutEngine qualification", () => {
  it.each([7, 8, 10, 31])("rounds percentage flex geometry to integer Cells at %i columns", (width) => {
    const engine = new YogaLayoutEngine();
    const layout = engine.compute(treeFor(
      <Root id="root" style={{ direction: "row" }}>
        <Box id="left" style={{ width: "50%", height: 2 }} />
        <Box id="right" style={{ width: "50%", height: 2 }} />
      </Root>
    ), { width, height: 2 });
    const left = layout.entries.get("left")!.rect;
    const right = layout.entries.get("right")!.rect;
    expect([left, right].flatMap((rect) => Object.values(rect)).every(Number.isInteger)).toBe(true);
    expect(left.x).toBe(0);
    expect(right.x).toBe(left.width);
    expect(right.x + right.width).toBe(width);
    engine.dispose();
  });

  it("covers nested flex, gap, padding, border, min/max, absolute position, and reorder", () => {
    const engine = new YogaLayoutEngine();
    const first = treeFor(
      <Root id="root" style={{ direction: "row", gap: 1, padding: 1 }}>
        <Box id="bounded" variant="bordered" style={{ flexGrow: 1, minWidth: 4, maxWidth: 7 }}>
          <Box id="percent" style={{ width: "50%", height: 1 }} />
        </Box>
        <Box id="fixed" style={{ width: 3, height: 2 }} />
        <Overlay id="absolute" position={{ x: 9, y: 3 }} style={{ width: 2, height: 1 }} />
      </Root>
    );
    const initial = engine.compute(first, { width: 16, height: 6 });
    expect(initial.entries.get("root")).toMatchObject({
      borderInsets: { top: 0, right: 0, bottom: 0, left: 0 },
      paddingInsets: { top: 1, right: 1, bottom: 1, left: 1 },
    });
    expect(initial.entries.get("bounded")?.borderInsets)
      .toEqual({ top: 1, right: 1, bottom: 1, left: 1 });
    expect(initial.entries.get("bounded")!.rect.width).toBeGreaterThanOrEqual(4);
    expect(initial.entries.get("bounded")!.rect.width).toBeLessThanOrEqual(7);
    expect(initial.entries.get("percent")!.rect.width).toBe(
      Math.round(initial.entries.get("bounded")!.contentRect.width / 2)
    );
    expect(initial.entries.get("absolute")!.rect).toMatchObject({ x: 9, y: 3 });

    const reordered = treeFor(
      <Root id="root" style={{ direction: "row", gap: 1 }}>
        <Box id="fixed" style={{ width: 3, height: 2 }} />
        <Box id="bounded" style={{ flexGrow: 1, minWidth: 4, maxWidth: 7 }} />
      </Root>
    );
    const next = engine.compute(reordered, { width: 16, height: 6 });
    expect(next.entries.get("fixed")!.rect.x).toBe(0);
    expect(next.entries.has("absolute")).toBe(false);
    engine.dispose();
  });

  it("measures ASCII, CJK, combining, ZWJ emoji, tabs, newlines, and constrained wrapping in Cells", () => {
    const engine = new YogaLayoutEngine();
    const layout = engine.compute(treeFor(
      <Root id="root" style={{ direction: "row" }}>
        <Text id="unicode" style={{ maxHeight: 2 }}>A中é👩‍💻{"\t"}Z{"\n"}next</Text>
        <Text id="wrapped" style={{ width: 4, maxHeight: 2 }}>ab中cd</Text>
      </Root>
    ), { width: 80, height: 6 });
    expect(layout.entries.get("unicode")!.rect).toMatchObject({ width: 8, height: 2 });
    expect(layout.entries.get("wrapped")!.rect).toMatchObject({ width: 4, height: 2 });
    engine.dispose();
  });

  it("keeps incremental results identical to a fresh-tree oracle", () => {
    const incremental = new YogaLayoutEngine();
    const fixtures = [
      <Root id="root" style={{ direction: "row" }}>
        <Box id="a" style={{ width: 4 }}><Text id="label">A中</Text></Box>
        <Box id="b" style={{ flexGrow: 1 }} />
      </Root>,
      <Root id="root" style={{ direction: "row", gap: 1 }}>
        <Box id="b" style={{ flexGrow: 1 }} />
        <Box id="a" style={{ width: 6 }}><Text id="label">changed 👩‍💻</Text></Box>
      </Root>,
      <Root id="root">
        <Box id="a" style={{ width: "75%", paddingLeft: 2 }}><Text id="label">final</Text></Box>
      </Root>,
    ];
    for (const fixture of fixtures) {
      const tree = treeFor(fixture);
      const actual = incremental.compute(tree, { width: 31, height: 8 });
      const fresh = new YogaLayoutEngine();
      const expected = fresh.compute(tree, { width: 31, height: 8 });
      expect(entriesOf(actual)).toEqual(entriesOf(expected));
      fresh.dispose();
    }
    incremental.dispose();
  });

  it("releases every adapter-owned Yoga Node and Config across 1000 lifecycles", () => {
    const baseline = YogaLayoutEngine.getResourceCounts();
    const tree = treeFor(
      <Root id="root"><Box id="box"><Text id="text">hello</Text></Box></Root>
    );
    for (let index = 0; index < 1_000; index += 1) {
      const engine = new YogaLayoutEngine();
      engine.compute(tree, { width: 10, height: 2 });
      engine.dispose();
    }
    expect(YogaLayoutEngine.getResourceCounts()).toEqual(baseline);
  });
});
