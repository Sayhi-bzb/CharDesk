import { isStaticGridMode } from "@/domains/sessions/public";
import { COLOR_PRIMARY_TEXT } from "@/shared/lib/constants";
import type { GridCell, GridPoint, Point } from "@/shared/types";
import { placeCharInMap } from "@/domains/canvas/state/utils";
import { writeStyledCell } from "@/shared/utils/grid-ops";
import {
  getArrowLinePoints,
  getBoxPoints,
  getCirclePoints,
  getLShapeLinePoints,
  getStepLinePoints,
} from "@/shared/utils/shapes";
import { getDefaultSplitBoxPoints } from "@/shared/utils/split-box-shape";
import type { ToolType } from "../../model/tool";
import { createCanvasInteractionPatch } from "../canvasInteractionState";
import type { CanvasState } from "../interfaces";

type ScratchLayerState = Pick<
  CanvasState,
  | "brushColor"
  | "brushBackgroundColor"
  | "canvasMode"
  | "interaction"
>;

type ShapeOptions = { axis?: "vertical" | "horizontal" | null };
type InteractionPatch = Pick<CanvasState, "interaction">;

const getFilledRectPoints = (start: Point, end: Point): GridPoint[] => {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const points: GridPoint[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      points.push({ x, y, char: " " });
    }
  }
  return points;
};

const addPointsToLayer = (
  layer: Map<string, GridCell>,
  points: GridPoint[],
  brushColor: string
) => {
  points.forEach((point) => {
    if (point.bgColor || point.attrs || point.href) {
      writeStyledCell(layer, point.x, point.y, {
        char: point.char,
        color: point.color || brushColor,
        ...(point.bgColor ? { bgColor: point.bgColor } : {}),
        ...(point.attrs ? { attrs: point.attrs } : {}),
        ...(point.href ? { href: point.href } : {}),
      });
      return;
    }
    placeCharInMap(
      layer,
      point.x,
      point.y,
      point.char,
      point.color || brushColor
    );
  });
};

const createShapePoints = (
  state: ScratchLayerState,
  tool: ToolType,
  start: Point,
  end: Point,
  options?: ShapeOptions
): GridPoint[] => {
  const backgroundColor = isStaticGridMode(state.canvasMode)
    ? state.brushBackgroundColor
    : state.brushColor;
  let points: GridPoint[] = [];

  switch (tool) {
    case "box":
      points = getBoxPoints(start, end);
      break;
    case "splitBox":
      points = getDefaultSplitBoxPoints(start, end);
      break;
    case "bg":
      points = getFilledRectPoints(start, end).map((point) => ({
        ...point,
        color: COLOR_PRIMARY_TEXT,
        bgColor: backgroundColor,
      }));
      break;
    case "circle":
      points = getCirclePoints(start, end);
      break;
    case "stepline":
      points = getStepLinePoints(start, end);
      break;
    case "arrowLine":
      points = getArrowLinePoints(
        start,
        end,
        options?.axis === "vertical"
      );
      break;
    case "line":
      points = getLShapeLinePoints(
        start,
        end,
        options?.axis === "vertical"
      );
      break;
  }

  return points.map((point) => ({
    ...point,
    color: point.color || state.brushColor,
  }));
};

export const createScratchLayerPatch = (
  state: Pick<ScratchLayerState, "brushColor" | "interaction">,
  points: GridPoint[]
): InteractionPatch => {
  const scratchLayer = new Map<string, GridCell>();
  addPointsToLayer(scratchLayer, points, state.brushColor);
  return createCanvasInteractionPatch(state.interaction, { scratchLayer });
};

export const createAddedScratchPointsPatch = (
  state: Pick<ScratchLayerState, "brushColor" | "interaction">,
  points: GridPoint[]
): InteractionPatch => {
  const scratchLayer = new Map(state.interaction.scratchLayer ?? []);
  addPointsToLayer(scratchLayer, points, state.brushColor);
  return createCanvasInteractionPatch(state.interaction, { scratchLayer });
};

export const createShapeScratchLayerPatch = (
  state: ScratchLayerState,
  tool: ToolType,
  start: Point,
  end: Point,
  options?: ShapeOptions
): InteractionPatch =>
  createScratchLayerPatch(
    state,
    createShapePoints(state, tool, start, end, options)
  );

export const createClearedScratchLayerPatch = (
  interaction: CanvasState["interaction"]
): InteractionPatch =>
  createCanvasInteractionPatch(interaction, { scratchLayer: null });
