import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { CharDeskCellMetrics } from "@chardesk/rendering";
import { CellBuffer } from "./buffer.js";
import { CellSvgIconLayer } from "./browser-svg-icons.js";
import type { FrameSnapshot, SceneEntry } from "./types.js";

afterEach(cleanup);

const metrics = { cellWidth: 10, cellHeight: 20 } as CharDeskCellMetrics;
const bounds = { x: 2, y: 1, width: 3, height: 1 };
const entry = {
  contentBounds: bounds,
  contentClip: { x: 3, y: 1, width: 2, height: 1 },
  layer: 0,
  paintVisible: true,
} as SceneEntry;
const frame = {
  scene: { entries: new Map([["icon", entry]]) },
  baseBuffer: new CellBuffer({ width: 10, height: 4 }),
  overlayBuffer: new CellBuffer({ width: 10, height: 4 }),
} as FrameSnapshot;

it("anchors a decorative SVG to Cell geometry and clips it with the scene", () => {
  render(<CellSvgIconLayer frame={frame} metrics={metrics} foreground="#123456"
    icons={{ icon: <svg data-testid="svg"><path d="M0 0" /></svg>, absent: <svg /> }} />);
  const layer = screen.getByTestId("svg").parentElement!;
  expect(layer.getAttribute("data-cell-svg-icon")).toBe("icon");
  expect(layer.getAttribute("aria-hidden")).toBe("true");
  expect(layer.style.pointerEvents).toBe("none");
  expect(layer.style.left).toBe("30px");
  expect(layer.style.top).toBe("40px");
  expect(layer.style.width).toBe("30px");
  expect(layer.style.clipPath).toBe("inset(0px 0px 0px 10px)");
  expect(layer.style.color).toBe("rgb(18, 52, 86)");
  expect(screen.getByTestId("svg").getAttribute("width")).toBe("16");
  expect(screen.getByTestId("svg").getAttribute("focusable")).toBe("false");
  expect(document.querySelectorAll("[data-cell-svg-icon]")).toHaveLength(1);
});

it("caps a two-row icon at one Cell height and honors explicit width", () => {
  const twoRows = { ...entry, contentBounds: { ...bounds, height: 2 },
    contentClip: { x: 2, y: 1, width: 3, height: 2 } };
  const tallFrame = { ...frame, scene: { entries: new Map([["icon", twoRows]]) } } as FrameSnapshot;
  render(<CellSvgIconLayer frame={tallFrame} metrics={metrics} foreground="#123456"
    icons={{ icon: <svg data-testid="tall-icon" width={12} /> }} />);
  expect(screen.getByTestId("tall-icon").getAttribute("width")).toBe("12");
  expect(screen.getByTestId("tall-icon").parentElement?.style.height).toBe("40px");
});
