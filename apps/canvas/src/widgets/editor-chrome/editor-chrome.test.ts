import { describe, expect, it } from "vitest";
import {
  resolveEditorFormFactor,
  resolvePaneViewportFrame,
  resolveEditorViewportFrame,
  resolveSidebarPresentation,
} from "./public";

const rect = (
  left: number,
  top: number,
  width: number,
  height: number
) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

describe("editor chrome geometry", () => {
  it("resolves container form factors and sidebar presentations", () => {
    expect(resolveEditorFormFactor(1400)).toBe("desktop");
    expect(resolveEditorFormFactor(1199)).toBe("compact");
    expect(resolveEditorFormFactor(767)).toBe("phone");
    expect(resolveSidebarPresentation("desktop")).toBe("docked");
    expect(resolveSidebarPresentation("compact")).toBe("overlay");
    expect(resolveSidebarPresentation("phone")).toBe("sheet");
  });

  it("aggregates occupied edges into one usable viewport", () => {
    const frame = resolveEditorViewportFrame(rect(0, 0, 1000, 700), [
      { edge: "top", rect: rect(12, 12, 320, 32) },
      { edge: "top", rect: rect(500, 12, 100, 40) },
      { edge: "bottom", rect: rect(300, 650, 400, 38) },
      { edge: "right", rect: rect(700, 12, 288, 676) },
    ]);

    expect(frame.insets).toEqual({ top: 52, right: 300, bottom: 50, left: 0 });
    expect(frame.usableRect).toEqual({
      x: 0,
      y: 52,
      width: 700,
      height: 598,
    });
    expect(frame.center).toEqual({ x: 350, y: 351 });
  });

  it("projects global chrome onto the pane that touches each outer edge", () => {
    const frame = resolveEditorViewportFrame(rect(0, 0, 1000, 700), [
      { edge: "top", rect: rect(0, 0, 1000, 40) },
      { edge: "left", rect: rect(0, 0, 80, 700) },
      { edge: "right", rect: rect(760, 0, 240, 700) },
      { edge: "bottom", rect: rect(0, 660, 1000, 40) },
    ]);

    expect(resolvePaneViewportFrame(frame, { width: 450, height: 700 }, "start")).toMatchObject({
      insets: { top: 40, right: 0, bottom: 40, left: 80 },
      usableRect: { x: 80, y: 40, width: 370, height: 620 },
      center: { x: 265, y: 350 },
    });
    expect(resolvePaneViewportFrame(frame, { width: 550, height: 700 }, "end")).toMatchObject({
      insets: { top: 40, right: 240, bottom: 40, left: 0 },
      usableRect: { x: 0, y: 40, width: 310, height: 620 },
      center: { x: 155, y: 350 },
    });
  });
});
