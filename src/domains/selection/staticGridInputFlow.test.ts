import { describe, expect, it } from "vitest";
import { GridSnapshotSource } from "@/shared/utils/grid-source";
import {
  advanceStaticGridInputFlow,
  advanceStaticGridInputFlowLine,
  createStaticGridInputFlow,
} from "./public";

const bounds = {
  start: { x: 0, y: 0 },
  end: { x: 4, y: 1 },
};

describe("static grid input flow", () => {
  it("advances freeform input by grapheme display width", () => {
    let flow = createStaticGridInputFlow({
      grid: new GridSnapshotSource(),
      address: { x: 2, y: 3 },
    });

    const ascii = advanceStaticGridInputFlow({ flow, width: 1 });
    expect(ascii.writeAt).toEqual({ x: 2, y: 3 });
    flow = ascii.flow;
    const wide = advanceStaticGridInputFlow({ flow, width: 2 });
    expect(wide.writeAt).toEqual({ x: 3, y: 3 });
    expect(wide.flow.activeCell).toEqual({ x: 5, y: 3 });
  });

  it("wraps to the input line origin without splitting a wide grapheme", () => {
    const flow = createStaticGridInputFlow({
      grid: new GridSnapshotSource(),
      address: { x: 3, y: 0 },
      bounds,
    });
    const ascii = advanceStaticGridInputFlow({ flow, width: 1, bounds });
    const secondAscii = advanceStaticGridInputFlow({
      flow: ascii.flow,
      width: 1,
      bounds,
    });
    const wide = advanceStaticGridInputFlow({
      flow: secondAscii.flow,
      width: 2,
      bounds,
    });

    expect(ascii.writeAt).toEqual({ x: 3, y: 0 });
    expect(secondAscii.writeAt).toEqual({ x: 4, y: 0 });
    expect(wide.writeAt).toEqual({ x: 3, y: 1 });
    expect(wide.flow).toMatchObject({
      activeCell: { x: 3, y: 1 },
      previousCell: { x: 3, y: 1 },
      exhausted: true,
    });
  });

  it("stops at the final cell and keeps repeated input as a no-op", () => {
    const flow = createStaticGridInputFlow({
      grid: new GridSnapshotSource(),
      address: { x: 4, y: 1 },
      bounds,
    });
    const final = advanceStaticGridInputFlow({ flow, width: 1, bounds });
    const repeated = advanceStaticGridInputFlow({
      flow: final.flow,
      width: 1,
      bounds,
    });

    expect(final.writeAt).toEqual({ x: 4, y: 1 });
    expect(final.flow.exhausted).toBe(true);
    expect(repeated.writeAt).toBeNull();
    expect(repeated.flow).toBe(final.flow);
  });

  it("exhausts when the line origin cannot fit a wide grapheme", () => {
    const flow = createStaticGridInputFlow({
      grid: new GridSnapshotSource(),
      address: { x: 4, y: 0 },
      bounds,
    });
    const result = advanceStaticGridInputFlow({ flow, width: 2, bounds });

    expect(result.writeAt).toBeNull();
    expect(result.flow.exhausted).toBe(true);
  });

  it("uses the same line origin for explicit line advances", () => {
    const flow = createStaticGridInputFlow({
      grid: new GridSnapshotSource([["2,0", { char: "A", color: "#fff" }]]),
      address: { x: 4, y: 0 },
      bounds,
    });

    expect(advanceStaticGridInputFlowLine({ flow, bounds }).activeCell).toEqual({
      x: 2,
      y: 1,
    });
  });
});
