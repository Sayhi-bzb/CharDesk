import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    { Demo: ProgressComponentDemo, label: "Progress component", content: ["████"], absent: ["variant", "value", "│"] },
    { Demo: SeparatorComponentDemo, label: "Separator component", content: ["───────", "variant", "direction", "horizontal"], absent: ["line", "slash", "double", "dots", "value"] },
    { Demo: RadioComponentDemo, label: "Radio component", content: ["(●) Light", "( ) Dark", "disabled"], absent: ["variant", "value"] },
    { Demo: BoxComponentDemo, label: "Box component", content: ["Block", "background", "plain", "frame", "none"], absent: ["border shape", "rounded"] },
    { Demo: SelectComponentDemo, label: "Select component", content: ["Theme", "Dark", "background", "elevated", "dropdown frame", "disabled"], absent: ["value", "rounded"] },
    { Demo: ComboboxComponentDemo, label: "Combobox component", content: ["Font", "Maple Mono", "background", "elevated", "dropdown frame", "disabled"], absent: ["value", "query", "border shape"] },
    { Demo: CheckboxComponentDemo, label: "Checkbox component", content: ["Autosave", "disabled"], absent: ["checked"] },
    { Demo: SliderComponentDemo, label: "Slider component", content: ["Volume", "range", "disabled"], absent: ["value", "step"] },
    { Demo: InputComponentDemo, label: "Input component", content: ["File name", "notes.txt", "background", "elevated", "disabled"], absent: ["border", "rounded", "readOnly"] },
    { Demo: ScrollAreaComponentDemo, label: "ScrollArea component", content: ["01  Row 1", "background", "plain", "frame", "none"], absent: ["height", "rows", "rounded"] },
  ])("$label exposes one Preview and its semantic props", async ({ Demo, label, content, absent }) => {
    render(<Demo />);
    const surface = screen.getByLabelText(label);
    await waitFor(() => expect(readCellSurfaceProbe(surface)).not.toBeNull());
    const probe = readCellSurfaceProbe(surface)!;

    expect(probe.viewport).toEqual({ width: Demo === ProgressComponentDemo ? 20 : 64, height: 7 });
    content.forEach((text) => expect(probe.text).toContain(text));
    absent.forEach((text) => expect(probe.text).not.toContain(text));
    expect(screen.queryByRole("checkbox", { name: "border" })).toBeNull();
  });

  it("configures Combobox appearance without duplicating its selected value", async () => {
    render(<ComboboxComponentDemo />);
    const surface = screen.getByLabelText("Combobox component");
    await waitFor(() => expect(readCellSurfaceProbe(surface)).not.toBeNull());
    const initial = readCellSurfaceProbe(surface)!;
    const elevatedBackground = initial.cells.find((cell) =>
      cell.ownerId === "component-combobox-input" && cell.text === " "
    )?.style.backgroundColor;
    expect(elevatedBackground).toBeTruthy();
    expect(screen.queryByRole("button", { name: "value" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "background" }));
    fireEvent.click(screen.getByRole("option", { name: "plain" }));
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
