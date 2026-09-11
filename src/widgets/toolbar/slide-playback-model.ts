import { DEFAULT_CANVAS_CELL_METRICS } from "@/shared/fonts/canvas-profile";

const PAGE_PADDING = 32;
const MAX_PLAYBACK_FONT_SIZE = 30;

export const SLIDE_PLAYBACK_MAX_ZOOM =
  MAX_PLAYBACK_FONT_SIZE / DEFAULT_CANVAS_CELL_METRICS.fontSize;

export type SlidePlaybackLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
};

export const resolveSlidePlaybackLayout = ({
  viewportWidth,
  viewportHeight,
  columns,
  rows,
  padding = PAGE_PADDING,
  maxZoom = Number.POSITIVE_INFINITY,
}: {
  viewportWidth: number;
  viewportHeight: number;
  columns: number;
  rows: number;
  padding?: number;
  maxZoom?: number;
}): SlidePlaybackLayout => {
  const availableWidth = Math.max(1, viewportWidth - padding * 2);
  const availableHeight = Math.max(1, viewportHeight - padding * 2);
  const zoom = Math.max(
    0.01,
    Math.min(
      availableWidth / (columns * DEFAULT_CANVAS_CELL_METRICS.cellWidth),
      availableHeight / (rows * DEFAULT_CANVAS_CELL_METRICS.cellHeight),
      maxZoom
    )
  );
  const width = columns * DEFAULT_CANVAS_CELL_METRICS.cellWidth * zoom;
  const height = rows * DEFAULT_CANVAS_CELL_METRICS.cellHeight * zoom;
  return {
    x: (viewportWidth - width) / 2,
    y: (viewportHeight - height) / 2,
    width,
    height,
    zoom,
  };
};

export const resolveSlidePlaybackIndex = (
  currentIndex: number,
  command: "previous" | "next" | "first" | "last",
  slideCount: number
) => {
  if (slideCount <= 0) return 0;
  switch (command) {
    case "first":
      return 0;
    case "last":
      return slideCount - 1;
    case "previous":
      return Math.max(0, currentIndex - 1);
    case "next":
      return Math.min(slideCount - 1, currentIndex + 1);
  }
};
