import { expect, it } from "vitest";
import { Box, CellUiRuntime, Root, ScrollArea } from "./index.js";
import { cellAutoScrollRequest } from "./viewport.js";

it("axis y keeps wide mounted owners clipped without an extra horizontal rail or offset", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 8 } });
  try {
    const frame = runtime.render(<Root><ScrollArea id="rows" axis="y" scrollX={5} scrollY={4} style={{ width: 12, height: 8 }}>
      <Box style={{ width: 1000, height: 20 }} />
    </ScrollArea></Root>);
    const metrics = frame.scene.entries.get("rows")!.scrollMetrics!;
    expect(metrics.horizontalTrack).toBeNull(); expect(metrics.maxOffset.x).toBe(0);
    expect(metrics.viewport).toMatchObject({ width: 11, height: 8 }); expect(metrics.maxOffset.y).toBe(12);
  } finally { runtime.dispose(); }
});
it("axis x suppresses vertical scrolling while both retains existing rails", () => {
  const runtime = new CellUiRuntime({ viewport: { width: 12, height: 8 } });
  try {
    const view = (axis: "x" | "both") => <Root><ScrollArea id="rows" axis={axis} style={{ width: 12, height: 8 }}><Box style={{ width: 30, height: 20 }} /></ScrollArea></Root>;
    const x = runtime.render(view("x")).scene.entries.get("rows")!.scrollMetrics!;
    expect(x.verticalTrack).toBeNull(); expect(x.maxOffset.y).toBe(0); expect(x.viewport.width).toBe(12);
    const both = runtime.render(view("both")).scene.entries.get("rows")!.scrollMetrics!;
    expect(both.verticalTrack).not.toBeNull(); expect(both.horizontalTrack).not.toBeNull();
  } finally { runtime.dispose(); }
});
it("auto-scroll uses the local viewport and preserves independent corner directions", () => {
  const viewport = { x: 20, y: 30, width: 80, height: 10 };
  expect(cellAutoScrollRequest(viewport, { x: 50, y: 35 })).toBeNull();
  const corner = cellAutoScrollRequest(viewport, { x: 99, y: 30 })!;
  expect(corner).toMatchObject({ axis: "both", velocityX: 3, velocityY: -3 });
  expect(cellAutoScrollRequest(viewport, { x: 22, y: 35 })!.velocityX).toBe(-1);
  expect(cellAutoScrollRequest(viewport, { x: 20, y: 35 })!.velocityX).toBe(-3);
  expect(cellAutoScrollRequest({ ...viewport, width: 0 }, { x: 20, y: 30 })).toBeNull();
});
