import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Text } from "@chardesk/cell-ui";
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

const renderPlayground = (
  controls: readonly string[],
  { previewMinColumns = 10, controlsColumns = 25 } = {},
) => render(
  <ComponentPlayground
    id="test-playground"
    label="Test playground"
    probeId="test-playground"
    focusedId={null}
    onCommand={() => undefined}
    preview={<Text id="preview-content">Save</Text>}
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
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function () {
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
    expect(lines[2]).toContain("│   variant");
    expect(lines[3]).toContain("Save");
    expect(lines[3]).toContain("│   size");
    expect(lines[4]).toContain("│   disabled");
  });

  it("collapses centering space and scrolls when controls overflow", async () => {
    renderPlayground(Array.from({ length: 10 }, (_, index) => `row-${index}`));
    const surface = screen.getByLabelText("Test playground");
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.text).toContain("row-0"));

    const initial = readCellSurfaceProbe(surface)!;
    expect(initial.text.split("\n")[0]).toContain("│   row-0");
    expect(initial.cells.some((cell) => (
      cell.ownerId === "test-playground-controls-scroll" && "█▀▄".includes(cell.text)
    ))).toBe(true);

    for (let index = 0; index < 3; index += 1) {
      fireEvent.wheel(surface.querySelector("canvas")!, {
        clientX: 40 * DEFAULT_CELL_UI_METRICS.cellWidth,
        clientY: 3 * DEFAULT_CELL_UI_METRICS.cellHeight,
        deltaY: 100,
      });
    }
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.text).toContain("row-9"));
  });

  it("measures whole Cells, squeezes Props, and resets stale horizontal scroll on resize", async () => {
    hostWidth = 64 * DEFAULT_CELL_UI_METRICS.cellWidth;
    renderPlayground(["abcdefghijklmnopqrstuvwxy"], {
      previewMinColumns: 40,
      controlsColumns: 25,
    });
    const surface = screen.getByLabelText("Test playground");
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.viewport).toEqual({ width: 64, height: 7 }));
    const initial = readCellSurfaceProbe(surface)!;
    expect(initial.cells.some((cell) => (
      cell.ownerId === "test-playground-controls-scroll" && "█▀▄".includes(cell.text)
    ))).toBe(true);
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
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.viewport).toEqual({ width: 89, height: 7 }));
    expect(readCellSurfaceProbe(surface)!.cells
      .filter((cell) => cell.ownerId === "control-0")
      .sort((left, right) => left.x - right.x)[0]?.text).toBe("a");
  });
});
