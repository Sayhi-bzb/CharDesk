import { isStaticGridMode } from '@/domains/sessions/public';
import type { GridCell, GridPoint, Point } from '@/shared/types';
import { placeCharInMap } from '@/domains/canvas/state/utils';
import { writeStyledCell } from '@/shared/utils/grid-ops';
import { createShapePoints, type ShapeOptions } from '@chardesk/editor-core/drawing/planner';
import type { ToolType } from '../../model/tool';
import { createCanvasInteractionPatch } from '../canvasInteractionState';
import type { CanvasState } from '../interfaces';

type ScratchLayerState = Pick<
  CanvasState,
  'brushColor' | 'brushBackgroundColor' | 'canvasMode' | 'interaction'
>;

type InteractionPatch = Pick<CanvasState, 'interaction'>;

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
    placeCharInMap(layer, point.x, point.y, point.char, point.color || brushColor);
  });
};

export const createScratchLayerPatch = (
  state: Pick<ScratchLayerState, 'brushColor' | 'interaction'>,
  points: GridPoint[]
): InteractionPatch => {
  const scratchLayer = new Map<string, GridCell>();
  addPointsToLayer(scratchLayer, points, state.brushColor);
  return createCanvasInteractionPatch(state.interaction, { scratchLayer });
};

export const createAddedScratchPointsPatch = (
  state: Pick<ScratchLayerState, 'brushColor' | 'interaction'>,
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
    createShapePoints(
      tool,
      start,
      end,
      {
        foreground: state.brushColor,
        background: isStaticGridMode(state.canvasMode)
          ? state.brushBackgroundColor
          : state.brushColor,
      },
      options
    )
  );

export const createClearedScratchLayerPatch = (
  interaction: CanvasState['interaction']
): InteractionPatch => createCanvasInteractionPatch(interaction, { scratchLayer: null });
