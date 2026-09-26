import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HostThemeSelect } from "./host-theme-setting";

const theme = vi.hoisted(() => ({
  mode: "light",
  setTheme: vi.fn(),
}));

vi.mock("@chardesk/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chardesk/ui")>()),
  useUiTheme: () => ({
    theme: theme.mode,
    resolvedTheme: theme.mode,
    setTheme: theme.setTheme,
  }),
}));

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

describe("HostThemeSelect", () => {
  beforeEach(() => {
    theme.mode = "light";
    theme.setTheme.mockReset();
  });

  it("offers the complete Host theme contract", async () => {
    render(<HostThemeSelect />);
    const trigger = screen.getByRole("combobox");

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const dark = await screen.findByRole("option", { name: "Dark" });
    fireEvent.pointerDown(dark, { pointerType: "touch" });
    fireEvent.click(dark);

    expect(theme.setTheme).toHaveBeenCalledWith("dark");
  });
});
