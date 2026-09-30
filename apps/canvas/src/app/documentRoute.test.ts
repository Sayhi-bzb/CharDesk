import { describe, expect, it } from "vitest";
import { isRetiredBlackboardRoute, isLocalDocumentReaderRoute } from "./documentRoute";

describe("Blackboard routes", () => {
  it.each([
    "/blackboard",
  ])("recognizes %s", (pathname) => {
    expect(isRetiredBlackboardRoute({ pathname })).toBe(true);
  });

  it.each([
    "/",
    "/s/0123456789abcdefABCDEF/",
    "/blackboards",
    "/s/short/",
    "/s/0123456789abcdefABCDEF/board",
  ])("rejects %s", (pathname) => {
    expect(isRetiredBlackboardRoute({ pathname })).toBe(false);
  });

  it("uses the opaque session root as the local reader route", () => {
    expect(isLocalDocumentReaderRoute({
      pathname: "/s/0123456789abcdefABCDEF/",
    })).toBe(true);
    expect(isLocalDocumentReaderRoute({
      pathname: "/blackboard",
    })).toBe(false);
  });
});
