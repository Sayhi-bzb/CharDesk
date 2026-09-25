import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Box, Text } from "@chardesk/cell-ui";
import type { ReactNode } from "react";
import {
  DEFAULT_CELL_UI_METRICS,
  readCellSurfaceProbe,
} from "@chardesk/cell-ui/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComponentPlayground } from "./component-playground";

const context = {
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  fill: vi.fn(),
  fillText: vi.fn(),
  getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  })),
  putImageData: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  stroke: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  getTransform: () => ({ a: 1, b: 0, c: 0, d: 1 }),
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
  font: "",
  textBaseline: "",
  textAlign: "",
};

let hostWidth = 0;
const resizeObservers = new Map<Element, { callback: ResizeObserverCallback; observer: ResizeObserver }>();
const tallPreview = <Box>
  {Array.from({ length: 10 }, (_, index) => <Text id={`preview-row-${index}`} key={index}>{`preview-${index}`}</Text>)}
</Box>;

const renderPlayground = (
  controls: readonly string[],
  { previewMinColumns = 10, controlsColumns = 25, preview = <Text id="preview-content">Save</Text> }: {
    previewMinColumns?: number;
    controlsColumns?: number;
    preview?: ReactNode;
  } = {},
) => render(
  <ComponentPlayground
    id="test-playground"
    label="Test playground"
    probeId="test-playground"
    focusedId={null}
    onCommand={() => undefined}
    preview={preview}
    previewMinColumns={previewMinColumns}
    controlsColumns={controlsColumns}
    controls={controls.map((label, index) => (
      <Text id={`control-${index}`} key={label}>{label}</Text>
    ))}
  />
);

