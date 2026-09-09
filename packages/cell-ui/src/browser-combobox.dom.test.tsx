import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  Root,
  Text,
} from "./index.js";
import { CellSurface, readCellSurfaceProbe, useCellComboboxState } from "./browser.js";

const context = {
  setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), fill: vi.fn(), fillText: vi.fn(),
  getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => ({
    width, height, data: new Uint8ClampedArray(width * height * 4),
  })),
  putImageData: vi.fn(), measureText: vi.fn(() => ({ width: 0 })), save: vi.fn(), restore: vi.fn(),
  beginPath: vi.fn(), closePath: vi.fn(), rect: vi.fn(), clip: vi.fn(), moveTo: vi.fn(),
  lineTo: vi.fn(), arc: vi.fn(), stroke: vi.fn(), scale: vi.fn(), translate: vi.fn(),
  getTransform: () => ({ a: 1, b: 0, c: 0, d: 1 }), fillStyle: "", strokeStyle: "",
  lineWidth: 1, font: "", textBaseline: "", textAlign: "",
};

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const ComboProduct = () => {
  const combo = useCellComboboxState("font", [
    { id: "maple", label: "Maple Mono" },
    { id: "jetbrains", label: "JetBrains Mono" },
    { id: "plex", label: "IBM Plex Mono" },
    { id: "fusion", label: "融合像素字体" },
  ], { defaultSelectedId: "maple" });
  return <CellSurface label="Combobox surface" probeId="combobox" viewport={{ width: 24, height: 8 }}
    overlayViewport={{ width: 24, height: 12 }} focusedId={combo.focusedId} onCommand={combo.dispatch}
    feedback={{ activationBlinkCount: 0 }} metrics={{ cellWidth: 10, cellHeight: 20, fontSize: 15, fontFamily: "monospace" }}>
    <Root><Combobox id={combo.id} label="Font" style={{ width: 22 }}>
      <ComboboxInput id={combo.inputId} label="Font" state={combo.inputSnapshot} expanded={combo.open}
        activeDescendantId={combo.activeId ?? undefined} />
      {combo.open ? <ComboboxContent id={combo.contentId} label="Font options" scrollY={combo.scrollY}
        style={{ maxHeight: 5 }}>
        {combo.filteredItems.length ? combo.filteredItems.map((item, index) => <ComboboxItem key={item.id}
          id={item.id} active={combo.activeId === item.id} selected={combo.selectedId === item.id}
          disabled={item.disabled} positionInSet={index + 1} setSize={combo.filteredItems.length}>
          <Text>{item.label}</Text>
        </ComboboxItem>) : <Text>No matches</Text>}
      </ComboboxContent> : null}
    </Combobox></Root>
  </CellSurface>;
};

it("keeps DOM focus on the input while active candidates and selection change", () => {
  render(<ComboProduct />);
  const input = screen.getByRole("combobox", { name: "Font" });
  fireEvent.focus(input);
  expect(input).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input).toHaveAttribute("aria-expanded", "true");
  expect(input).toHaveAttribute("aria-activedescendant", "cell-semantic-maple");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input).toHaveAttribute("aria-activedescendant", "cell-semantic-jetbrains");
  expect(input).toHaveFocus();

  fireEvent.keyDown(input, { key: "Enter" });
  expect(input).toHaveAttribute("aria-expanded", "false");
  expect(input).toHaveValue("JetBrains Mono");
  expect(readCellSurfaceProbe(screen.getByLabelText("Combobox surface"))!.text)
    .toContain("JetBrains Mono");
});

it("filters committed composition and restores the selected label on Escape", () => {
  render(<ComboProduct />);
  const input = screen.getByRole("combobox", { name: "Font" });
  fireEvent.focus(input);
  fireEvent.input(input, { target: { value: "plex" }, data: "x", inputType: "insertText" });
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["IBM Plex Mono"]);
  fireEvent.keyDown(input, { key: "Escape" });
  expect(input).toHaveValue("Maple Mono");

  fireEvent.compositionStart(input);
  fireEvent.compositionUpdate(input, { data: "像素" });
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  fireEvent.compositionEnd(input, { data: "像素" });
  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["融合像素字体"]);
});

it("commits pointer activation and restores the committed label on outside focus", async () => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  render(<><ComboProduct /><button>Outside</button></>);
  const input = screen.getByRole("combobox", { name: "Font" });
  fireEvent.focus(input);
  fireEvent.input(input, { target: { value: "plex" }, data: "x", inputType: "insertText" });
  fireEvent.click(screen.getByRole("option", { name: "IBM Plex Mono" }));
  expect(input).toHaveValue("IBM Plex Mono");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

  fireEvent.input(input, { target: { value: "像素" }, data: "素", inputType: "insertText" });
  expect(screen.getByRole("option", { name: "融合像素字体" })).toBeInTheDocument();
  screen.getByRole("button", { name: "Outside" }).focus();
  await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  expect(input).toHaveValue("IBM Plex Mono");
});
