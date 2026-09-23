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
  it("keeps Button's default content inset independent of consumer padding", () => {
    const recipe = inlineControlSpacingRecipe(node("button"));
    expect(recipe.defaultContentInsets).toEqual({ left: 1, right: 1 });
    expect(inlineControlChromeInsets(recipe.chrome)).toEqual({ left: 0, right: 0 });
  });

  it("reserves a guard and a gap before TextInput content", () => {
    const recipe = inlineControlSpacingRecipe(node("text-input"));
    expect(recipe.defaultContentInsets).toEqual({ left: 0, right: 1 });
    expect(inlineControlChromeInsets(recipe.chrome)).toEqual({ left: 2, right: 0 });
    expect(inlineControlChromeGeometry(recipe.chrome, 0, 12)).toMatchObject({
      leadingGuardX: 0,
      trailingGuardX: null,
    });
  });

  it.each([
    ["checkbox", { left: 5, right: 1 }, { leading: { x: 1, width: 3 }, trailing: null }],
    ["radio-item", { left: 5, right: 1 }, { leading: { x: 1, width: 3 }, trailing: null }],
    ["toggle", { left: 3, right: 1 }, { leading: { x: 1, width: 1 }, trailing: null }],
    ["select-trigger", { left: 1, right: 3 }, { leading: null, trailing: { x: 10, width: 1 } }],
    ["combobox-input", { left: 2, right: 3 }, { leading: null, trailing: { x: 10, width: 1 } }],
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

    const input = inlineControlChromeMetrics(node("text-input"));
    expect(inlineControlChromeGeometry(input, 0, 0).leadingGuardX).toBeNull();
    expect(inlineControlChromeGeometry(input, 0, 1).leadingGuardX).toBe(0);
    const combobox = inlineControlChromeMetrics(node("combobox-input"));
    expect(inlineControlChromeGeometry(combobox, 0, 1)).toMatchObject({
      leadingGuardX: 0,
      trailingGuardX: 0,
    });
  });
});
