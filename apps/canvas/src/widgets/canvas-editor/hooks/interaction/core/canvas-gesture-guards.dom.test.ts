import { describe, expect, it } from "vitest";
import {
  shouldIgnoreActiveCanvasGesture,
  shouldIgnoreCanvasSurfaceGesture,
  shouldIgnoreMinimapGesture,
} from "@/widgets/canvas-editor/hooks/interaction/core/gestureGuards";

const eventFrom = (target: Element) =>
  ({ target, composedPath: () => [target] }) as unknown as Event;

describe("canvas gesture guards", () => {
  it("ignores idle gestures that originate from the minimap", () => {
    const minimap = document.createElement("div");
    minimap.dataset.minimapRoot = "true";

    expect(
      shouldIgnoreMinimapGesture({
        event: eventFrom(minimap),
        interactionMode: "idle",
        hasDragStartGrid: false,
        isPanning: false,
      })
    ).toBe(true);
  });

  it("does not ignore minimap events during active gestures", () => {
    const minimap = document.createElement("div");
    minimap.dataset.minimapRoot = "true";

    expect(
      shouldIgnoreMinimapGesture({
        event: eventFrom(minimap),
        interactionMode: "drawing",
        hasDragStartGrid: false,
        isPanning: false,
      })
    ).toBe(false);
    expect(
      shouldIgnoreMinimapGesture({
        event: eventFrom(minimap),
        interactionMode: "idle",
        hasDragStartGrid: true,
        isPanning: false,
      })
    ).toBe(false);
    expect(
      shouldIgnoreMinimapGesture({
        event: eventFrom(minimap),
        interactionMode: "idle",
        hasDragStartGrid: false,
        isPanning: true,
      })
    ).toBe(false);
  });

  it("does not ignore non-minimap events", () => {
    expect(
      shouldIgnoreMinimapGesture({
        event: eventFrom(document.createElement("div")),
        interactionMode: "idle",
        hasDragStartGrid: false,
        isPanning: false,
      })
    ).toBe(false);
  });
  it("ignores direct canvas surface gestures from UI and minimap elements", () => {
    const canvasUi = document.createElement("button");
    canvasUi.dataset.canvasUi = "true";
    const minimap = document.createElement("div");
    minimap.dataset.minimapRoot = "true";

    expect(shouldIgnoreCanvasSurfaceGesture(eventFrom(canvasUi))).toBe(true);
    expect(shouldIgnoreCanvasSurfaceGesture(eventFrom(minimap))).toBe(true);
    expect(
      shouldIgnoreCanvasSurfaceGesture(eventFrom(document.createElement("div")))
    ).toBe(false);
  });

  it("ignores canvas UI gestures before a drag begins", () => {
    const canvasUi = document.createElement("button");
    canvasUi.dataset.canvasUi = "true";

    expect(
      shouldIgnoreActiveCanvasGesture({
        event: eventFrom(canvasUi),
        interactionMode: "idle",
        hasDragStartGrid: false,
        isPanning: false,
      })
    ).toBe(true);
  });

  it("does not discard an active drag retargeted to canvas UI", () => {
    const canvasUi = document.createElement("button");
    canvasUi.dataset.canvasUi = "true";

    expect(
      shouldIgnoreActiveCanvasGesture({
        event: eventFrom(canvasUi),
        interactionMode: "selecting",
        hasDragStartGrid: true,
        isPanning: false,
      })
    ).toBe(false);
  });

  it("uses minimap active gesture rules for active canvas gesture guards", () => {
    const minimap = document.createElement("div");
    minimap.dataset.minimapRoot = "true";

    expect(
      shouldIgnoreActiveCanvasGesture({
        event: eventFrom(minimap),
        interactionMode: "idle",
        hasDragStartGrid: false,
        isPanning: false,
      })
    ).toBe(true);
    expect(
      shouldIgnoreActiveCanvasGesture({
        event: eventFrom(minimap),
        interactionMode: "drawing",
        hasDragStartGrid: false,
        isPanning: false,
      })
    ).toBe(false);
  });
});
