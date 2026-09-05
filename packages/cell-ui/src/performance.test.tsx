import { performance } from "node:perf_hooks";
import { describe, expect, it, vi } from "vitest";
import {
  Box,
  CELL_UI_PERFORMANCE_BUDGET,
  CellUiRuntime,
  List,
  ListItem,
  Root,
  ScrollArea,
  Text,
  YogaLayoutEngine,
  paintScene,
  percentile,
} from "./index.js";
import type { LayoutEngine } from "./layout.js";

describe("Cell UI executable performance budgets", () => {
  it("composes 10k Widgets and keeps 1000 steady scroll commits off Yoga", () => {
    const large = new CellUiRuntime({ viewport: { width: 120, height: 40 } });
    const started = performance.now();
    const frame = large.render(
      <Root id="root">
        {Array.from({ length: CELL_UI_PERFORMANCE_BUDGET.composeWidgets }, (_, index) => (
          <Box id={`node-${index}`} key={index} style={{ height: 1 }} />
        ))}
      </Root>
    );
    const elapsed = performance.now() - started;
    expect(frame.tree.nodes.size).toBe(CELL_UI_PERFORMANCE_BUDGET.composeWidgets + 1);
    expect(elapsed).toBeLessThan(5_000);
    large.dispose();

    const yoga = new YogaLayoutEngine();
    const compute = vi.fn(yoga.compute.bind(yoga));
    const engine: LayoutEngine = { compute, dispose: () => yoga.dispose() };
    const runtime = new CellUiRuntime({ viewport: { width: 20, height: 6 }, layoutEngine: engine });
    const view = (scrollY: number) => (
      <Root id="root">
        <ScrollArea id="scroll" scrollY={scrollY} style={{ height: 6 }}>
          <List id="list">
            {Array.from({ length: 8 }, (_, index) => (
              <ListItem id={`item-${index}`} key={index}><Text>{String(index)}</Text></ListItem>
            ))}
          </List>
        </ScrollArea>
      </Root>
    );
    runtime.render(view(0));
    for (let index = 0; index < CELL_UI_PERFORMANCE_BUDGET.steadyScrollCommits; index += 1) {
      const next = runtime.render(view(index % 2));
      expect(next.invalidation.work.layout).toBe("reused");
      expect(next.invalidation.dirtyRegions.length).toBeLessThanOrEqual(1);
    }
    expect(compute).toHaveBeenCalledTimes(1);
    runtime.dispose();
  }, 15_000);

  it("measures full and one-row raster p95 against portable ceilings", () => {
    const { width, height } = CELL_UI_PERFORMANCE_BUDGET.paintViewport;
    const runtime = new CellUiRuntime({ viewport: { width, height } });
    const frame = runtime.render(
      <Root id="root">
        {Array.from({ length: height }, (_, index) => (
          <Text id={`line-${index}`} key={index} style={{ width, height: 1 }}>
            {String(index).padStart(2, "0").padEnd(width, "x")}
          </Text>
        ))}
      </Root>
    );
    const fullSamples = Array.from({ length: 30 }, () => {
      const start = performance.now();
      paintScene(frame.tree, frame.scene, frame.textLayouts);
      return performance.now() - start;
    });
    const rowSamples = Array.from({ length: 30 }, () => {
      const start = performance.now();
      paintScene(frame.tree, frame.scene, frame.textLayouts, undefined, {
        previous: frame.buffer,
        dirtyRegions: [{ x: 0, y: 20, width, height: 1 }],
      });
      return performance.now() - start;
    });
    const fullP95 = percentile(fullSamples, 0.95);
    const rowP95 = percentile(rowSamples, 0.95);
    expect(fullP95).toBeLessThan(CELL_UI_PERFORMANCE_BUDGET.portableFullPaintCeilingMs);
    expect(rowP95).toBeLessThan(CELL_UI_PERFORMANCE_BUDGET.portableSingleRowPaintCeilingMs);
    expect(rowP95).toBeLessThan(fullP95);
    runtime.dispose();
  });
});
