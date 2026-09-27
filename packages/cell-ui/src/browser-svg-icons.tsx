import { cloneElement, type ReactElement, type SVGProps } from "react";
import type { CharDeskCellMetrics } from "@chardesk/rendering";
import { CELL_SURFACE_GUARD_CELLS } from "./browser-presentation.js";
import type { FrameSnapshot, WidgetId } from "./types.js";

/** Trusted React SVG elements, anchored to existing Cell node IDs. */
export type CellSvgIcons = Readonly<Record<WidgetId, ReactElement<SVGProps<SVGSVGElement>>>>;

export function CellSvgIconLayer({ frame, metrics, icons, foreground }: Readonly<{
  frame: FrameSnapshot;
  metrics: CharDeskCellMetrics;
  icons: CellSvgIcons;
  foreground: string;
}>) {
  return Object.entries(icons).map(([id, icon]) => {
    const entry = frame.scene.entries.get(id);
    if (!entry?.paintVisible) return null;
    const bounds = entry.contentBounds;
    const clip = entry.contentClip;
    if (!bounds.width || !bounds.height || !clip.width || !clip.height
      || bounds.x >= clip.x + clip.width || clip.x >= bounds.x + bounds.width
      || bounds.y >= clip.y + clip.height || clip.y >= bounds.y + bounds.height) return null;
    const cell = (entry.layer > 0 ? frame.overlayBuffer : frame.baseBuffer).get(bounds.x, bounds.y);
    const requestedSize = typeof icon.props.width === "number" ? icon.props.width : Infinity;
    const size = Math.min(bounds.width * metrics.cellWidth, metrics.cellHeight * 0.8, requestedSize);
    return (
      <span
        key={id}
        data-cell-svg-icon={id}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: (bounds.x + CELL_SURFACE_GUARD_CELLS) * metrics.cellWidth,
          top: (bounds.y + CELL_SURFACE_GUARD_CELLS) * metrics.cellHeight,
          width: bounds.width * metrics.cellWidth,
          height: bounds.height * metrics.cellHeight,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          clipPath: `inset(${Math.max(0, clip.y - bounds.y) * metrics.cellHeight}px ${Math.max(0, bounds.x + bounds.width - clip.x - clip.width) * metrics.cellWidth}px ${Math.max(0, bounds.y + bounds.height - clip.y - clip.height) * metrics.cellHeight}px ${Math.max(0, clip.x - bounds.x) * metrics.cellWidth}px)`,
          zIndex: entry.layer,
          pointerEvents: "none",
          color: cell?.style.color ?? foreground,
        }}
      >
        {cloneElement(icon, {
          ...icon.props,
          width: size,
          height: size,
          "aria-hidden": true,
          focusable: false,
          style: { ...icon.props.style, width: size, height: size, color: "inherit" },
        })}
      </span>
    );
  });
}
