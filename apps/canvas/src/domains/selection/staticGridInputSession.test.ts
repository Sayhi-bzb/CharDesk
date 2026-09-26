import { describe, expect, it } from "vitest";
import {
  advanceStaticGridInput,
  advanceStaticGridInputLine,
  createStaticGridInputSession,
} from "./public";

const bounds = {
  start: { x: 0, y: 0 },
  end: { x: 4, y: 1 },
};

describe("static grid input session", () => {
  it("owns an explicit origin and advances by grapheme display width", () => {
    let session = createStaticGridInputSession({
      origin: { x: 2, y: 3 },
    });

    const ascii = advanceStaticGridInput({ session, width: 1 });
    expect(ascii.writeAt).toEqual({ x: 2, y: 3 });
    session = ascii.session;
    const wide = advanceStaticGridInput({ session, width: 2 });
    expect(wide.writeAt).toEqual({ x: 3, y: 3 });
    expect(wide.session).toMatchObject({
      origin: { x: 2, y: 3 },
      activeCell: { x: 5, y: 3 },
    });
  });

  it("wraps to the session origin without splitting a wide grapheme", () => {
    const session = createStaticGridInputSession({
      origin: { x: 3, y: 0 },
      bounds,
    });
    const ascii = advanceStaticGridInput({ session, width: 1, bounds });
    const secondAscii = advanceStaticGridInput({
      session: ascii.session,
      width: 1,
      bounds,
    });
    const wide = advanceStaticGridInput({
      session: secondAscii.session,
      width: 2,
      bounds,
    });

    expect(ascii.writeAt).toEqual({ x: 3, y: 0 });
    expect(secondAscii.writeAt).toEqual({ x: 4, y: 0 });
    expect(wide.writeAt).toEqual({ x: 3, y: 1 });
    expect(wide.session).toMatchObject({
      origin: { x: 3, y: 0 },
      activeCell: { x: 3, y: 1 },
      previousCell: { x: 3, y: 1 },
      exhausted: true,
    });
  });

  it("stops at the final cell and keeps repeated input as a no-op", () => {
    const session = createStaticGridInputSession({
      origin: { x: 4, y: 1 },
      bounds,
    });
    const final = advanceStaticGridInput({ session, width: 1, bounds });
    const repeated = advanceStaticGridInput({
      session: final.session,
      width: 1,
      bounds,
    });

    expect(final.writeAt).toEqual({ x: 4, y: 1 });
    expect(final.session.exhausted).toBe(true);
    expect(repeated.writeAt).toBeNull();
    expect(repeated.session).toBe(final.session);
  });

  it("exhausts when the session origin cannot fit a wide grapheme", () => {
    const session = createStaticGridInputSession({
      origin: { x: 4, y: 0 },
      bounds,
    });
    const result = advanceStaticGridInput({ session, width: 2, bounds });

    expect(result.writeAt).toBeNull();
    expect(result.session.exhausted).toBe(true);
  });

  it("uses the explicit origin for line advances", () => {
    const session = createStaticGridInputSession({
      origin: { x: 2, y: 0 },
      bounds,
    });
    const advanced = advanceStaticGridInput({ session, width: 2, bounds });

    expect(advanceStaticGridInputLine({
      session: advanced.session,
      bounds,
    }).activeCell).toEqual({ x: 2, y: 1 });
  });

  it("clamps the complete session origin to finite bounds", () => {
    expect(createStaticGridInputSession({
      origin: { x: 9, y: -2 },
      bounds,
    })).toMatchObject({
      origin: { x: 4, y: 0 },
      activeCell: { x: 4, y: 0 },
      nextCell: { x: 4, y: 0 },
    });
  });
});
