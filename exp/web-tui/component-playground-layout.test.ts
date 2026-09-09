import { describe, expect, it } from "vitest";
import {
  columnsForPixelWidth,
  resolveComponentPlaygroundLayout,
} from "./component-playground-layout";

describe("Component Playground layout", () => {
  it("quantizes host pixels inward to the nearest whole Cell", () => {
    expect(columnsForPixelWidth(808, 9)).toBe(89);
    expect(808 - columnsForPixelWidth(808, 9) * 9).toBeLessThan(9);
  });

  it("splits wide space evenly after reserving the divider", () => {
    const layout = resolveComponentPlaygroundLayout(89, 10, 25);
    expect(layout).toMatchObject({
      stacked: false,
      previewColumns: 44,
      propsColumns: 44,
      controlsInset: 9,
      controlsExtentColumns: 43,
    });
    expect(Math.abs(layout.previewColumns - layout.propsColumns)).toBeLessThanOrEqual(1);
  });

  it("lets the preview minimum squeeze Props while retaining a scrollable pane", () => {
    expect(resolveComponentPlaygroundLayout(64, 40, 25)).toMatchObject({
      previewColumns: 40,
      propsColumns: 23,
      controlsInset: 0,
      controlsExtentColumns: 25,
      controlsMinRows: 6,
    });
  });

  it("stacks both full-width panes below the Cell breakpoint", () => {
    expect(resolveComponentPlaygroundLayout(32, 10, 25)).toMatchObject({
      stacked: true,
      viewport: { width: 32, height: 15 },
      previewColumns: 32,
      propsColumns: 32,
      controlsInset: 3,
    });
  });
});
