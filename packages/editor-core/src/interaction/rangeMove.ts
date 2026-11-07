import type { CanvasInteractionState } from './canvasToolRuntime.js';
import type { Point } from '@chardesk/cell-plane/types';

const RANGE_MOVE_DRAG_THRESHOLD_PX = 4;

type RangeMoveState = Extract<CanvasInteractionState, { type: 'rangeMovePending' | 'movingRange' }>;

export const updateRangeMoveInteraction = ({
  state,
  eventDelta,
  currentGrid,
  threshold = RANGE_MOVE_DRAG_THRESHOLD_PX,
}: {
  state: RangeMoveState;
  eventDelta: Point;
  currentGrid: Point;
  threshold?: number;
}): { state: RangeMoveState; preview: boolean } => {
  const accumulated = {
    x: state.accumulated.x + eventDelta.x,
    y: state.accumulated.y + eventDelta.y,
  };
  const intentional = Math.max(Math.abs(accumulated.x), Math.abs(accumulated.y)) >= threshold;

  if (state.type === 'rangeMovePending' && !intentional) {
    return {
      state: { ...state, current: currentGrid, accumulated },
      preview: false,
    };
  }

  return {
    state: {
      type: 'movingRange',
      anchor: state.anchor,
      current: currentGrid,
      accumulated,
    },
    preview: true,
  };
};
