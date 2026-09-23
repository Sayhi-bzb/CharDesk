import { describe, expect, it } from "vitest";
import {
  fitInlineControlChromeInsets,
  inlineControlChromeGeometry,
  inlineControlChromeInsets,
  inlineControlChromeMetrics,
  inlineControlSpacingRecipe,
  isInlineControlTrailingActionX,
} from "./inline-control-chrome.js";
import type { WidgetKind, WidgetNode } from "./types.js";

const node = (kind: WidgetKind, hasContent = true) => ({
  kind,
  children: hasContent ? ["content"] : [],
}) as unknown as WidgetNode;

describe("inline control chrome", () => {
  it.each([
    ["sm", 0],
    ["default", 1],
    ["lg", 2],
  ] as const)("maps Button size %s to content inset %d", (buttonSize, inset) => {
    const recipe = inlineControlSpacingRecipe({
      ...node("button"),
      buttonSize,
    });
    expect(recipe.defaultContentInsets).toEqual({ left: inset, right: inset });
    expect(inlineControlChromeInsets(recipe.chrome)).toEqual({ left: 0, right: 0 });
  });

  it("owns the fixed TextInput content inset in the shared spacing recipe", () => {
    expect(inlineControlSpacingRecipe(node("text-input")).defaultContentInsets)
      .toEqual({ left: 1, right: 1 });
  });

  it.each([
    ["checkbox", { left: 5, right: 1 }, { leading: { x: 1, width: 3 }, trailing: null }],
    ["radio-item", { left: 5, right: 1 }, { leading: { x: 1, width: 3 }, trailing: null }],
    ["toggle", { left: 3, right: 1 }, { leading: { x: 1, width: 1 }, trailing: null }],
    ["select-trigger", { left: 1, right: 3 }, { leading: null, trailing: { x: 10, width: 1 } }],
    ["combobox-input", { left: 1, right: 3 }, { leading: null, trailing: { x: 10, width: 1 } }],
    ["select-item", { left: 1, right: 3 }, { leading: null, trailing: { x: 10, width: 1 } }],
    ["combobox-item", { left: 1, right: 3 }, { leading: null, trailing: { x: 10, width: 1 } }],
  ] as const)("shares owned insets and positions for %s", (kind, insets, indicators) => {
    const metrics = inlineControlChromeMetrics(node(kind));
    const geometry = inlineControlChromeGeometry(metrics, 0, 12);
    expect(inlineControlChromeInsets(metrics)).toEqual(insets);
    expect(geometry).toMatchObject({
      leadingGuardX: 0,
      leadingIndicator: indicators.leading,
      trailingIndicator: indicators.trailing,
      trailingGuardX: 11,
    });
  });

  it("omits the content gap for an indicator-only Checkbox", () => {
    const metrics = inlineControlChromeMetrics(node("checkbox", false));
    expect(inlineControlChromeInsets(metrics)).toEqual({ left: 4, right: 1 });
  });

  it("fits explicit narrow widths without sacrificing the indicator", () => {
    const toggle = inlineControlChromeMetrics(node("toggle"));
    expect(fitInlineControlChromeInsets(inlineControlChromeInsets(toggle), 1))
      .toEqual({ left: 0, right: 1 });
    expect(inlineControlChromeGeometry(toggle, 0, 1)).toMatchObject({
      leadingGuardX: null,
      leadingIndicator: { x: 0, width: 1 },
      trailingGuardX: 0,
    });

    const select = inlineControlChromeMetrics(node("select-trigger"));
    expect(inlineControlChromeGeometry(select, 0, 1).trailingIndicator).toBeNull();
    expect(isInlineControlTrailingActionX(select, 0, 0, 1)).toBe(false);
    expect(isInlineControlTrailingActionX(select, 0, 0, 2)).toBe(true);
    expect(isInlineControlTrailingActionX(select, 1, 0, 2)).toBe(true);
  });
});
