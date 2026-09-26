import { describe, expect, it } from "vitest";

import {
  resolveCanvasContentDpr,
  resolveCanvasContentResolutionMode,
} from "./canvasContentResolution";

describe("canvas content resolution", () => {
  it("enters coarse mode at 48% and exits at 55%", () => {
    expect(resolveCanvasContentResolutionMode(0.49, "full")).toBe("full");
    expect(resolveCanvasContentResolutionMode(0.48, "full")).toBe("coarse");
    expect(resolveCanvasContentResolutionMode(0.54, "coarse")).toBe("coarse");
    expect(resolveCanvasContentResolutionMode(0.55, "coarse")).toBe("full");
  });

  it("keeps the current mode inside the hysteresis range", () => {
    expect(resolveCanvasContentResolutionMode(0.5, "full")).toBe("full");
    expect(resolveCanvasContentResolutionMode(0.5, "coarse")).toBe("coarse");
  });

  it.each([
    { deviceDpr: 1, full: 1, coarse: 1 },
    { deviceDpr: 1.5, full: 1.5, coarse: 1.5 },
    { deviceDpr: 2, full: 2, coarse: 1.5 },
    { deviceDpr: 3, full: 3, coarse: 1.5 },
  ])("resolves backing DPR for device DPR $deviceDpr", ({ deviceDpr, full, coarse }) => {
    expect(resolveCanvasContentDpr(deviceDpr, "full")).toBe(full);
    expect(resolveCanvasContentDpr(deviceDpr, "coarse")).toBe(coarse);
  });

  it("does not increase sub-1 device DPR and falls back for invalid values", () => {
    expect(resolveCanvasContentDpr(0.75, "coarse")).toBe(0.75);
    expect(resolveCanvasContentDpr(Number.NaN, "full")).toBe(1);
  });
});
