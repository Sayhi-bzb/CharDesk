export type EditorFormFactor = "desktop" | "compact" | "phone";

export type SidebarPresentation = "docked" | "overlay" | "sheet";

export type EditorChromeSlot =
  | "top-start"
  | "top-center"
  | "top-end"
  | "side-end"
  | "bottom-start"
  | "bottom-center"
  | "bottom-end";

export type EditorChromeEdge = "top" | "right" | "bottom" | "left";

type ViewportInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type EditorViewportFrame = {
  width: number;
  height: number;
  insets: ViewportInsets;
  usableRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  center: { x: number; y: number };
};

type EditorPanePosition = "single" | "start" | "end";

export const EMPTY_VIEWPORT_FRAME: EditorViewportFrame = {
  width: 0,
  height: 0,
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
  usableRect: { x: 0, y: 0, width: 0, height: 0 },
  center: { x: 0, y: 0 },
};

export const resolveEditorFormFactor = (width: number): EditorFormFactor => {
  if (width < 768) return "phone";
  if (width < 1200) return "compact";
  return "desktop";
};

export const resolveSidebarPresentation = (
  formFactor: EditorFormFactor
): SidebarPresentation => {
  if (formFactor === "phone") return "sheet";
  if (formFactor === "compact") return "overlay";
  return "docked";
};

type RectLike = Pick<
  DOMRect,
  "top" | "right" | "bottom" | "left" | "width" | "height"
>;

export const resolveEditorViewportFrame = (
  viewportRect: RectLike,
  regions: ReadonlyArray<{ edge: EditorChromeEdge; rect: RectLike }>
): EditorViewportFrame => {
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const { edge, rect } of regions) {
    if (edge === "top") {
      insets.top = Math.max(insets.top, rect.bottom - viewportRect.top);
    } else if (edge === "right") {
      insets.right = Math.max(insets.right, viewportRect.right - rect.left);
    } else if (edge === "bottom") {
      insets.bottom = Math.max(insets.bottom, viewportRect.bottom - rect.top);
    } else {
      insets.left = Math.max(insets.left, rect.right - viewportRect.left);
    }
  }

  const width = Math.max(0, viewportRect.width);
  const height = Math.max(0, viewportRect.height);
  const usableWidth = Math.max(0, width - insets.left - insets.right);
  const usableHeight = Math.max(0, height - insets.top - insets.bottom);
  return {
    width,
    height,
    insets,
    usableRect: {
      x: insets.left,
      y: insets.top,
      width: usableWidth,
      height: usableHeight,
    },
    center: {
      x: insets.left + usableWidth / 2,
      y: insets.top + usableHeight / 2,
    },
  };
};

export const resolvePaneViewportFrame = (
  frame: EditorViewportFrame,
  size: { width: number; height: number },
  position: EditorPanePosition
): EditorViewportFrame => {
  const width = Math.max(0, size.width);
  const height = Math.max(0, size.height);
  const insets = {
    top: Math.min(height, frame.insets.top),
    right: position === "start" ? 0 : Math.min(width, frame.insets.right),
    bottom: Math.min(height, frame.insets.bottom),
    left: position === "end" ? 0 : Math.min(width, frame.insets.left),
  };
  const usableWidth = Math.max(0, width - insets.left - insets.right);
  const usableHeight = Math.max(0, height - insets.top - insets.bottom);
  return {
    width,
    height,
    insets,
    usableRect: {
      x: insets.left,
      y: insets.top,
      width: usableWidth,
      height: usableHeight,
    },
    center: {
      x: insets.left + usableWidth / 2,
      y: insets.top + usableHeight / 2,
    },
  };
};
