import { expect, it, vi } from "vitest";
import { CellPresentationRegistry } from "./browser-presentation.js";

it("accepts only registered layers and rejects detached, foreign, and outside targets", () => {
  const registry = new CellPresentationRegistry();
  const base = document.createElement("canvas");
  const overlay = document.createElement("canvas");
  const foreign = document.createElement("canvas");
  registry.current = base;
  registry.setOverlay("menu", overlay);
  const hit = vi.fn().mockReturnValue(overlay);
  const previous = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: hit });
  try {
    expect(registry.acceptsPoint(12, 50)).toBe(true);
    expect(registry.canvases()).toEqual([base, overlay]);
    hit.mockReturnValue(foreign);
    expect(registry.acceptsPoint(12, 50)).toBe(false);
    hit.mockReturnValue(document.createElement("div"));
    expect(registry.acceptsPoint(12, 50)).toBe(false);
    hit.mockReturnValue(null);
    expect(registry.acceptsPoint(-1, -1)).toBe(false);
    registry.setOverlay("menu", null);
    hit.mockReturnValue(overlay);
    expect(registry.acceptsPoint(12, 50)).toBe(false);
    registry.current = null;
    expect(registry.owns(null)).toBe(false);
    expect(registry.canvases()).toEqual([]);
  } finally {
    if (previous) Object.defineProperty(document, "elementFromPoint", previous);
    else Reflect.deleteProperty(document, "elementFromPoint");
  }
});
