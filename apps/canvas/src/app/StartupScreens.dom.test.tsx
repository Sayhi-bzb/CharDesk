// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModuleLoadFailure, ModuleLoadingScreen } from "./StartupScreens";

describe("React startup presentation", () => {
  it("keeps the same shell for module loading", () => {
    render(<ModuleLoadingScreen />);
    expect(screen.getByRole("main")).toHaveClass("startup-shell");
    expect(screen.getByRole("main")).toHaveAttribute("data-startup-phase", "loading");
    expect(screen.getByRole("status")).toHaveTextContent("Loading Canvas");
  });

  it("shows a usable module failure", () => {
    const reload = vi.fn();
    render(<ModuleLoadFailure onReload={reload} />);
    expect(screen.getByRole("alert")).toHaveTextContent("The interface changed");
    screen.getByRole("button", { name: "Reload" }).click();
    expect(reload).toHaveBeenCalledOnce();
  });
});
