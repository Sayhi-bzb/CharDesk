import { describe, expect, it } from "vitest";
import { isBlackboardRoute, isLocalBlackboardReaderRoute } from "./blackboardRoute";

describe("Blackboard routes", () => {
  it.each([
    "/blackboard",
    "/s/0123456789abcdefABCDEF/",
  ])("recognizes %s", (pathname) => {
    expect(isBlackboardRoute({ pathname })).toBe(true);
  });

  it.each([
    "/",
    "/blackboards",
    "/s/short/",
    "/s/0123456789abcdefABCDEF/board",
  ])("rejects %s", (pathname) => {
    expect(isBlackboardRoute({ pathname })).toBe(false);
  });

  it("uses the opaque session root as the local reader route", () => {
    expect(isLocalBlackboardReaderRoute({
      pathname: "/s/0123456789abcdefABCDEF/",
    })).toBe(true);
    expect(isLocalBlackboardReaderRoute({
      pathname: "/blackboard",
    })).toBe(false);
  });
});
