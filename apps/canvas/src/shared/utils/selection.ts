import type { SelectionArea } from "@/shared/types";

export const getSelectionBounds = (area: SelectionArea) => {
  const minX = Math.min(area.start.x, area.end.x);
  const maxX = Math.max(area.start.x, area.end.x);
  const minY = Math.min(area.start.y, area.end.y);
  const maxY = Math.max(area.start.y, area.end.y);
  return { minX, maxX, minY, maxY };
};

export const getSelectionsBoundingBox = (selections: SelectionArea[]) => {
  if (selections.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;

  selections.forEach((area) => {
    minX = Math.min(minX, area.start.x, area.end.x);
    maxX = Math.max(maxX, area.start.x, area.end.x);
    minY = Math.min(minY, area.start.y, area.end.y);
    maxY = Math.max(maxY, area.start.y, area.end.y);
  });

  return { minX, maxX, minY, maxY };
};
