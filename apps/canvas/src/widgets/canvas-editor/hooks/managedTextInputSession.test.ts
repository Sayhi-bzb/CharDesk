import { describe, expect, it } from "vitest";
import {
  isCompositionInputType,
  shouldSuppressFinalizedCompositionInput,
} from "./managedTextInputSession";

describe("managedTextInputSession", () => {
  it("recognizes composition input variants emitted around compositionend", () => {
    expect(isCompositionInputType("insertCompositionText")).toBe(true);
    expect(isCompositionInputType("insertFromComposition")).toBe(true);
    expect(isCompositionInputType("insertText")).toBe(false);
  });

  it("suppresses only a matching terminal composition value", () => {
    const finalized = { value: "中文" };
    expect(shouldSuppressFinalizedCompositionInput(
      finalized,
      "中文",
      "insertCompositionText"
    )).toBe(true);
    expect(shouldSuppressFinalizedCompositionInput(
      finalized,
      "中文",
      "insertFromComposition"
    )).toBe(true);
    expect(shouldSuppressFinalizedCompositionInput(finalized, "中文", undefined)).toBe(true);
    expect(shouldSuppressFinalizedCompositionInput(
      finalized,
      "中",
      "insertCompositionText"
    )).toBe(false);
    expect(shouldSuppressFinalizedCompositionInput(
      finalized,
      "中文",
      "insertText"
    )).toBe(false);
  });
});
