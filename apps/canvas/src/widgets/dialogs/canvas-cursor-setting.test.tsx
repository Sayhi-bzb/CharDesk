import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { CanvasCursorProvider } from "@/shared/canvas-cursor/react";
import { createCanvasCursorRuntime } from "@/shared/canvas-cursor/runtime";
import {
  CanvasCursorBlinkCheckbox,
  CanvasCursorShapeSelect,
} from "./canvas-cursor-setting";

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: () => undefined,
  });
});

describe("Canvas cursor setting", () => {
  it("updates Host cursor shape and blink independently", async () => {
    const runtime = createCanvasCursorRuntime();
    render(
      <CanvasCursorProvider runtime={runtime}>
        <CanvasCursorShapeSelect />
        <CanvasCursorBlinkCheckbox />
      </CanvasCursorProvider>
    );

    const shape = screen.getByRole("combobox", { name: "Canvas cursor" });
    fireEvent.keyDown(shape, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Underline" }));
    expect(runtime.getSnapshot().shape).toBe("underline");

    fireEvent.click(screen.getByRole("checkbox", { name: "Blink cursor" }));
    expect(runtime.getSnapshot()).toEqual({ shape: "underline", blink: false });

    await act(async () => runtime.dispose());
  });
});
