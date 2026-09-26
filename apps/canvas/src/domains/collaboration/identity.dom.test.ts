import { beforeEach, describe, expect, it } from "vitest";
import { getCollaborationIdentity } from "./identity";

const CURRENT_KEY = "chardesk-collaboration-identity";
const LEGACY_KEY = "ascii-canvas-collaboration-identity";

describe("collaboration identity persistence", () => {
  beforeEach(() => window.localStorage.clear());

  it("migrates a valid legacy identity", () => {
    const legacy = { id: "guest-id", name: "Guest ABCD", color: "#3e63dd" };
    window.localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy));

    expect(getCollaborationIdentity()).toEqual(legacy);
    expect(JSON.parse(window.localStorage.getItem(CURRENT_KEY)!)).toEqual(legacy);
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("prefers the current identity and removes a stale legacy copy", () => {
    const current = { id: "current-id", name: "Guest NOW", color: "#30a46c" };
    window.localStorage.setItem(CURRENT_KEY, JSON.stringify(current));
    window.localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ id: "old-id", name: "Guest OLD", color: "#e5484d" })
    );

    expect(getCollaborationIdentity()).toEqual(current);
    expect(window.localStorage.getItem(LEGACY_KEY)).toBeNull();
  });
});
