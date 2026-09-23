import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readCellSurfaceProbe } from "@chardesk/cell-ui/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BoxComponentDemo,
  CheckboxComponentDemo,
  ComboboxComponentDemo,
  ToggleComponentDemo,
  ProgressComponentDemo,
  SeparatorComponentDemo,
  RadioComponentDemo,
  InputComponentDemo,
  ScrollAreaComponentDemo,
  SelectComponentDemo,
  SliderComponentDemo,
} from "./sections/components";

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

describe("Component Playground gallery demos", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([
    { Demo: ToggleComponentDemo, label: "Toggle component", content: ["○ Bold", "disabled"], absent: ["variant", "pressed", "value"] },
    { Demo: ProgressComponentDemo, label: "Progress component", content: ["variant", "solid", "indeterminate"], absent: ["value"] },
    { Demo: SeparatorComponentDemo, label: "Separator component", content: ["───────", "variant", "direction", "horizontal"], absent: ["line", "slash", "double", "dots", "value"] },
    { Demo: RadioComponentDemo, label: "Radio component", content: ["(●) Light", "( ) Dark", "disabled"], absent: ["variant", "value"] },
    { Demo: BoxComponentDemo, label: "Box component", content: ["Block", "variant", "ghost", "frame", "none"], absent: ["border shape", "rounded"] },
    { Demo: SelectComponentDemo, label: "Select component", content: ["Theme", "Dark", "variant", "surface", "dropdown frame", "disabled"], absent: ["value", "rounded"] },
    { Demo: ComboboxComponentDemo, label: "Combobox component", content: ["Font", "Maple Mono", "variant", "surface", "dropdown frame", "disabled"], absent: ["value", "query", "border shape"] },
    { Demo: CheckboxComponentDemo, label: "Checkbox component", content: ["Autosave", "disabled"], absent: ["checked"] },
    { Demo: SliderComponentDemo, label: "Slider component", content: ["Volume", "range", "disabled"], absent: ["value", "step"] },
    { Demo: InputComponentDemo, label: "Input component", content: ["File name", "notes.txt", "variant", "surface", "disabled"], absent: ["border", "rounded", "readOnly"] },
    { Demo: ScrollAreaComponentDemo, label: "ScrollArea component", content: ["01  Row 1", "variant", "ghost", "frame", "none"], absent: ["height", "rows", "rounded"] },
  ])("$label exposes one Preview and its semantic props", async ({ Demo, label, content, absent }) => {
    render(<Demo />);
    const surface = screen.getByLabelText(label);
    await waitFor(() => expect(readCellSurfaceProbe(surface)).not.toBeNull());
    const probe = readCellSurfaceProbe(surface)!;

    expect(probe.viewport).toEqual({ width: 64, height: 7 });
    content.forEach((text) => expect(probe.text).toContain(text));
    absent.forEach((text) => expect(probe.text).not.toContain(text));
    expect(screen.queryByRole("checkbox", { name: "border" })).toBeNull();
  });

  it("advances determinate Progress through a repeatable stalled schedule", () => {
    vi.useFakeTimers();
    try {
      render(<ProgressComponentDemo />);
      const progress = screen.getByRole("progressbar", { name: "Progress" });
      expect(progress).toHaveAttribute("aria-valuenow", "0");

      act(() => vi.advanceTimersByTime(179));
      expect(progress).toHaveAttribute("aria-valuenow", "0");
      act(() => vi.advanceTimersByTime(1));
      expect(progress).toHaveAttribute("aria-valuenow", "7");
      act(() => vi.advanceTimersByTime(260));
      expect(progress).toHaveAttribute("aria-valuenow", "15");
      act(() => vi.advanceTimersByTime(519));
      expect(progress).toHaveAttribute("aria-valuenow", "15");
      act(() => vi.advanceTimersByTime(1));
      expect(progress).toHaveAttribute("aria-valuenow", "18");

      act(() => vi.advanceTimersByTime(3_100));
      expect(progress).toHaveAttribute("aria-valuenow", "100");
      act(() => vi.advanceTimersByTime(799));
      expect(progress).toHaveAttribute("aria-valuenow", "100");
      act(() => vi.advanceTimersByTime(1));
      expect(progress).toHaveAttribute("aria-valuenow", "0");
    } finally {
      vi.useRealTimers();
    }
  });

  it("switches Progress between solid and outline", async () => {
    render(<ProgressComponentDemo />);
    const surface = screen.getByLabelText("Progress component");
    const progressCells = () => readCellSurfaceProbe(surface)!.cells
      .filter((cell) => cell.ownerId === "component-progress-bar")
      .sort((left, right) => left.x - right.x);
    await waitFor(() => expect(progressCells()[0]?.style.backgroundColor).toBeUndefined());

    fireEvent.click(screen.getByRole("button", { name: "variant" }));
    expect(screen.queryByRole("option", { name: "surface" })).toBeNull();
    expect(screen.queryByRole("option", { name: "ghost" })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "outline" }));
    await waitFor(() => expect(surface).toHaveAttribute("data-cell-confirmation-phase"));
    await waitFor(() => expect(surface).not.toHaveAttribute("data-cell-confirmation-phase"));

    await waitFor(() => {
      const cells = progressCells();
      expect(cells).toHaveLength(20);
      expect(cells[0]?.text).toBe("[");
      expect(cells.at(-1)?.text).toBe("]");
      expect(cells.slice(1, -1).every((cell) => cell.text === "/" || cell.text === "-"))
        .toBe(true);
    });
  });

  it("configures the shared Combobox appearance without duplicating its selected value", async () => {
    render(<ComboboxComponentDemo />);
    const surface = screen.getByLabelText("Combobox component");
    await waitFor(() => expect(readCellSurfaceProbe(surface)).not.toBeNull());
    const initial = readCellSurfaceProbe(surface)!;
    const elevatedBackground = initial.cells.find((cell) =>
      cell.ownerId === "component-combobox-input" && cell.text === " "
    )?.style.backgroundColor;
    expect(elevatedBackground).toBeTruthy();
    expect(screen.queryByRole("button", { name: "value" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "variant" }));
    fireEvent.click(screen.getByRole("option", { name: "ghost" }));
    await waitFor(() => expect(readCellSurfaceProbe(surface)!.cells.find((cell) =>
      cell.ownerId === "component-combobox-input" && cell.text === " "
    )?.style.backgroundColor).not.toBe(elevatedBackground));
  });

  it("reveals Combobox border shape only for a bordered dropdown", async () => {
    render(<ComboboxComponentDemo />);
    const surface = screen.getByLabelText("Combobox component");
    await waitFor(() => expect(readCellSurfaceProbe(surface)).not.toBeNull());
    expect(screen.queryByRole("button", { name: "border shape" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "dropdown frame" }));
    fireEvent.click(screen.getByRole("option", { name: "bordered" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "border shape" })).toBeInTheDocument());
  });
});
