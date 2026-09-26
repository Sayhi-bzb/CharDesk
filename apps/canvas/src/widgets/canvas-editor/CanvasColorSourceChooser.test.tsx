import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CanvasColorSourceChooser } from "./CanvasColorSourceChooser";
import { setUiLanguage } from "@/shared/i18n";
import { EditorPresentationProvider } from "@/widgets/editor-chrome/public";

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

const choice = {
  point: { x: 2, y: 3 },
  foreground: "#112233",
  background: "#445566",
  destination: "foreground" as const,
  applyStaticGridSelection: false,
  applyStructuredTextColor: false,
  applyStructuredSelectionPrimaryColor: false,
};

describe("CanvasColorSourceChooser", () => {
  afterEach(() => setUiLanguage("en"));

  it("anchors to the sampled cell and applies either color source", async () => {
    const onSelect = vi.fn();
    render(
      <div className="relative size-96">
        <CanvasColorSourceChooser
          choice={choice}
          offset={{ x: 0, y: 0 }}
          zoom={1}
          onSelect={onSelect}
          onCancel={vi.fn()}
        />
      </div>
    );

    expect(screen.getByTestId("canvas-color-source-anchor")).toHaveStyle({
      left: "18px",
      top: "60px",
      width: "9px",
      height: "20px",
    });
    const foreground = await screen.findByRole("button", {
      name: "Use cell character color #112233",
    });
    const background = screen.getByRole("button", {
      name: "Use cell background color #445566",
    });
    await waitFor(() => expect(foreground).toHaveFocus());
    expect(foreground.querySelector('[data-slot="color-swatch"]')).toHaveStyle({
      backgroundColor: "#112233",
    });
    expect(background.querySelector('[data-slot="color-swatch"]')).toHaveStyle({
      backgroundColor: "#445566",
    });
    expect(screen.getByRole("toolbar", { name: "Choose a color from this cell" })).toHaveClass(
      "data-[state=open]:animate-in",
      "motion-reduce:animate-none"
    );

    fireEvent.click(background);
    expect(onSelect).toHaveBeenCalledWith("background");
  });

  it("cancels the pending choice with Escape", async () => {
    const onCancel = vi.fn();
    render(
      <CanvasColorSourceChooser
        choice={choice}
        offset={{ x: 0, y: 0 }}
        zoom={1}
        onSelect={vi.fn()}
        onCancel={onCancel}
      />
    );

    const toolbar = await screen.findByRole("toolbar", {
      name: "Choose a color from this cell",
    });
    fireEvent.keyDown(toolbar, { key: "Escape" });
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
  });

  it("does not render the contextual chooser in Zen Mode", () => {
    render(
      <EditorPresentationProvider initialMode="zen">
        <CanvasColorSourceChooser
          choice={choice}
          offset={{ x: 0, y: 0 }}
          zoom={1}
          onSelect={vi.fn()}
          onCancel={vi.fn()}
        />
      </EditorPresentationProvider>
    );

    expect(screen.queryByTestId("canvas-color-source-anchor")).not.toBeInTheDocument();
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });
});
