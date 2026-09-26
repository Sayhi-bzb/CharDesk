import { beforeEach, describe, expect, it } from "vitest";
import {
  ONBOARDING_STORAGE_KEY,
  readOnboardingStatus,
  shouldAutoStartOnboarding,
} from "./onboarding-model";

describe("shouldAutoStartOnboarding", () => {
  beforeEach(() => window.localStorage.clear());

  it("moves a legacy status to the CharDesk key", () => {
    window.localStorage.setItem("ascii-canvas-onboarding-v1", "completed");

    expect(readOnboardingStatus()).toBe("completed");
    expect(window.localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBe("completed");
    expect(window.localStorage.getItem("ascii-canvas-onboarding-v1")).toBeNull();
  });

  it("starts only for a new desktop user", () => {
    expect(
      shouldAutoStartOnboarding({
        isMobile: false,
        hasEditorPersistence: false,
        status: null,
      })
    ).toBe(true);
  });

  it.each([
    { isMobile: true, hasEditorPersistence: false, status: null },
    { isMobile: false, hasEditorPersistence: true, status: null },
    { isMobile: false, hasEditorPersistence: false, status: "dismissed" },
    { isMobile: false, hasEditorPersistence: false, status: "completed" },
  ])("does not start for an ineligible visit", (input) => {
    expect(shouldAutoStartOnboarding(input)).toBe(false);
  });
});