describe("ComponentPlayground controls layout", () => {
  beforeEach(() => {
    hostWidth = 0;
    resizeObservers.clear();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("component-playground") ? hostWidth : 0;
    });
    vi.stubGlobal("ResizeObserver", class ResizeObserverMock implements ResizeObserver {
      private readonly targets = new Set<Element>();
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.targets.add(target);
        resizeObservers.set(target, { callback: this.callback, observer: this });
      }
      unobserve(target: Element) {
        this.targets.delete(target);
        resizeObservers.delete(target);
      }
      disconnect() {
        this.targets.forEach((target) => resizeObservers.delete(target));
        this.targets.clear();
      }
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shares the Preview centerline when controls fit", async () => {
    renderPlayground(["variant", "size", "disabled"]);
    const surface = screen.getByLabelText("Test playground");
    await waitFor(() => expect(readCellSurfaceProbe(surface)).not.toBeNull());

    const lines = readCellSurfaceProbe(surface)!.text.split("\n");
    expect(lines.some((line) => line.includes("│") && line.includes("presentation"))).toBe(true);
    const labelRow = lines.findIndex((line) => line.includes("presentation"));
    expect(lines[labelRow + 1]).toContain("Rich");
    expect(lines[labelRow]).not.toContain("Rich");
    expect(lines.some((line) => line.includes("Save"))).toBe(true);
    for (const label of ["variant", "size", "disabled"]) {
      expect(lines.some((line) => line.includes("│") && line.includes(label))).toBe(true);
    }
  });

  it("adds only the presentation control when the component has no own controls", async () => {
    render(<ComponentPlayground id="single-playground" label="Single playground"
      probeId="single-playground" focusedId={null} onCommand={() => undefined}
      preview={<Text id="single-content">Block</Text>} previewMinColumns={20} />);
    const surface = screen.getByLabelText("Single playground");
    await waitFor(() => expect(readCellSurfaceProbe(surface)).not.toBeNull());
    const probe = readCellSurfaceProbe(surface)!;
    expect(probe.viewport).toEqual({ width: 64, height: 7 });
    expect(probe.text).toContain("Block");
    expect(probe.cells.some((cell) => cell.ownerId?.includes("divider"))).toBe(true);
    expect(probe.text).toContain("presentation");
    expect(probe.text).toContain("Rich");
  });

  it("collapses centering space and scrolls when controls overflow", async () => {
    renderPlayground(Array.from({ length: 10 }, (_, index) => `row-${index}`));
    const surface = screen.getByLabelText("Test playground");
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.text).toContain("row-0"));

    const initial = readCellSurfaceProbe(surface)!;
    expect(initial.text).toContain("row-0");
    expect(initial.cells.some((cell) => (
      cell.ownerId === "test-playground-controls-scroll" && "█▀▄".includes(cell.text)
    ))).toBe(true);

    for (let index = 0; index < 12; index += 1) {
      fireEvent.wheel(surface.querySelector("canvas")!, {
        clientX: 40 * DEFAULT_CELL_UI_METRICS.cellWidth,
        clientY: 3 * DEFAULT_CELL_UI_METRICS.cellHeight,
        deltaY: 100,
      });
    }
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.text).toContain("row-9"));
  });

  it("scrolls overflowing preview content independently from controls", async () => {
    renderPlayground(["variant"], { preview: tallPreview });
    const surface = screen.getByLabelText("Test playground");
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.text).toContain("preview-0"));
    const initial = readCellSurfaceProbe(surface)!;
    expect(initial.cells.some((cell) => cell.ownerId === "test-playground-preview-scroll" && "█▀▄".includes(cell.text))).toBe(true);
    expect(initial.text).toContain("variant");

    for (let index = 0; index < 4; index += 1) {
      fireEvent.wheel(surface.querySelector("canvas")!, {
        clientX: 10 * DEFAULT_CELL_UI_METRICS.cellWidth,
        clientY: 3 * DEFAULT_CELL_UI_METRICS.cellHeight,
        deltaY: 100,
      });
    }
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.text).toContain("preview-9"));
    expect(readCellSurfaceProbe(surface)?.text).toContain("variant");
  });

  it("keeps both panes accessible when stacked and the preview overflows", async () => {
    hostWidth = 32 * DEFAULT_CELL_UI_METRICS.cellWidth;
    renderPlayground(["variant"], { preview: tallPreview });
    const surface = screen.getByLabelText("Test playground");
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.viewport).toEqual({ width: 30, height: 15 }));
    const initial = readCellSurfaceProbe(surface)!;
    expect(initial.text).toContain("preview-0");
    expect(initial.text).toContain("variant");
    for (let index = 0; index < 4; index += 1) {
      fireEvent.wheel(surface.querySelector("canvas")!, {
        clientX: 10 * DEFAULT_CELL_UI_METRICS.cellWidth,
        clientY: 3 * DEFAULT_CELL_UI_METRICS.cellHeight,
        deltaY: 100,
      });
    }
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.text).toContain("preview-9"));
    expect(readCellSurfaceProbe(surface)?.text).toContain("variant");
  });

  it("allows horizontal preview overflow without moving the controls pane", async () => {
    renderPlayground(["variant"], { preview: <Box style={{ width: 42 }}>
      <Text id="wide-preview">abcdefghijklmnopqrstuvwxyz0123456789</Text>
    </Box> });
    const surface = screen.getByLabelText("Test playground");
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.text).toContain("abcdefghijkl"));
    const initial = readCellSurfaceProbe(surface)!;
    expect(initial.cells.some((cell) => cell.ownerId === "test-playground-preview-scroll" && "█▀▄".includes(cell.text))).toBe(true);

    fireEvent.wheel(surface.querySelector("canvas")!, {
      clientX: 10 * DEFAULT_CELL_UI_METRICS.cellWidth,
      clientY: 3 * DEFAULT_CELL_UI_METRICS.cellHeight,
      deltaX: 100,
    });
    await waitFor(() => expect(readCellSurfaceProbe(surface)!.cells
      .filter((cell) => cell.ownerId === "wide-preview")
      .sort((left, right) => left.x - right.x)[0]?.text).not.toBe("a"));
    expect(readCellSurfaceProbe(surface)?.text).toContain("variant");
  });

  it("measures whole Cells, squeezes Props, and resets stale horizontal scroll on resize", async () => {
    hostWidth = 66 * DEFAULT_CELL_UI_METRICS.cellWidth;
    renderPlayground(["abcdefghijklmnopqrstuvwxy"], {
      previewMinColumns: 40,
      controlsColumns: 25,
    });
    const surface = screen.getByLabelText("Test playground");
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.viewport).toEqual({ width: 64, height: 7 }));
    const initial = readCellSurfaceProbe(surface)!;
    expect(initial.cells.filter((cell) => cell.ownerId === "control-0")
      .sort((left, right) => left.x - right.x)[0]?.text).toBe("a");

    fireEvent.wheel(surface.querySelector("canvas")!, {
      clientX: 50 * DEFAULT_CELL_UI_METRICS.cellWidth,
      clientY: 3 * DEFAULT_CELL_UI_METRICS.cellHeight,
      deltaX: 100,
    });
    await waitFor(() => expect(readCellSurfaceProbe(surface)!.cells
      .filter((cell) => cell.ownerId === "control-0")
      .sort((left, right) => left.x - right.x)[0]?.text).not.toBe("a"));

    hostWidth = 801;
    const host = surface.closest(".component-playground")!;
    const resize = resizeObservers.get(host)!;
    act(() => resize.callback([], resize.observer));
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.viewport).toEqual({ width: 87, height: 7 }));
    expect(readCellSurfaceProbe(surface)!.cells
      .filter((cell) => cell.ownerId === "control-0")
      .sort((left, right) => left.x - right.x)[0]?.text).toBe("a");
  });
});
