import type { WidgetNode } from "./types.js";

export type InlineControlChromeMetrics = Readonly<{
  leadingGuard: number;
  leadingIndicator: number;
  leadingGap: number;
  trailingGap: number;
  trailingIndicator: number;
  trailingGuard: number;
}>;

export type InlineControlChromeGeometry = Readonly<{
  leadingGuardX: number | null;
  leadingIndicator: Readonly<{ x: number; width: number }> | null;
  trailingIndicator: Readonly<{ x: number; width: number }> | null;
  trailingGuardX: number | null;
}>;

type InlineControlInsets = Readonly<{ left: number; right: number }>;

export type InlineControlSpacingRecipe = Readonly<{
  chrome: InlineControlChromeMetrics;
  defaultContentInsets: InlineControlInsets;
}>;

const EMPTY_CHROME: InlineControlChromeMetrics = {
  leadingGuard: 0,
  leadingIndicator: 0,
  leadingGap: 0,
  trailingGap: 0,
  trailingIndicator: 0,
  trailingGuard: 0,
};

const NO_CONTENT_INSETS: InlineControlInsets = { left: 0, right: 0 };

const chromeMetrics = (node: WidgetNode): InlineControlChromeMetrics => {
  if (node.kind === "checkbox" || node.kind === "radio-item") {
    return {
      leadingGuard: 1,
      leadingIndicator: 3,
      leadingGap: node.children.length > 0 ? 1 : 0,
      trailingGap: 0,
      trailingIndicator: 0,
      trailingGuard: 1,
    };
  }
  if (node.kind === "toggle") {
    return {
      leadingGuard: 1,
      leadingIndicator: 1,
      leadingGap: node.children.length > 0 ? 1 : 0,
      trailingGap: 0,
      trailingIndicator: 0,
      trailingGuard: 1,
    };
  }
  if (node.kind === "text-input") {
    return { ...EMPTY_CHROME, leadingGuard: 1, leadingGap: 1 };
  }
  if (
    node.kind === "select-trigger"
    || node.kind === "combobox-input"
    || node.kind === "select-item"
    || node.kind === "combobox-item"
  ) {
    return {
      leadingGuard: 1,
      leadingIndicator: 0,
      leadingGap: node.kind === "combobox-input" ? 1 : 0,
      trailingGap: 1,
      trailingIndicator: 1,
      trailingGuard: 1,
    };
  }
  return EMPTY_CHROME;
};

export const inlineControlSpacingRecipe = (
  node: WidgetNode,
): InlineControlSpacingRecipe => {
  return {
    chrome: chromeMetrics(node),
    defaultContentInsets: node.kind === "button" || node.kind === "badge" || node.kind === "badge-action"
      ? { left: 1, right: 1 }
      : node.kind === "text-input"
        ? { left: 0, right: 1 }
        : NO_CONTENT_INSETS,
  };
};

export const inlineControlChromeMetrics = (node: WidgetNode): InlineControlChromeMetrics =>
  inlineControlSpacingRecipe(node).chrome;

export const inlineControlChromeInsets = (
  metrics: InlineControlChromeMetrics,
): InlineControlInsets => ({
  left: metrics.leadingGuard + metrics.leadingIndicator + metrics.leadingGap,
  right: metrics.trailingGap + metrics.trailingIndicator + metrics.trailingGuard,
});

export const fitInlineControlChromeInsets = (
  insets: Readonly<{ left: number; right: number }>,
  width: number | undefined,
): Readonly<{ left: number; right: number }> => {
  if (width === undefined) return insets;
  const available = Math.max(0, width);
  const right = Math.min(insets.right, available);
  return { left: Math.min(insets.left, available - right), right };
};

export const inlineControlChromeGeometry = (
  metrics: InlineControlChromeMetrics,
  left: number,
  right: number,
): InlineControlChromeGeometry => {
  const width = Math.max(0, right - left);
  const leadingIndicatorX = metrics.leadingIndicator > 0
    ? left + (width > metrics.leadingIndicator ? Math.min(metrics.leadingGuard, width - metrics.leadingIndicator) : 0)
    : null;
  const trailingIndicator = metrics.trailingIndicator > 0
    && width >= metrics.trailingIndicator + metrics.trailingGuard
    ? {
        x: right - metrics.trailingGuard - metrics.trailingIndicator,
        width: metrics.trailingIndicator,
      }
    : null;
  return {
    leadingGuardX: metrics.leadingGuard > 0 && width > 0
      && (leadingIndicatorX === null || leadingIndicatorX > left) ? left : null,
    leadingIndicator: leadingIndicatorX === null ? null : {
      x: leadingIndicatorX,
      width: Math.min(metrics.leadingIndicator, width),
    },
    trailingIndicator,
    trailingGuardX: metrics.trailingGuard > 0 && width > 0 ? right - 1 : null,
  };
};

export const isInlineControlTrailingActionX = (
  metrics: InlineControlChromeMetrics,
  x: number,
  left: number,
  right: number,
  actionRight = right,
): boolean => {
  const indicator = inlineControlChromeGeometry(metrics, left, right).trailingIndicator;
  return indicator !== null && x >= indicator.x && x < actionRight;
};
