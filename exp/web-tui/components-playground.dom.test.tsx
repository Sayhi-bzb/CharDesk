import { render, screen, waitFor } from "@testing-library/react";
import { readCellSurfaceProbe } from "@chardesk/cell-ui/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CheckboxComponentDemo,
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
    {
      Demo: SelectComponentDemo,
      label: "Select component",
      content: ["Theme", "Dark", "border", "disabled", "rounded"],
      absent: ["value"],
      rounded: true,
    },
    {
      Demo: CheckboxComponentDemo,
      label: "Checkbox component",
      content: ["Autosave", "checked", "disabled"],
      absent: [],
      rounded: false,
    },
    {
      Demo: SliderComponentDemo,
      label: "Slider component",
      content: ["Volume", "value", "step", "disabled"],
      absent: [],
      rounded: false,
    },
    {
      Demo: InputComponentDemo,
      label: "Input component",
      content: ["File name", "notes.txt", "readOnly", "disabled", "rounded"],
      absent: [],
      rounded: true,
    },
    {
      Demo: ScrollAreaComponentDemo,
      label: "ScrollArea component",
      content: ["01  Row 1", "height", "rows", "border", "rounded"],
      absent: [],
      rounded: true,
    },
  ])("$label exposes one Preview and its semantic props", async ({ Demo, label, content, absent, rounded }) => {
    render(<Demo />);
    const surface = screen.getByLabelText(label);
    await waitFor(() => expect(readCellSurfaceProbe(surface)).not.toBeNull());
    const probe = readCellSurfaceProbe(surface)!;

    expect(probe.viewport).toEqual({ width: 64, height: 7 });
    content.forEach((text) => expect(probe.text).toContain(text));
    absent.forEach((text) => expect(probe.text).not.toContain(text));
    expect(screen.queryByRole("checkbox", { name: "rounded" }) !== null).toBe(rounded);
  });
});
