import { describe, expect, it } from "vitest";
import {
  getDockShortcutAriaLabel,
  getDockShortcutBinding,
  getDockShortcutLabel,
} from "./shortcuts";

describe("dock shortcuts", () => {
  it("formats canonical bindings, visible labels, and accessible labels", () => {
    expect(getDockShortcutBinding(0, "mac")).toBe("ctrl+1");
    expect(getDockShortcutBinding(5, "other")).toBe("alt+6");
    expect(getDockShortcutLabel(0, "mac")).toBe("⌃1");
    expect(getDockShortcutLabel(5, "other")).toBe("Alt+6");
    expect(getDockShortcutAriaLabel(2, "mac")).toBe("Control+3");
    expect(getDockShortcutAriaLabel(2, "other")).toBe("Alt+3");
  });
});
