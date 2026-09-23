import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readCellSurfaceProbe } from "@chardesk/cell-ui/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BoxComponentDemo,
  ButtonComponentDemo,
  BadgeComponentDemo,
  CheckboxComponentDemo,
  ComboboxComponentDemo,
  DialogComponentDemo,
  ToggleComponentDemo,
  ProgressComponentDemo,
  SpinnerComponentDemo,
  TooltipComponentDemo,
  SeparatorComponentDemo,
  RadioComponentDemo,
  InputComponentDemo,
  ScrollAreaComponentDemo,
  SelectComponentDemo,
  SliderComponentDemo,
  TabsComponentDemo,
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
    { Demo: DialogComponentDemo, label: "Dialog component", content: ["variant", "surface", "border", "square"], absent: ["modal", "closeOnOutsideClick", "frame", "bordered", "ghost"] },
    { Demo: ToggleComponentDemo, label: "Toggle component", content: ["○ Bold", "disabled"], absent: ["variant", "pressed", "value"] },
    { Demo: BadgeComponentDemo, label: "Badge component", content: ["Waiting", "Syncing", "Done", "Delayed", "Failed", "Retry", "Disabled"], absent: ["tone", "interactive", "Activated:", "variant"] },
    { Demo: TabsComponentDemo, label: "Tabs component", content: ["Code", "Preview", "Settings", "⎺⎺⎺⎺", "variant", "underline", 'const greeting = "Hello";'], absent: ["Activated:"] },
    { Demo: ProgressComponentDemo, label: "Progress component", content: ["variant", "solid", "number", "indeterminate"], absent: ["outline", "value"] },
    { Demo: SpinnerComponentDemo, label: "Spinner component", content: ["◐ Loading…", "variant", "wheel"], absent: ["dots", "number"] },
    { Demo: TooltipComponentDemo, label: "Tooltip component", content: ["Save", "variant", "surface", "border", "square"], absent: ["frame", "bordered", "ghost"] },
    { Demo: SeparatorComponentDemo, label: "Separator component", content: ["───────", "variant", "direction", "horizontal"], absent: ["slash", "double", "dots", "value"] },
    { Demo: RadioComponentDemo, label: "Radio component", content: ["(●) Light", "( ) Dark", "disabled"], absent: ["variant", "value"] },
    { Demo: BoxComponentDemo, label: "Box component", content: ["Block", "variant", "frame"], absent: ["rounded"] },
    { Demo: SelectComponentDemo, label: "Select component", content: ["Theme", "Dark", "disabled", "variant", "dropdown frame"], absent: ["value"] },
    { Demo: ComboboxComponentDemo, label: "Combobox component", content: ["Font", "Maple Mono", "disabled", "variant", "dropdown frame"], absent: ["value"] },
    { Demo: CheckboxComponentDemo, label: "Checkbox component", content: ["Autosave", "disabled"], absent: ["checked"] },
    { Demo: SliderComponentDemo, label: "Slider component", content: ["Volume", "range", "disabled"], absent: ["value", "step"] },
    { Demo: InputComponentDemo, label: "Input component", content: ["File name", "notes.txt", "disabled", "variant"], absent: ["border", "readOnly"] },
    { Demo: ScrollAreaComponentDemo, label: "ScrollArea component", content: ["01  Row 1", "variant", "frame"], absent: ["rounded"] },
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

  it("switches Button content between text, icon-only, and icon + text without changing its name", async () => {
    render(<ButtonComponentDemo />);
    const surface = screen.getByLabelText("Button component");
    const save = screen.getByRole("button", { name: "Save document" });
    const buttonCells = () => readCellSurfaceProbe(surface)!.cells
      .filter((cell) => cell.ownerId === "component-button-save"
        || cell.ownerId?.startsWith("component-button-save/text"))
      .sort((left, right) => left.x - right.x);
    await waitFor(() => expect(buttonCells().map((cell) => cell.text).join(""))
      .toBe(" Save "));

    fireEvent.click(screen.getByRole("button", { name: "content" }));
    fireEvent.click(screen.getByRole("option", { name: "icon-only" }));
    await waitFor(() => expect(buttonCells().map((cell) => cell.text).join(""))
      .toBe(" \uEB4B "));
    expect(save).toHaveAccessibleName("Save document");
    expect(buttonCells()).toHaveLength(3);
    await waitFor(() => expect(surface).not.toHaveAttribute("data-cell-confirmation-phase"));

    fireEvent.click(screen.getByRole("button", { name: "content" }));
    fireEvent.click(screen.getByRole("option", { name: "icon + text" }));
    await waitFor(() => expect(buttonCells().map((cell) => cell.text).join(""))
      .toBe(" \uEB4B Save "));
    expect(save).toHaveAccessibleName("Save document");
    expect(buttonCells()).toHaveLength(8);
    await waitFor(() => expect(surface).not.toHaveAttribute("data-cell-confirmation-phase"));

    fireEvent.click(screen.getByRole("button", { name: "variant" }));
    fireEvent.click(screen.getByRole("option", { name: "outline" }));
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.text).toContain("[ \uEB4B Save ]"));
    expect(save).toHaveAccessibleName("Save document");
  });

  it("shows every Badge tone without a config pane or persistent activation feedback", async () => {
    render(<BadgeComponentDemo />);
    const surface = screen.getByLabelText("Badge component");
    const statuses = screen.getAllByRole("paragraph");
    for (const name of ["Waiting", "Syncing", "Done", "Delayed", "Failed"]) {
      expect(statuses.some((status) => status.textContent === name)).toBe(true);
    }
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(screen.getByRole("button", { name: "Disabled" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("button", { name: "tone" })).toBeNull();
    expect(readCellSurfaceProbe(surface)?.text).not.toContain("│");
    fireEvent.click(retry);
    await waitFor(() => expect(surface).not.toHaveAttribute("data-cell-confirmation-phase"));
    expect(readCellSurfaceProbe(surface)?.text).not.toContain("Activated:");
  });

  it("switches Tabs panels while keeping focus, selection, and disabled state distinct", async () => {
    render(<TabsComponentDemo />);
    const surface = screen.getByLabelText("Tabs component");
    const code = screen.getByRole("tab", { name: "Code" });
    const preview = screen.getByRole("tab", { name: "Preview" });
    const settings = screen.getByRole("tab", { name: "Settings" });
    expect(screen.getByRole("tablist", { name: "Views" })).toBeInTheDocument();
    expect(code).toHaveAttribute("aria-selected", "true");
    expect(settings).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("tabpanel", { name: "Code" })).toHaveAttribute("id", code.getAttribute("aria-controls"));

    fireEvent.click(preview);
    await waitFor(() => expect(preview).toHaveAttribute("aria-selected", "true"));
    expect(code).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tabpanel", { name: "Preview" })).toHaveAttribute("id", preview.getAttribute("aria-controls"));
    expect(readCellSurfaceProbe(surface)?.text).toContain("Hello");
    expect(readCellSurfaceProbe(surface)?.text).not.toContain("const greeting");
    fireEvent.click(settings);
    expect(preview).toHaveAttribute("aria-selected", "true");
  });

  it("changes Dialog border through one selector", async () => {
    render(<DialogComponentDemo />);
    const surface = screen.getByLabelText("Dialog component");
    const select = async (label: string, value: string) => {
      const trigger = screen.getByRole("button", { name: label });
      fireEvent.click(trigger);
      fireEvent.click(await screen.findByRole("option", { name: value }));
      await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
    };
    expect(screen.queryByRole("checkbox", { name: "modal" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "closeOnOutsideClick" })).toBeNull();
    await select("border", "rounded");
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.text).toContain("rounded"));
    await select("border", "none");
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.text).toContain("none"));
    await select("border", "square");
    await waitFor(() => expect(readCellSurfaceProbe(surface)?.text).toContain("square"));
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

});
