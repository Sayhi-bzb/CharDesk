import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CellTextEditor, Combobox, ComboboxInput, Field, Root, Select, SelectTrigger,
  Text, TextArea, TextInput, Tooltip } from "./index.js";
import { CellSurface } from "./browser.js";

const context = {
  setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), fillText: vi.fn(),
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

it.each(["text-input", "text-area", "select", "combobox"] as const)(
  "exposes the %s validation message to the real browser control", (kind) => {
    const state = new CellTextEditor({ value: "" }).snapshot();
    const control = kind === "text-input" ? <TextInput id="control" state={state} />
      : kind === "text-area" ? <TextArea id="control" state={state} />
      : kind === "select" ? <Select><SelectTrigger id="control"><Text>Choose</Text></SelectTrigger></Select>
      : <Combobox><ComboboxInput id="control" state={state} /></Combobox>;
    render(<CellSurface viewport={{ width: 32, height: 6 }} onCommand={() => {}}>
      <Root><Field id="field" label="Theme" error="Required">{control}</Field></Root>
    </CellSurface>);
    const role = kind === "select" ? "button" : kind === "combobox" ? "combobox" : "textbox";
    const input = screen.getByRole(role, { name: "Theme" });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "cell-semantic-field-error");
    expect(screen.getByRole("alert")).toHaveTextContent("! Required");
  },
);

it.each(["text-input", "text-area", "select", "combobox"] as const)(
  "keeps both %s descriptions through Tooltip focus and validation changes", async (kind) => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const state = new CellTextEditor({ value: "" }).snapshot();
    const control = kind === "text-input" ? <TextInput id="control" state={state} />
      : kind === "text-area" ? <TextArea id="control" state={state} />
      : kind === "select" ? <Select><SelectTrigger id="control"><Text>Choose</Text></SelectTrigger></Select>
      : <Combobox><ComboboxInput id="control" state={state} /></Combobox>;
    const view = (error?: string) => <><CellSurface viewport={{ width: 32, height: 8 }}
      focusedId="control" onCommand={() => {}}>
      <Root><Field id="field" label="Theme" error={error}>{control}</Field>
        <Tooltip id="control-tip" targetId="control" text="Choose a theme" />
      </Root>
    </CellSurface><button>Outside</button></>;
    const mounted = render(view("Required"));
    const role = kind === "select" ? "button" : kind === "combobox" ? "combobox" : "textbox";
    const input = screen.getByRole(role, { name: "Theme" });
    expect(input).toHaveAttribute("aria-describedby", "cell-semantic-field-error");
    input.focus();
    await waitFor(() => expect(input).toHaveAttribute("aria-describedby",
      "cell-semantic-field-error cell-semantic-control-tip"));
    mounted.rerender(view());
    await waitFor(() => expect(input).toHaveAttribute("aria-describedby", "cell-semantic-control-tip"));
    screen.getByRole("button", { name: "Outside" }).focus();
    await waitFor(() => expect(input).not.toHaveAttribute("aria-describedby"));
  },
);
