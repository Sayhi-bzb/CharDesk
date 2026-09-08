import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { STRUCTURED_CONTEXT_MENU } from "@/domains/actions/public";
import { setCanvasTestState, useEditorStore } from "@/domains/canvas/testing";
import { StructuredSplitToolbar } from "./StructuredSplitToolbar";

const splitBox = {
  id: "split-1",
  type: "splitBox" as const,
  order: 1,
  start: { x: 0, y: 0 },
  end: { x: 9, y: 9 },
  verticalSplitRatio: 0.5,
  topSplitRatio: 0.25,
  bottomSplitRatio: 0.75,
  root: { type: "leaf" as const, id: "root-leaf" },
  style: { color: "#ffffff" },
};

describe("StructuredSplitToolbar", () => {
  const initialState = useEditorStore.getState();

  afterEach(() => {
    useEditorStore.setState(initialState, true);
  });

  it("splits the active split box leaf", () => {
    setCanvasTestState({
      canvasMode: "structured",
      offset: { x: 0, y: 0 },
      zoom: 1,
      selectedStructuredNodeIds: ["split-1"],
      hoveredGrid: { x: 2, y: 2 },
      structuredScene: [splitBox],
    });

    render(<StructuredSplitToolbar containerSize={{ width: 800, height: 600 }} />);

    const toolbar = screen.getByRole("toolbar", { name: "Split box controls" });
    expect(toolbar).toHaveClass(
      "bg-host-surface",
      "border-0",
      "shadow-host",
      "rounded-surface",
      "p-1"
    );
    expect(screen.getByLabelText("Delete split divider")).toBeDisabled();

    const splitHorizontal = screen.getByLabelText("Split box horizontally");
    expect(fireEvent.mouseDown(splitHorizontal)).toBe(false);
    fireEvent.click(splitHorizontal);

    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: "split-1",
      root: {
        type: "split",
        axis: "horizontal",
        first: { type: "leaf", id: "root-leaf" },
      },
    });
  });

  it("disables split actions without an active leaf", () => {
    setCanvasTestState({
      canvasMode: "structured",
      offset: { x: 0, y: 0 },
      zoom: 1,
      selectedStructuredNodeIds: ["split-1"],
      hoveredGrid: { x: 20, y: 20 },
      structuredContextPoint: null,
      structuredScene: [splitBox],
    });

    render(<StructuredSplitToolbar containerSize={{ width: 800, height: 600 }} />);

    expect(screen.getByLabelText("Split box horizontally")).toBeDisabled();
    expect(screen.getByLabelText("Split box vertically")).toBeDisabled();
    expect(screen.getByLabelText("Delete split divider")).toBeDisabled();
  });

  it("deletes a selected split divider", () => {
    setCanvasTestState({
      canvasMode: "structured",
      offset: { x: 0, y: 0 },
      zoom: 1,
      selectedStructuredNodeIds: ["split-1"],
      selectedStructuredSplitHandle: {
        nodeId: "split-1",
        handle: "split:split-existing",
      },
      structuredScene: [
        {
          ...splitBox,
          root: {
            type: "split",
            id: "split-existing",
            axis: "vertical",
            ratio: 0.5,
            first: { type: "leaf", id: "left" },
            second: { type: "leaf", id: "right" },
          },
        },
      ],
    });

    render(<StructuredSplitToolbar containerSize={{ width: 800, height: 600 }} />);
    fireEvent.click(screen.getByLabelText("Delete split divider"));

    expect(useEditorStore.getState().structuredScene[0]).toMatchObject({
      id: "split-1",
      root: { type: "leaf", id: "leaf-split-existing" },
    });
  });

  it("keeps split actions out of the structured context menu", () => {
    const actionIds = STRUCTURED_CONTEXT_MENU.flatMap((entry) =>
      entry.type === "action" ? [entry.id] : []
    );

    expect(actionIds).not.toContain("structured-split-horizontal");
    expect(actionIds).not.toContain("structured-split-vertical");
    expect(actionIds).not.toContain("structured-delete-divider");
  });
});
